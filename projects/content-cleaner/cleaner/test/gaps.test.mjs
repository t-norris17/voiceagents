// Tests for gap→article matching. Pure token work, no network — this is the logic that decides
// whether publishing an article silently closes a gap, so the threshold needs pinning.
// A false match is the expensive failure: the gap vanishes and nobody writes the article.
import { test } from "node:test";
import assert from "node:assert/strict";
import { overlap, topicTokens, scoreMatch, MATCH_THRESHOLD } from "../lib/gaps.js";

test("stop words are stripped so question scaffolding doesn't create false overlap", () => {
  const t = topicTokens("How do I change my contribution?");
  assert.ok(t.has("change"));
  assert.ok(t.has("contribution"));
  for (const w of ["how", "the", "you", "your"]) assert.ok(!t.has(w), `${w} should be a stop word`);
});

test("the same question worded differently matches", () => {
  assert.ok(overlap("Can I take a loan from my 401(k)?", "Can I take a loan against my 401(k)?") >= MATCH_THRESHOLD);
});

test("two questions that share only scaffolding do NOT match", () => {
  // This is the failure the stop list exists to prevent — both are "how do I change my X".
  const s = overlap("How do I change my contribution?", "How do I change my beneficiary?");
  assert.ok(s < MATCH_THRESHOLD, `expected below ${MATCH_THRESHOLD}, got ${s}`);
});

test("unrelated topics score near zero", () => {
  assert.ok(overlap("Can I take a loan?", "When can I join the plan?") < 0.2);
});

test("an article matches on its candidate questions, not just its title", () => {
  const article = {
    title: "Borrowing against your retirement savings",
    candidate_questions: ["Can I take a loan from my 401(k)?", "How much can I borrow?"],
  };
  // The title alone shares almost nothing with the caller's phrasing...
  assert.ok(overlap("Can I take a loan from my 401(k)?", article.title) < MATCH_THRESHOLD);
  // ...but the candidate questions are exactly what callers say.
  assert.ok(scoreMatch("Can I take a loan from my 401(k)?", article) >= MATCH_THRESHOLD);
});

test("a missing or empty candidate_questions list is harmless", () => {
  assert.equal(scoreMatch("anything", { title: "", candidate_questions: null }), 0);
  assert.equal(scoreMatch("", { title: "Loans", candidate_questions: [] }), 0);
});

test("overlap is symmetric", () => {
  const a = "Can I take a loan from my 401(k)?", b = "Taking a loan from your 401(k)";
  assert.equal(overlap(a, b), overlap(b, a));
});

test("an article about a neighbouring topic doesn't close the gap", () => {
  // Hardship withdrawals and loans both involve getting money out; they are not the same article.
  const article = { title: "Can I take a hardship withdrawal?", candidate_questions: ["Hardship withdrawal rules"] };
  assert.ok(scoreMatch("Can I take a loan from my 401(k)?", article) < MATCH_THRESHOLD);
});
