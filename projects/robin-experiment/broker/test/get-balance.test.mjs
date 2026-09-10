// What get_balance may and may not tell Robin about a loan.
//
// The distinction this file protects: the caller's OWN loan figures are a system-of-record read and
// Robin may say them; plan loan RULES (how much can I borrow, over how long) are unpublished and she
// may not. A bug here doesn't crash — it makes a compliance-gated agent quote a number it shouldn't,
// or drop cents off a payment amount, which is the kind of defect that reads as fine in a transcript.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test";
const { shapeBalance } = await import("../api/get_balance.js");

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

test("no loan limit is ever returned, under any input", () => {
  // The enrollment packet publishes no limits. If a limit field ever appears in this payload, Robin
  // will quote it, and the routing behaviour the KBA depends on is gone.
  const blob = JSON.stringify(shapeBalance(marcus, marcusLoan));
  for (const banned of ["max_loan", "limit", "available_to_borrow", "borrowable"]) {
    assert.doesNotMatch(blob, new RegExp(banned, "i"), `payload must not carry ${banned}`);
  }
});

test("the plan-level figures are untouched by the loan change", () => {
  const r = shapeBalance(marcus, marcusLoan);
  assert.equal(r.balance, "$27,318");          // whole dollars, as before
  assert.equal(r.vested_balance, "$19,123");
  assert.equal(r.fully_vested, false);
  assert.equal(r.deferral_pct, 6);
});
