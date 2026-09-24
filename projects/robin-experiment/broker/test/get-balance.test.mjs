// What get_balance may and may not tell Robin about a loan.
//
// Two things this file protects. The caller's OWN loan figures are a system-of-record read and Robin
// says them exactly. And her borrowing LIMIT is computed here, so she quotes it instead of working it
// out: left to the arithmetic she said $107,453 for a $50,000 limit on six customer-wave calls. A bug
// here doesn't crash; it makes a compliance-gated agent quote a wrong dollar figure that reads as
// fine in a transcript.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test";
const { shapeBalance, loanLimit } = await import("../api/get_balance.js");

// Marcus, member 90002 — the figures actually seeded in member_loans.
const marcus = {
  plan_name: "NestEgg U Retirement Plan", balance_cents: 2731815,
  vested_balance_cents: 1912270, fully_vested: false, outstanding_loan: true, deferral_pct: "6.00",
};
const marcusLoan = {
  purpose: "general", principal_cents: 800000, balance_cents: 549037, interest_rate_pct: "8.500",
  payment_cents: 7564, payment_frequency: "biweekly", payments_made: 47, payments_remaining: 83,
  next_payment_date: "2026-09-18", maturity_date: "2029-11-09",
};

test("a loan row gives Robin the figures she was missing", () => {
  const r = shapeBalance(marcus, marcusLoan);
  assert.equal(r.loan.balance, "$5,490.37");
  assert.equal(r.loan.payment, "$75.64");
  assert.equal(r.loan.payment_frequency, "biweekly");
  assert.equal(r.loan.payments_remaining, 83);
  assert.equal(r.loan.payoff_date, "November 9, 2029");
  assert.equal(r.loan.next_payment_date, "September 18, 2026");
  assert.equal(r.loan.interest_rate_pct, 8.5);
});

test("loan money keeps its cents", () => {
  // dollars() rounds to whole dollars on purpose and is right for a balance. Reusing it here would
  // have Robin quote "$75" for a $75.64 payment and "$5,490" for a $5,490.37 principal.
  const r = shapeBalance(marcus, marcusLoan);
  assert.match(r.loan.balance, /\.\d\d$/);
  assert.match(r.loan.payment, /\.\d\d$/);
  assert.match(r.loan.original_amount, /\.\d\d$/);
  assert.equal(r.loan.original_amount, "$8,000.00");
});

test("a date is spoken, not read out as digits, and does not drift a day", () => {
  // new Date("2029-11-09") is UTC midnight; rendering it in a negative-offset zone without
  // timeZone:"UTC" yields November 8. Vercel functions are not guaranteed to run in UTC.
  const r = shapeBalance(marcus, marcusLoan);
  assert.equal(r.loan.payoff_date, "November 9, 2029");
  assert.doesNotMatch(r.loan.payoff_date, /2029-11/);
});

test("no loan flag means no loan object, whatever rows exist", () => {
  const dana = { ...marcus, outstanding_loan: false };
  assert.equal(shapeBalance(dana, null).loan, null);
  // members.outstanding_loan stays authoritative. A stale row must not resurrect a paid-off loan.
  assert.equal(shapeBalance(dana, marcusLoan).loan, null);
});

test("flagged but no detail row degrades to the old behaviour, it does not invent figures", () => {
  // Eight seeded members are flagged outstanding_loan with no member_loans row. They must keep
  // behaving exactly as before: a loan exists, the specifics route to a specialist.
  for (const missing of [null, undefined]) {
    const r = shapeBalance(marcus, missing);
    assert.equal(r.outstanding_loan, true);
    assert.equal(r.loan, null);
  }
});

// ---- The borrowing limit -------------------------------------------------------------------------
// Fixed "today" so the 12-month window cannot drift with the calendar.
const TODAY = new Date("2026-09-24T15:00:00Z");
const member = (vestedCents, extra = {}) => ({ ...marcus, outstanding_loan: false, vested_balance_cents: vestedCents, ...extra });
const paidOff = (principalCents, paidOffOn) => ({ status: "paid_off", principal_cents: principalCents, paid_off_on: paidOffOn });

