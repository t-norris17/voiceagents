import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlice, applySlice, centralMidnight, windowLabel } from "../lib/survey-slice.js";

const WAVES = [
  { wave: "internal", label: "Internal testing", internal: true, started_at: "2026-09-08T05:00:00+00:00", ended_at: "2026-09-21T05:00:00+00:00" },
  { wave: "first", label: "First wave", internal: false, started_at: "2026-09-21T05:00:00+00:00", ended_at: "2026-09-24T05:00:00+00:00" },
];
// A Thursday afternoon in Central, during daylight time (UTC-5).
const NOW = new Date("2026-09-24T19:30:00Z");

test("central midnight is 05:00 UTC in September and 06:00 UTC in January", () => {
  assert.equal(centralMidnight(2026, 9, 21).toISOString(), "2026-09-21T05:00:00.000Z");
  assert.equal(centralMidnight(2026, 1, 15).toISOString(), "2026-01-15T06:00:00.000Z");
  // The spring-forward day itself.
  assert.equal(centralMidnight(2026, 3, 8).toISOString(), "2026-03-08T06:00:00.000Z");
  assert.equal(centralMidnight(2026, 3, 9).toISOString(), "2026-03-09T05:00:00.000Z");
});

test("no range means the newest wave that is not internal testing, staff hidden", () => {
  const s = parseSlice({}, { waves: WAVES, now: NOW });
  assert.equal(s.kind, "wave"); assert.equal(s.key, "first"); assert.equal(s.label, "First wave");
  assert.equal(s.from, "2026-09-21T05:00:00.000Z"); assert.equal(s.to, "2026-09-24T05:00:00.000Z");
  assert.equal(s.staff, "hidden"); assert.equal(s.defaulted, true); assert.equal(s.param, "wave:first");
});

test("no waves at all falls back to everything", () => {
  const s = parseSlice({}, { waves: [], now: NOW });
  assert.equal(s.kind, "all"); assert.equal(s.from, null); assert.equal(s.to, null);
});

test("wave:<key> picks that wave, including the internal one, and an unknown key is flagged", () => {
  const i = parseSlice({ range: "wave:internal" }, { waves: WAVES, now: NOW });
  assert.equal(i.key, "internal"); assert.equal(i.internal, true); assert.equal(i.to, "2026-09-21T05:00:00.000Z");
  const bad = parseSlice({ range: "wave:third" }, { waves: WAVES, now: NOW });
  assert.equal(bad.valid, false); assert.equal(bad.kind, "all");
});

test("week starts on Monday in Central, month on the 1st, year on Jan 1, all open-ended", () => {
  const w = parseSlice({ range: "week" }, { waves: WAVES, now: NOW });
  assert.equal(w.from, "2026-09-21T05:00:00.000Z", "Thursday Sep 24 -> Monday Sep 21"); assert.equal(w.to, null);
  const m = parseSlice({ range: "month" }, { waves: WAVES, now: NOW });
  assert.equal(m.from, "2026-09-01T05:00:00.000Z");
  const y = parseSlice({ range: "year" }, { waves: WAVES, now: NOW });
  assert.equal(y.from, "2026-01-01T06:00:00.000Z");
  // Late Sunday evening Central is still Sunday there even though it is Monday in UTC.
  const sun = parseSlice({ range: "week" }, { waves: WAVES, now: new Date("2026-09-28T03:30:00Z") });
  assert.equal(sun.from, "2026-09-21T05:00:00.000Z", "Sunday 22:30 Central belongs to the week of the 21st");
});

test("a custom range is inclusive on both days at Central midnights, and survives reversed dates", () => {
  const s = parseSlice({ range: "2026-09-21..2026-09-23" }, { waves: WAVES, now: NOW });
  assert.equal(s.kind, "custom"); assert.equal(s.from, "2026-09-21T05:00:00.000Z"); assert.equal(s.to, "2026-09-24T05:00:00.000Z");
  assert.equal(s.label, "Sep 21 to 23, 2026");
  const r = parseSlice({ range: "2026-09-23..2026-09-21" }, { waves: WAVES, now: NOW });
  assert.equal(r.from, s.from); assert.equal(r.to, s.to);
  const one = parseSlice({ range: "2026-09-22..2026-09-22" }, { waves: WAVES, now: NOW });
  assert.equal(one.label, "Sep 22, 2026"); assert.equal(one.to, "2026-09-23T05:00:00.000Z");
  assert.equal(parseSlice({ range: "2026-13-01..2026-13-02" }, { waves: WAVES, now: NOW }).valid, false);
});

test("staff are hidden unless staff=show; rows without the flag are never hidden", () => {
  const rows = [
    { started_at: "2026-09-21T12:00:00Z", is_staff: true, who: "tanner" },
    { started_at: "2026-09-22T12:00:00Z", is_staff: false, who: "tester" },
    { started_at: "2026-09-22T13:00:00Z", who: "old row" },
    { started_at: "2026-09-24T12:00:00Z", is_staff: false, who: "after the wave" },
    { started_at: "2026-09-20T12:00:00Z", is_staff: false, who: "before the wave" },
  ];
  const hidden = applySlice(rows, parseSlice({}, { waves: WAVES, now: NOW }));
  assert.deepEqual(hidden.map((r) => r.who), ["tester", "old row"]);
  const shown = applySlice(rows, parseSlice({ staff: "show" }, { waves: WAVES, now: NOW }));
  assert.deepEqual(shown.map((r) => r.who), ["tanner", "tester", "old row"]);
  const all = applySlice(rows, parseSlice({ range: "all", staff: "show" }, { waves: WAVES, now: NOW }));
  assert.equal(all.length, 5);
});

test("the boundary is exclusive at the end: a call at exactly midnight belongs to the next day", () => {
  const rows = [{ started_at: "2026-09-24T05:00:00Z" }, { started_at: "2026-09-24T04:59:59Z" }];
  const s = parseSlice({ range: "wave:first" }, { waves: WAVES, now: NOW });
  assert.equal(applySlice(rows, s).length, 1);
});

test("window labels read like a person wrote them", () => {
  const d = (s) => new Date(s);
  assert.equal(windowLabel(d("2026-09-21T05:00:00Z"), d("2026-09-24T05:00:00Z")), "Sep 21 to 23, 2026");
  assert.equal(windowLabel(d("2026-09-28T05:00:00Z"), d("2026-10-03T05:00:00Z")), "Sep 28 to Oct 2, 2026");
  assert.equal(windowLabel(d("2026-09-21T05:00:00Z"), null), "Since Sep 21, 2026");
  assert.equal(windowLabel(null, null), "All time");
});
