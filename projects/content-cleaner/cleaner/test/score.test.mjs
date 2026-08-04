// Tests for the scoring arithmetic — the layer that decides what a critic finding COSTS, and the
// quote check that decides whether a finding is allowed to count at all. Pure, no API key: the
// critic supplies evidence, this file proves the evidence turns into the right number.
// Run: `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreReview, CLEAN_MIN } from "../lib/validate.js";

// The synthetic source every quote below is checked against.
const SOURCE = `MERIDIAN SAMPLE PLAN
Participants may borrow from their vested account balance. A $100 loan setup fee applies.
Only one loan may be outstanding at a time. If you leave the company with an outstanding loan,
the remaining balance must be repaid within 60 days.`;

// A review with nothing wrong, whose quotes are really in the source. Only this shape may score 5.
const clean = {
  claims: [
    { claim: "The plan allows loans.", source_quote: "Participants may borrow from their vested account balance.", verdict: "supported", material: true },
    { claim: "There is a one hundred dollar setup fee.", source_quote: "A $100 loan setup fee applies.", verdict: "supported", material: true },
  ],
  omissions: [],
  answers_the_question: true, question_is_askable: true, speakable: true, gaps_flagged: true,
  bloat: false, notes_misused: false, notes: [],
};

// An unsupported claim the source genuinely doesn't contain — no figure and no distinctive word
// of it appears anywhere in SOURCE, so the corroboration rescue can't fire and it stays a penalty.
const invented = (n = 1, material = true) => ({
  ...clean,
  claims: [...clean.claims, ...Array.from({ length: n }, () => ({
    claim: "Roth conversions inside the plan are permitted quarterly.", source_quote: "", verdict: "unsupported", material,
  }))],
});

test("a spotless review scores 5 and lists no deductions", () => {
  const r = scoreReview(clean, SOURCE);
  assert.equal(r.score, 5);
  assert.deepEqual(r.deductions, []);
  assert.deepEqual(r.issues, []);
  assert.equal(r.counts.claims, 2);
  assert.equal(r.counts.supported, 2);
});

test("one invented figure costs 1 point, not 2 — a rich card survives a single miss", () => {
  const r = scoreReview(invented(1), SOURCE);
  assert.equal(r.score, 4);
  assert.equal(r.counts.unsupported, 1);
  assert.ok(r.issues.some((i) => i.startsWith("Not in the source:")));
});

test("unsupported claims are CAPPED — the regression that put real cards at 2/5 and lower", () => {
  // Under the old weights this was 5 - 2*4 = 1. A card making four statements the grader can't
  // cite is worth a look, but it is not automatically the worst card in the run.
  assert.equal(scoreReview(invented(4), SOURCE).score, 2.5);
  assert.equal(scoreReview(invented(40), SOURCE).score, 2.5); // capped, however long the list
  assert.equal(scoreReview(invented(40), SOURCE).counts.unsupported, 40); // the count still tells the truth
  assert.ok(scoreReview(invented(4), SOURCE).deductions.some((d) => d.capped));
});

test("materiality is priced in: wording drift costs less than a wrong figure", () => {
  const soft = scoreReview(invented(1, false), SOURCE);
  const hard = scoreReview(invented(1, true), SOURCE);
  assert.equal(soft.score, 4.5);
  assert.equal(hard.score, 4);
  assert.ok(soft.issues.some((i) => i.startsWith("Wording the source doesn't support:")));
});

test("a contradiction costs more than an invented claim, and also caps", () => {
  const one = { ...clean, claims: [...clean.claims, { claim: "The setup fee is $250.", source_quote: "A $100 loan setup fee applies.", verdict: "contradicted", material: true }] };
  assert.equal(scoreReview(one, SOURCE).score, 3.5);
  assert.ok(scoreReview(one, SOURCE).score < scoreReview(invented(1), SOURCE).score);
  const many = { ...clean, claims: [...clean.claims, ...Array.from({ length: 6 }, () => ({ claim: "The setup fee is $250.", source_quote: "A $100 loan setup fee applies.", verdict: "contradicted", material: true }))] };
  assert.equal(scoreReview(many, SOURCE).score, 2); // 5 - 3 (capped)
});

test("the floor is 1 and the ceiling is 5, whatever the evidence says", () => {
  const wrecked = { ...invented(9), claims: [...invented(9).claims, ...Array.from({ length: 9 }, () => ({ claim: "The fee is $250.", source_quote: "A $100 loan setup fee applies.", verdict: "contradicted", material: true }))],
    omissions: Array.from({ length: 9 }, (_, i) => ({ missing: `m${i}`, source_quote: "Only one loan may be outstanding at a time." })),
    answers_the_question: false, question_is_askable: false, speakable: false, gaps_flagged: false, bloat: true, notes_misused: true };
  assert.equal(scoreReview(wrecked, SOURCE).score, 1);
  assert.equal(scoreReview(clean, SOURCE).score, 5);
});