test("Priya: the $50,000 cap binds, not half her balance", () => {
  // The exact case Robin got wrong: 50% of $214,905.62 is $107,452.81, and the limit is $50,000.
  const lim = loanLimit(member(21490562), [], TODAY);
  assert.deepEqual(lim, { loan_eligible: true, max_loan: "$50,000", loan_limit_reason: null });
  assert.doesNotMatch(JSON.stringify(shapeBalance(member(21490562), null, lim)), /107/);
});

test("half the balance binds below $100,000 vested", () => {
  assert.equal(loanLimit(member(6000000), [], TODAY).max_loan, "$30,000");
});

test("an active loan means no new loan, whatever the balance", () => {
  // members.outstanding_loan alone is enough, even with no detail row and a failed lookup.
  assert.deepEqual(loanLimit(marcus, [], TODAY), { loan_eligible: false, max_loan: null, loan_limit_reason: "existing_loan" });
  assert.equal(loanLimit(marcus, null, TODAY).loan_limit_reason, "existing_loan");
  // An active row counts even if the member flag disagrees: never offer a second loan.
  assert.equal(loanLimit(member(21490562), [{ status: "active", principal_cents: 800000 }], TODAY).loan_limit_reason, "existing_loan");
});

test("under the $1,000 minimum is not eligible", () => {
  assert.deepEqual(loanLimit(member(90000), [], TODAY), { loan_eligible: false, max_loan: null, loan_limit_reason: "below_minimum" });
});

test("exactly at the minimum is eligible, rounded down to the dollar", () => {
  // $2,001 vested: half is $1,000.50, which rounds DOWN to $1,000, never up.
  assert.equal(loanLimit(member(200100), [], TODAY).max_loan, "$1,000");
  // $1,999.99 vested: half is $999.99, under the minimum.
  assert.equal(loanLimit(member(199999), [], TODAY).loan_limit_reason, "below_minimum");
});

test("a loan paid off in the past 12 months lowers the cap", () => {
  // Elena, 90004: $150,000 vested, $20,000 loan paid off 2026-03-20. $50,000 - $20,000 = $30,000.
  assert.equal(loanLimit(member(15000000), [paidOff(2000000, "2026-03-20")], TODAY).max_loan, "$30,000");
  // Same history on Priya's balance: still $30,000, the reduced cap binds.
  assert.equal(loanLimit(member(21490562), [paidOff(2000000, "2026-03-20")], TODAY).max_loan, "$30,000");
});

test("a loan paid off more than 12 months ago does not", () => {
  assert.equal(loanLimit(member(21490562), [paidOff(2000000, "2025-07-24")], TODAY).max_loan, "$50,000");
  // Boundary: paid off exactly 12 months ago is still inside the window.
  assert.equal(loanLimit(member(21490562), [paidOff(2000000, "2025-09-24")], TODAY).max_loan, "$30,000");
});

test("a defaulted loan goes to a specialist, not a figure", () => {
  const lim = loanLimit(member(21490562), [{ status: "defaulted", principal_cents: 500000 }], TODAY);
  assert.deepEqual(lim, { loan_eligible: null, max_loan: null, loan_limit_reason: "needs_specialist" });
});

test("a failed loan lookup never produces a figure", () => {
  // Unknown history could hide a recent payoff, so an unknown is never read as "no loans".
  assert.deepEqual(loanLimit(member(21490562), null, TODAY), { loan_eligible: null, max_loan: null, loan_limit_reason: "needs_specialist" });
  // And shapeBalance without a limit defaults to the same, not to a computed number.
  assert.equal(shapeBalance(member(21490562), null).max_loan, null);
});

test("the payload carries the limit fields and the minimum", () => {
  const r = shapeBalance(member(21490562), null, loanLimit(member(21490562), [], TODAY));
  assert.equal(r.loan_eligible, true);
  assert.equal(r.max_loan, "$50,000");
  assert.equal(r.min_loan, "$1,000");
  assert.equal(r.loan_limit_reason, null);
});

test("the plan-level figures are untouched by the loan change", () => {
  const r = shapeBalance(marcus, marcusLoan);
  assert.equal(r.balance, "$27,318");          // whole dollars, as before
  assert.equal(r.vested_balance, "$19,123");
  assert.equal(r.fully_vested, false);
  assert.equal(r.deferral_pct, 6);
});
