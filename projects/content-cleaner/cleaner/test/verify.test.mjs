// Tests for the quote checker. It sits between the critic's opinion and the score, so both of its
// error modes are expensive: waving through a fabricated citation, or refusing to find text that
// is plainly there. These pin both edges. Run: `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { norm, quoteFoundIn, claimCorroborated, resolveVerdict } from "../lib/verify.js";

const SOURCE = `MERIDIAN SAMPLE 401(k) PLAN — PARTICIPANT GUIDE

LOANS
Participants may borrow from their vested account balance. The minimum loan is $1,000. The maximum
is the lesser of $50,000 or 50% of your vested balance. A $75 loan setup fee is deducted from the
loan proceeds. Only one loan may be outstanding at a time.

ENROLLMENT
New employees are automatically enrolled at 4% of pay beginning with the first payroll after 30
days of service. You may opt out at any time by contacting the recordkeeper at 800-555-0142.`;

const S = norm(SOURCE);

test("an exact quote is found", () => {
  assert.equal(quoteFoundIn(S, "The minimum loan is $1,000."), true);
});

test("typography and line wrapping don't hide a real quote", () => {
  // Curly quotes, an em dash, and a hard line break mid-sentence — all normal after a PDF extract.
  assert.equal(quoteFoundIn(S, "The maximum is the lesser of $50,000 or 50% of your\n   vested balance."), true);
  assert.equal(quoteFoundIn(S, "A $75 loan setup fee is deducted from the loan proceeds."), true);
});

test("a quote the source never contained is rejected", () => {
  assert.equal(quoteFoundIn(S, "Loans are repaid over a five-year term by payroll deduction."), false);
});

test("words scattered across the document are not a quote", () => {
  // Every content word here appears somewhere in the source, but never together.
  assert.equal(quoteFoundIn(S, "The minimum enrollment balance is deducted after 30 days of service."), false);
});

test("a quote too short to prove anything returns null, not a verdict", () => {
  assert.equal(quoteFoundIn(S, "loans"), null);
  assert.equal(quoteFoundIn(S, ""), null);
});

test("corroboration needs every figure in the claim to appear in the source", () => {
  assert.equal(claimCorroborated(S, "The loan setup fee is $75."), true);
  assert.equal(claimCorroborated(S, "The loan setup fee is $100."), false);
  // Figures written out as words aren't figures — this is a text match, not a parser.
  assert.equal(claimCorroborated(S, "Only one loan may be outstanding at a time."), true);
  assert.equal(claimCorroborated(S, "Hardship withdrawals require documentation of financial need."), false);
});

test("a fabricated citation never counts as support", () => {
  const r = resolveVerdict({ verdict: "supported", claim: "Loans are repaid over five years.", source_quote: "Loans are repaid over a five-year term." }, S);
  assert.equal(r.verdict, "unverified");
  assert.match(r.why, /isn't in your document/);
});

test("a real citation counts as support", () => {
  const r = resolveVerdict({ verdict: "supported", claim: "The minimum loan is one thousand dollars.", source_quote: "The minimum loan is $1,000." }, S);
  assert.equal(r.verdict, "supported");
});

test("a claim the critic missed but the document contains becomes 'check this', not a penalty", () => {
  const r = resolveVerdict({ verdict: "unsupported", claim: "There is a $75 loan setup fee.", source_quote: "" }, S);
  assert.equal(r.verdict, "unverified");
});

test("a claim the document really doesn't contain stays unsupported", () => {
  const r = resolveVerdict({ verdict: "unsupported", claim: "Loans must be repaid within five years of the origination date.", source_quote: "" }, S);
  assert.equal(r.verdict, "unsupported");
});

test("a contradiction has to show the conflicting text", () => {
  assert.equal(resolveVerdict({ verdict: "contradicted", claim: "The fee is $100.", source_quote: "A $75 loan setup fee is deducted from the loan proceeds." }, S).verdict, "contradicted");
  assert.equal(resolveVerdict({ verdict: "contradicted", claim: "The fee is $100.", source_quote: "The loan setup fee is $60 per loan." }, S).verdict, "unverified");
});
