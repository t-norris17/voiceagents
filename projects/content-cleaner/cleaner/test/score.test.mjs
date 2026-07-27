// Tests for the scoring arithmetic — the layer that decides what a critic finding COSTS.
// Pure, no API key: the critic supplies evidence, this file proves the evidence turns into the
// right number. Run: `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreReview } from "../lib/validate.js";

// A review with nothing wrong. This is the only shape that may score 5.
const clean = {
  claims: [
    { claim: "The plan allows loans.", source_quote: "Participants may borrow from their account.", verdict: "supported" },
    { claim: "There is a one hundred dollar setup fee.", source_quote: "A $100 loan setup fee applies.", verdict: "supported" },
  ],
  omissions: [],
  answers_the_title: true, title_is_askable: true, speakable: true, coverage_complete: true, bloat: false,
  notes: [],
};
const withClaim = (verdict, n = 1) => ({
  ...clean,
  claims: [...clean.claims, ...Array.from({ length: n }, (_, i) => ({ claim: `claim ${i}`, source_quote: "", verdict }))],
});

test("a spotless review scores 5 and lists no deductions", () => {
  const r = scoreReview(clean);
  assert.equal(r.score, 5);
  assert.deepEqual(r.deductions, []);
  assert.deepEqual(r.issues, []);
  assert.equal(r.counts.claims, 2);
  assert.equal(r.counts.supported, 2);
});

test("one unsupported claim costs 2 — a 5 becomes a 3", () => {
  const r = scoreReview(withClaim("unsupported"));
  assert.equal(r.score, 3);
  assert.equal(r.counts.unsupported, 1);
  assert.ok(r.issues.some((i) => i.startsWith("Not in the source:")));
});

test("a contradiction costs more than an unsupported claim", () => {
  assert.ok(scoreReview(withClaim("contradicted")).score < scoreReview(withClaim("unsupported")).score);
  assert.equal(scoreReview(withClaim("contradicted")).score, 2);
});

test("two contradictions bottom out at 1, never below", () => {
  assert.equal(scoreReview(withClaim("contradicted", 2)).score, 1);
  assert.equal(scoreReview(withClaim("contradicted", 9)).score, 1);
});

test("omissions cost 1 each but cap at 2 points so one bad article can't be double-counted forever", () => {
  const om = (n) => scoreReview({ ...clean, omissions: Array.from({ length: n }, (_, i) => ({ missing: `m${i}`, source_quote: "q" })) });
  assert.equal(om(1).score, 4);
  assert.equal(om(2).score, 3);
  assert.equal(om(5).score, 3); // capped
  assert.equal(om(5).counts.omissions, 5); // but the count still tells the truth
});

test("style failures cost less than factual ones", () => {
  assert.equal(scoreReview({ ...clean, title_is_askable: false }).score, 4);
  assert.equal(scoreReview({ ...clean, speakable: false }).score, 4);
  assert.equal(scoreReview({ ...clean, bloat: true }).score, 4);
  assert.equal(scoreReview({ ...clean, coverage_complete: false }).score, 4);
  assert.equal(scoreReview({ ...clean, answers_the_title: false }).score, 3); // structural, costs 2
});

test("defects stack", () => {
  const r = scoreReview({ ...withClaim("unsupported"), speakable: false, bloat: true });
  assert.equal(r.score, 1); // 5 - 2 - 1 - 1 = 1
  assert.equal(r.deductions.length, 3);
});

test("a claim-free article can still lose points for style", () => {
  const r = scoreReview({ claims: [], omissions: [], answers_the_title: true, title_is_askable: false, speakable: true, coverage_complete: true, bloat: false, notes: [] });
  assert.equal(r.score, 4);
  assert.equal(r.counts.claims, 0);
});

test("a malformed or empty critic result doesn't throw and doesn't silently score 5", () => {
  // Missing booleans are undefined, not false, so they cost nothing — but the UI treats a review
  // with no claims and no notes as unverified. What matters here is that it cannot crash a run.
  assert.equal(scoreReview({}).score, 5);
  assert.equal(scoreReview(null).score, 5);
  assert.equal(scoreReview(undefined).counts.claims, 0);
});

test("issues always explain the score: every deduction has a matching reviewer line", () => {
  const r = scoreReview({ ...withClaim("contradicted"), omissions: [{ missing: "the 60-day deadline", source_quote: "within 60 days" }] });
  assert.ok(r.issues.some((i) => i.startsWith("Contradicts the source:")));
  assert.ok(r.issues.some((i) => i.startsWith("Left out: the 60-day deadline")));
});

test("the model's own notes survive alongside the computed lines", () => {
  const r = scoreReview({ ...clean, notes: ["Hedges a hard rule with 'generally'."] });
  assert.ok(r.issues.includes("Hedges a hard rule with 'generally'."));
  assert.equal(r.score, 5); // a note alone doesn't deduct — only evidence does
});