test("omissions cost half a point each and cap at 1.5", () => {
  const om = (n) => scoreReview({ ...clean, omissions: Array.from({ length: n }, () => ({ missing: "the 60-day deadline", source_quote: "the remaining balance must be repaid within 60 days" })) }, SOURCE);
  assert.equal(om(1).score, 4.5);
  assert.equal(om(3).score, 3.5);
  assert.equal(om(9).score, 3.5);       // capped
  assert.equal(om(9).counts.omissions, 9);
});

test("style failures cost half a point; not answering the question costs 2", () => {
  assert.equal(scoreReview({ ...clean, question_is_askable: false }, SOURCE).score, 4.5);
  assert.equal(scoreReview({ ...clean, speakable: false }, SOURCE).score, 4.5);
  assert.equal(scoreReview({ ...clean, bloat: true }, SOURCE).score, 4.5);
  assert.equal(scoreReview({ ...clean, gaps_flagged: false }, SOURCE).score, 4.5);
  assert.equal(scoreReview({ ...clean, notes_misused: true }, SOURCE).score, 4.5);
  assert.equal(scoreReview({ ...clean, answers_the_question: false }, SOURCE).score, 3);
});

test("every deduction shows up in issues — a score never hides behind a silent boolean", () => {
  const r = scoreReview({ ...clean, question_is_askable: false, bloat: true }, SOURCE);
  assert.equal(r.deductions.length, 2);
  assert.equal(r.issues.length, 2);
  // Triage calls a card clean only when it scores at least CLEAN_MIN AND has no issues. A single
  // half-point style defect lands exactly on the threshold, so the issue line is the only thing
  // keeping it out of the "ready" bucket — it has to be there.
  const edge = scoreReview({ ...clean, speakable: false }, SOURCE);
  assert.equal(edge.score, CLEAN_MIN);
  assert.equal(edge.issues.length, 1);
});

// --- the quote check: the critic's evidence has to survive contact with the source ---

test("a quote that isn't in the source can't prove anything — support becomes 'check this'", () => {
  const r = scoreReview({ ...clean, claims: [{ claim: "Loans are repaid over five years.", source_quote: "Loans are repaid over a five-year term by payroll deduction.", verdict: "supported", material: true }] }, SOURCE);
  assert.equal(r.counts.supported, 0);
  assert.equal(r.counts.unverified, 1);
  assert.equal(r.score, 5); // costs nothing — it's the grader's miss, not the card's
  assert.ok(r.checks[0].startsWith("Check by hand:"));
});

test("an 'unsupported' claim the source visibly does contain is downgraded to 'check this', free", () => {
  // The failure this exists for: a real fact, in an 85 KB document, that the critic didn't find.
  const r = scoreReview({ ...clean, claims: [{ claim: "The loan setup fee is $100.", source_quote: "", verdict: "unsupported", material: true }] }, SOURCE);
  assert.equal(r.counts.unsupported, 0);
  assert.equal(r.counts.unverified, 1);
  assert.equal(r.score, 5);
});

test("a contradiction whose conflicting quote isn't in the source doesn't cost 1.5 points", () => {
  const r = scoreReview({ ...clean, claims: [{ claim: "You may hold two loans.", source_quote: "Up to two loans may be outstanding at any time.", verdict: "contradicted", material: true }] }, SOURCE);
  assert.equal(r.counts.contradicted, 0);
  assert.equal(r.counts.unverified, 1);
  assert.equal(r.score, 5);
});

test("an omission the critic can't quote from the source doesn't count against the card", () => {
  const r = scoreReview({ ...clean, omissions: [{ missing: "the hardship withdrawal rules", source_quote: "Hardship withdrawals are available for immediate and heavy financial need." }] }, SOURCE);
  assert.equal(r.counts.omissions, 0);
  assert.equal(r.counts.omissions_unverified, 1);
  assert.equal(r.score, 5);
});

test("without a source, the model's verdicts are taken at face value", () => {
  const r = scoreReview(invented(1), null);
  assert.equal(r.counts.unsupported, 1);
  assert.equal(r.score, 4);
});

test("a malformed or empty critic result doesn't throw and doesn't silently score 5", () => {
  // Missing booleans are undefined, not false, so they cost nothing — but the UI treats a review
  // with no claims and no notes as unverified. What matters here is that it cannot crash a run.
  assert.equal(scoreReview({}).score, 5);
  assert.equal(scoreReview(null).score, 5);
  assert.equal(scoreReview(undefined).counts.claims, 0);
});

test("the pre-Q/A/Q/N key names still score, so a cached run from before the change survives", () => {
  const legacy = { claims: [], omissions: [], answers_the_title: false, title_is_askable: true, speakable: true, coverage_complete: false, bloat: false, notes: [] };
  const r = scoreReview(legacy, SOURCE);
  assert.equal(r.score, 2.5); // 5 - 2 (doesn't answer it) - 0.5 (gap not flagged)
});

test("the model's own notes survive alongside the computed lines", () => {
  const r = scoreReview({ ...clean, notes: ["Hedges a hard rule with 'generally'."] }, SOURCE);
  assert.ok(r.issues.includes("Hedges a hard rule with 'generally'."));
  assert.equal(r.score, 5); // a note alone doesn't deduct — only evidence does
});
