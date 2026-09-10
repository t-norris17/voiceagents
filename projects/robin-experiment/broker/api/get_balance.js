// POST /api/get_balance  { subject_ref }  ->  the verified caller's own plan figures.
// Call ONLY after verify_caller. Keyed by the opaque subject_ref (members.id).
//
// Deliberately does NOT return a loan LIMIT — the enrollment guide publishes none, so Robin routes
// "how much can I borrow" to a specialist rather than quoting a figure. It DOES return the caller's
// existing loan detail when a member_loans row exists: their own balance and payment schedule are a
// system-of-record read about their account, the same category as their account balance, and need no
// published plan language. The two are different questions and only one of them is answerable.
import { sb } from "../lib/supabase.js";
import { dollars, dollarsExact, spokenDate } from "../lib/parse.js";

// Pure, so the branches are testable without a database. Exported for test/get-balance.test.mjs.
// `m` is the members row, `l` the active member_loans row or null/undefined.
export function shapeBalance(m, l) {
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
    let loan = null;
    if (m.outstanding_loan) {
      const loans = await sb(
        `member_loans?subject_ref=eq.${ref}&status=eq.active&limit=1` +
          `&select=purpose,principal_cents,balance_cents,interest_rate_pct,payment_cents,` +
          `payment_frequency,payments_made,payments_remaining,next_payment_date,maturity_date`
      );
      loan = (loans && loans[0]) || null;
    }

    return res.status(200).json(shapeBalance(m, loan));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
