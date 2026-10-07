import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, currentTurn, ticks, nextSpeed, speedLabel, seekFromX } from "../lib/player-view.js";

test("clock", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(7.9), "0:07");
  assert.equal(clock(98), "1:38");
  assert.equal(clock(600), "10:00");
  assert.equal(clock(3725), "1:02:05");
  assert.equal(clock(-3), "0:00");
  assert.equal(clock(NaN), "0:00");
});

const TURNS = [
  { role: "agent", at: 0, text: "Thank you for calling" },
  { role: "caller", at: 7, text: "Hi" },
  { role: "agent", at: null, text: "(no timestamp)" },
  { role: "agent", at: 11, text: "Thanks" },
];

test("the current line is the last one that has started; untimed lines are skipped", () => {
  assert.equal(currentTurn(TURNS, 0), 0);
  assert.equal(currentTurn(TURNS, 6.9), 0);
  assert.equal(currentTurn(TURNS, 7), 1);
  assert.equal(currentTurn(TURNS, 10.9), 1, "the untimed line is never current");
  assert.equal(currentTurn(TURNS, 10.97), 3, "a line counts as started 50 ms early, so a click on it highlights it at once");
  assert.equal(currentTurn(TURNS, 500), 3);
  assert.equal(currentTurn([{ role: "agent", at: 2 }], 1), -1);
  assert.equal(currentTurn([], 5), -1);
});

test("ticks sit at each timed turn, clamped to the bar, caller marked", () => {
  assert.deepEqual(ticks(TURNS, 20), [
    { pct: 0, role: "agent" }, { pct: 35, role: "caller" }, { pct: 55, role: "agent" },
  ]);
  assert.deepEqual(ticks([{ role: "caller", at: 30 }], 20), [{ pct: 100, role: "caller" }]);
  assert.deepEqual(ticks(TURNS, 0), []);
});

test("speed cycles 1, 1.5, 2", () => {
  assert.equal(nextSpeed(1), 1.5);
  assert.equal(nextSpeed(1.5), 2);
  assert.equal(nextSpeed(2), 1);
  assert.equal(nextSpeed(3), 1);
  assert.equal(speedLabel(1.5), "1.5×");
});

test("a pointer on the bar maps to seconds, clamped", () => {
  const rect = { left: 100, width: 200 };
  assert.equal(seekFromX(200, rect, 300), 150);
  assert.equal(seekFromX(50, rect, 300), 0);
  assert.equal(seekFromX(999, rect, 300), 300);
  assert.equal(seekFromX(200, { left: 0, width: 0 }, 300), 0);
});
