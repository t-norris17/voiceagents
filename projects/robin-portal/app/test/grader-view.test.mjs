// The words around the paid action on the Accuracy page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tabsFor, runLabel, selectedLabel, gradeSummary, regradeSummary, pickable, sourceTag, isFilter, costText, usageText, oneCost, EST_CENTS } from "../lib/grader-view.js";

test("tabs carry whole-table counts, and the no-source tab appears only when it has something in it", () => {
  const t = tabsFor({ total: 225, graded: 106, ungraded: 119, graded_without_source: 71 });
  assert.deepEqual(t.map((x) => [x.key, x.count]), [["all", 225], ["ungraded", 119], ["graded", 106], ["no_source", 71]]);
  assert.deepEqual(tabsFor({ total: 3, graded: 1, ungraded: 2, graded_without_source: 0 }).map((x) => x.key), ["all", "ungraded", "graded"]);
  assert.deepEqual(tabsFor(null).map((x) => x.count), [null, null, null], "no data yet, no invented numbers");
});

test("the run button says how many it will grade before it is clicked", () => {
  assert.equal(runLabel(119, false), "Grade the newest 10 not graded · about 30 cents");
  assert.equal(runLabel(4, false), "Grade the newest 4 not graded · about 12 cents");
  assert.equal(runLabel(0, false), "Nothing to grade");
  assert.equal(runLabel(119, true), "Grading…");
  assert.equal(selectedLabel(1), "Grade 1 selected · about 3 cents"); assert.equal(selectedLabel(3), "Grade 3 selected · about 9 cents");
});

test("a run reports what it graded, what is left, and every failure by id", () => {
  const s = gradeSummary({ graded: 9, calls_without_source: 0, ungraded_total: 110, failed: [{ conversation_id: "conv_x", error: "model overloaded" }] });
  assert.equal(s.text, "Graded 9 interactions, 110 not graded now.");
  assert.deepEqual(s.failed, [{ id: "conv_x", error: "model overloaded" }]);
  assert.equal(gradeSummary({ graded: 1, ungraded_total: 0 }).text, "Graded 1 interaction, 0 not graded now.");
  assert.match(gradeSummary({ graded: 2, calls_without_source: 2 }).text, /2 could not be checked against a source/);
  assert.equal(gradeSummary({ error: "HTTP 500" }).text, "Grading failed: HTTP 500");
  assert.equal(gradeSummary({ graded: 0, note: "those interactions are already graded, or were not found", failed: [] }).text, "those interactions are already graded, or were not found.");
  assert.equal(gradeSummary(null), null);
});

test("a re-grade says what changed, or that the old grade was kept", () => {
  const ok = { results: [{ replaced: {
    before: [{ grounding: "no_source" }, { grounding: "no_source" }],
    after: [{ grounding: "grounded" }, { grounding: "unsupported" }, { grounding: "grounded" }],
    removed_score_keys: ["old-a", "old-b"], removed_question_keys: [] } }], failed: [] };
  assert.equal(regradeSummary(ok), "Re-graded. Before: 2 answers, 0 checked against a source. Now: 3 answers, 3 checked. Replaced 2 old rows.");
  assert.match(regradeSummary({ failed: [{ error: "boom" }] }), /Re-grade failed: boom\. The old grade was left as it was\./);
  assert.match(regradeSummary({ error: "HTTP 400" }), /Re-grade failed: HTTP 400/);
});

test("only ungraded rows can be picked, and a graded row says what it rests on", () => {
  assert.equal(pickable({ scored_at: null }), true); assert.equal(pickable({ scored_at: "x" }), false);
  assert.equal(sourceTag({ scored_at: "x", source_status: "no_source" }), "no source");
  assert.equal(sourceTag({ scored_at: "x", source_status: "sourced" }), null);
  assert.equal(sourceTag({ scored_at: null, source_status: "ungraded" }), null);
  assert.equal(isFilter("graded"), true); assert.equal(isFilter("drop"), false);
});

test("a run that skipped interactions another run held says so, and that nothing was spent on them", () => {
  assert.equal(gradeSummary({ graded: 6, skipped: 4, ungraded_total: 100 }).text, "Graded 6 interactions, 4 were already being graded by another run, so nothing was spent on them, 100 not graded now.");
  assert.match(gradeSummary({ graded: 3, skipped: 1 }).text, /1 was already being graded by another run, so nothing was spent on it/);
  assert.equal(gradeSummary({ graded: 0, skipped: 3, note: "another run already has these interactions, so nothing was graded and nothing was spent" }).text, "another run already has these interactions, so nothing was graded and nothing was spent.");
  assert.equal(gradeSummary({ graded: 2, skipped: 0 }).text, "Graded 2 interactions.", "no skip, no extra words");
});

test("cost is always an estimate and says so, in cents until it is a dollar or more", () => {
  assert.equal(EST_CENTS, 3);
  assert.equal(costText(1), "about 3 cents"); assert.equal(costText(10), "about 30 cents");
  assert.equal(costText(40), "about $1.20"); assert.equal(costText(0), "about 0 cents");
  assert.equal(oneCost(), "about 3 cents");
});

test("what a run used is shown in tokens, from the model's own report, and not at all when there is none", () => {
  assert.equal(usageText({ input_tokens: 41230, output_tokens: 9100 }), "used 41,230 tokens in and 9,100 out");
  assert.equal(usageText({ input_tokens: 0, output_tokens: 0 }), null); assert.equal(usageText(undefined), null);
  assert.match(gradeSummary({ graded: 2, ungraded_total: 5, usage: { input_tokens: 1000, output_tokens: 500 } }).text, /2 interactions, 5 not graded now, used 1,000 tokens in and 500 out\.$/);
  assert.doesNotMatch(gradeSummary({ graded: 2, ungraded_total: 5 }).text, /tokens/);
  const ok = { results: [{ replaced: { before: [], after: [{ grounding: "grounded" }], removed_score_keys: [], removed_question_keys: [] } }], failed: [], usage: { input_tokens: 10, output_tokens: 2 } };
  assert.match(regradeSummary(ok), /This used 10 tokens in and 2 out\.$/);
});
