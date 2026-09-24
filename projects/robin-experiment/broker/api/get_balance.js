// POST /api/get_balance  { subject_ref }  ->  the verified caller's own plan figures.
// Call ONLY after verify_caller. Keyed by the opaque subject_ref (members.id).
//
// It returns the caller's LOAN LIMIT, computed here, so Robin quotes a figure instead of working one
// out. The rule is published in the live Loans KB document (the lesser of $50,000 or 50% of vested,
// the $50,000 reduced by the highest loan balance in the past 12 months, $1,000 minimum, one loan at
// a time). An earlier version of this file withheld limits on the premise that none were published;
// that premise was false, and Robin, left to do the arithmetic, quoted $107,453 for a $50,000 limit
// on at least six customer-wave calls (see BUILD.md, 2026-09-24).
//
// It also returns the caller's existing loan detail when a member_loans row exists: their own balance
// and payment schedule are a system-of-record read, the same category as their account balance.
import { sb } from "../lib/supabase.js";
import { dollars, dollarsExact, spokenDate } from "../lib/parse.js";

const CAP_CENTS = 5_000_000;   // $50,000
const MIN_CENTS = 100_000;     // $1,000

// The borrowing limit, as a pure function of the member row and ALL of their loan rows.
//
// `loans` is null when the loan lookup failed. That is not the same as "no loans": a loan paid off in
// the past 12 months lowers the cap, and not knowing about it would OVERSTATE the limit, so an unknown
// history returns needs_specialist rather than a guess. Checks run in order; the first that applies
// wins. `today` is injectable so the 12-month window is testable.
export function loanLimit(m, loans, today = new Date()) {
  const none = (reason) => ({ loan_eligible: false, max_loan: null, loan_limit_reason: reason });
  // members.outstanding_loan is authoritative for "has a loan", and it does not need the lookup, so it
  // is checked first: a flagged member is ineligible even when the loan rows could not be read.
  if (m.outstanding_loan || (loans || []).some((l) => l.status === "active")) return none("existing_loan");
  if (!Array.isArray(loans)) return { loan_eligible: null, max_loan: null, loan_limit_reason: "needs_specialist" };
  if (loans.some((l) => l.status === "defaulted")) return { loan_eligible: null, max_loan: null, loan_limit_reason: "needs_specialist" };

  // Highest balance in the past 12 months. Principal stands in for it (balance history is not
  // stored), which can only understate the limit. A paid-off row with no date counts, for the same
  // reason; migration 017 makes that row impossible anyway.
  const windowStart = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()));
  const recent = loans.filter(
    (l) => l.status === "paid_off" && (!l.paid_off_on || new Date(`${l.paid_off_on}T00:00:00Z`) >= windowStart)
  );
  const highest = recent.reduce((mx, l) => Math.max(mx, Number(l.principal_cents) || 0), 0);

  const cap = Math.max(0, CAP_CENTS - highest);
  const half = Math.floor(Number(m.vested_balance_cents || 0) / 2);
  const max = Math.floor(Math.min(cap, half) / 100) * 100;   // whole dollars, rounded DOWN
  if (max < MIN_CENTS) return none("below_minimum");
  return { loan_eligible: true, max_loan: dollars(max), loan_limit_reason: null };
}

// Pure, so the branches are testable without a database. Exported for test/get-balance.test.mjs.
// `m` is the members row, `l` the active member_loans row or null/undefined, `lim` a loanLimit()
// result. Left out, the limit is treated as unknown (needs_specialist), never as a figure.
export function shapeBalance(m, l, lim = loanLimit(m, null)) {
  return {
    found: true,
    plan_name: m.plan_name,
    balance: dollars(m.balance_cents),
    vested_balance: dollars(m.vested_balance_cents),
    fully_vested: m.fully_vested,
    outstanding_loan: m.outstanding_loan,
    deferral_pct: Number(m.deferral_pct),
    // null in two cases: no loan at all, or a loan flagged on members with no detail row. Both mean
    // Robin behaves as she did before this field existed — a loan exists, specifics go to a
    // specialist. Only a real row licenses her to quote figures.
    loan: m.outstanding_loan && l ? shapeLoan(l) : null,
    // The borrowing limit. max_loan is the ONLY limit Robin may state; she never computes one.
    loan_eligible: lim.loan_eligible,
    max_loan: lim.max_loan,
    min_loan: dollars(MIN_CENTS),
    loan_limit_reason: lim.loan_limit_reason,
  };
}

function shapeLoan(l) {
  return {
    balance: dollarsExact(l.balance_cents),            // outstanding PRINCIPAL, not a payoff quote
    original_amount: dollarsExact(l.principal_cents),
    interest_rate_pct: Number(l.interest_rate_pct),
    payment: dollarsExact(l.payment_cents),
    payment_frequency: l.payment_frequency,            // "biweekly", via payroll deduction
    payments_made: l.payments_made,
    payments_remaining: l.payments_remaining,
    next_payment_date: spokenDate(l.next_payment_date),
    payoff_date: spokenDate(l.maturity_date),
    purpose: l.purpose,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { subject_ref } = req.body || {};
    if (!subject_ref) return res.status(200).json({ found: false });
    const ref = encodeURIComponent(subject_ref);

    const rows = await sb(
      `members?id=eq.${ref}` +
        `&select=plan_name,balance_cents,vested_balance_cents,fully_vested,outstanding_loan,deferral_pct`
    );
    const m = rows && rows[0];
    if (!m) return res.status(200).json({ found: false });

    // A second explicit query rather than a PostgREST embed on the members select. The embed nests
    // under a response key this code would have to guess at, and a wrong guess reads as undefined —
    // a silent "no loan" instead of a loud failure. Two round trips on a demo backend cost nothing.
    //
    // Its own try/catch, so a loan-detail problem degrades instead of cascading. Without this, one
    // bad response here throws to the outer handler and returns 500 — taking down the BALANCE lookup
    // too, for every member flagged with a loan. Robin would lose figures she has always had in
    // order to gain ones she never had. Falling through to loan:null is exactly her old behaviour.
    //
    // Every loan row, not only the active one: the limit needs paid-off and defaulted loans too.
    // A failed lookup leaves `loans` null, which loanLimit() treats as unknown, never as "none".
    let loans = null;
    try {
      const rows = await sb(
        `member_loans?subject_ref=eq.${ref}` +
          `&select=status,paid_off_on,purpose,principal_cents,balance_cents,interest_rate_pct,payment_cents,` +
          `payment_frequency,payments_made,payments_remaining,next_payment_date,maturity_date`
      );
      loans = Array.isArray(rows) ? rows : null;
    } catch (e) {
      console.error("get_balance: loan lookup failed, degrading to loan:null —", e.message);
    }
    const loan = m.outstanding_loan ? (loans || []).find((l) => l.status === "active") || null : null;

    return res.status(200).json(shapeBalance(m, loan, loanLimit(m, loans)));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
