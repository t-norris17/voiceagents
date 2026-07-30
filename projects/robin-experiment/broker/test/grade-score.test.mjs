// Tests for the grader's arithmetic — the layer that decides what a finding COSTS.
// The LLM supplies evidence; this file proves the evidence turns into the right number.
// Pure, no API key. Run: `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAnswer } from "../lib/score.js";

const clean = {
  claims: [
    { claim: "The plan allows loans.", source_quote: "Participants may borrow from their vested balance.", verdict: "supported" },
    { claim: "There's a $75 origination fee.", source_quote: "a $75 origination fee", verdict: "supported" },
  ],
  answered_the_question: true, complete: true, appropriately_routed: true, note: "",
};
const withClaims = (verdict, n = 1) => ({
  ...clean,
  claims: [...clean.claims, ...Array.from({ length: n }, (_, i) => ({ claim: `c${i}`, source_quote: "", verdict }))],
});

test("a fully grounded answer scores 5 and reads as grounded", () => {
  const s = scoreAnswer(clean, true);
  assert.equal(s.score, 5);
  assert.equal(s.grounding, "grounded");
  assert.equal(s.rating, "good");
  assert.deepEqual(s.deductions, []);
});

test("one unsupported claim costs 2 and flips grounding", () => {
  const s = scoreAnswer(withClaims("unsupported"), true);
  assert.equal(s.score, 3);
  assert.equal(s.grounding, "unsupported");
  assert.equal(s.unsupported, 1);
});

test("a contradiction costs more than an unsupported claim, and outranks it", () => {
  const c = scoreAnswer(withClaims("contradicted"), true);
  assert.equal(c.score, 2);
  assert.equal(c.grounding, "contradicted");
  assert.ok(c.score < scoreAnswer(withClaims("unsupported"), true).score);
  // contradiction wins the grounding label even when an unsupported claim is also present
  const both = scoreAnswer({ ...clean, claims: [
    { claim: "a", source_quote: "", verdict: "unsupported" },
    { claim: "b", source_quote: "x", verdict: "contradicted" },
  ] }, true);
  assert.equal(both.grounding, "contradicted");
});

test("the score floors at 1 no matter how bad the answer is", () => {
  assert.equal(scoreAnswer(withClaims("contradicted", 9), true).score, 1);
});

test("judgment failures cost less than factual ones", () => {
  assert.equal(scoreAnswer({ ...clean, complete: false }, true).score, 4);
  assert.equal(scoreAnswer({ ...clean, appropriately_routed: false }, true).score, 4);
  assert.equal(scoreAnswer({ ...clean, answered_the_question: false }, true).score, 3);
});

test("deductions stack", () => {
  const s = scoreAnswer({ ...withClaims("unsupported"), complete: false, appropriately_routed: false }, true);
  assert.equal(s.score, 1); // 5 - 2 - 1 - 1
  assert.equal(s.deductions.length, 3);
});

test("no retrievable source is reported as no_source, not silently scored as grounded", () => {
  const s = scoreAnswer({ ...clean, claims: [] }, false);
  assert.equal(s.grounding, "no_source");
  assert.equal(s.score, 5); // nothing was found against it — but grounding says why that's cheap
});

test("rating bands line up with the DB's vocabulary", () => {
  assert.equal(scoreAnswer(clean, true).rating, "good");                       // 5
  // 4 = one material omission. "partial" is the DB's word for incomplete, so that's the right band:
  // only a spotless answer earns "good".
  assert.equal(scoreAnswer({ ...clean, complete: false }, true).rating, "partial"); // 4
  assert.equal(scoreAnswer(withClaims("unsupported"), true).rating, "partial"); // 3
  assert.equal(scoreAnswer(withClaims("contradicted"), true).rating, "wrong");  // 2
  for (const r of ["good", "partial", "wrong"]) assert.ok(["good", "partial", "wrong", "unrated"].includes(r));
});

test("a malformed result can't crash a run or silently score 5 as grounded", () => {
  assert.equal(scoreAnswer({}, false).grounding, "no_source");
  assert.equal(scoreAnswer(null, false).score, 5);
  assert.equal(scoreAnswer(undefined, true).grounding, "grounded"); // no claims found against it
});

test("an account figure left out of claims doesn't drag the score down", () => {
  // Balances come from get_balance, not a document. The prompt tells the grader to omit them;
  // this pins that omitting them is harmless rather than counted as missing evidence.
  const s = scoreAnswer({ ...clean, claims: [] }, true);
  assert.equal(s.score, 5);
  assert.equal(s.grounding, "grounded");
});
