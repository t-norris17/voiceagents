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
