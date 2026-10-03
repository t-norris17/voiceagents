import { test } from "node:test";
import assert from "node:assert/strict";
import { gaugeView, visible, FOLD } from "../lib/utilization-view.js";

test("a number built from some of the interactions is a floor and says so", () => {
  const v = gaugeView({ used: 12, total: 33, coverage: 41 / 170 });
  assert.equal(v.pct, 36); assert.equal(v.lead, "At least"); assert.match(v.note, /floor/);
  assert.equal(v.caption, "12 of 33 topics used"); assert.equal(v.coveragePct, 24);
});
test("only a fully graded window drops the qualifier", () => {
  const v = gaugeView({ used: 12, total: 33, coverage: 1 });
  assert.equal(v.lead, ""); assert.equal(v.note, null); assert.equal(v.complete, true);
});
test("no topics means no number to qualify", () => {
  const v = gaugeView({ used: 0, total: 0, coverage: 0.3 });
  assert.equal(v.pct, 0); assert.equal(v.lead, ""); assert.equal(v.caption, "No topics found");
});
test("missing or odd input does not break the page", () => {
  assert.equal(gaugeView(null).pct, 0);
  assert.equal(gaugeView({ used: 5, total: 10, coverage: 7 }).coveragePct, 100);
});
test("the never-used list folds after a handful", () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  assert.equal(visible(list, false).length, FOLD); assert.equal(visible(list, true).length, 20);
});

import { docLabel } from "../lib/utilization-view.js";
test("document names lose ElevenLabs' trailing dots and the shared Vertex prefix", () => {
  assert.equal(docLabel("Vertex Manufacturing 401(k) — Loans..."), "Loans");
  assert.equal(docLabel("Vertex Manufacturing 401(k) Retirement Savings..."), "Retirement Savings");
  assert.equal(docLabel("KBA — Reset Your NestEgg..."), "KBA — Reset Your NestEgg");
  assert.equal(docLabel("Vertex Manufacturing 401(k)"), "Vertex Manufacturing 401(k)", "never reduces a name to nothing");
});

import { coverageView, readLine, sectionNote } from "../lib/utilization-view.js";
test("the coverage strip counts measured interactions and names the ones graded without a source", () => {
  const c = coverageView({ interactions: 170, graded: 41, measured: 15, unmeasurable: 26 });
  assert.equal(c.line, "15 of 170 interactions measured");
  assert.match(c.unmeasurableLine, /^26 more were graded before their documents could be read$/);
  assert.equal(coverageView({ interactions: 10, measured: 10, unmeasurable: 0 }).unmeasurableLine, null);
  assert.match(coverageView({ interactions: 10, measured: 1, unmeasurable: 1 }).unmeasurableLine, /^1 more was graded/);
  assert.equal(coverageView({ interactions: 10, graded: 4 }).line, "4 of 10 interactions measured", "the old response shape still reads");
});
test("a document says how often Robin read it and how often she used it", () => {
  assert.equal(readLine({ read_in: 150, used_in: 40 }), "Read in 150, used in 40 interactions");
  assert.equal(readLine({}), "Read in 0, used in 0 interactions");
});
test("a topic says what cited it, or why nothing did, without claiming more than is known", () => {
  const doc = { read_in: 120, used_in: 30 };
  assert.equal(sectionNote(doc, { used: true, count: 1, questions: [] }), "Quoted in 1 measured answer.");
  assert.equal(sectionNote(doc, { used: true, count: 3, questions: ["How much can I borrow?"] }), "Quoted in 3 measured answers. Asked as: “How much can I borrow?”.");
  assert.match(sectionNote(doc, { used: false }), /read this document in 120 interactions and used it in 30, but no measured answer quoted this section\. It may not have been asked about/);
  assert.match(sectionNote({ read_in: 0, used_in: 0 }, { used: false }), /never retrieved this document/);
  assert.match(sectionNote(undefined, { used: false }), /never retrieved/);
});
