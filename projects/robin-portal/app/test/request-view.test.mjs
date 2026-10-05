// The Requests page's wording: times in the call center's zone whatever the viewer's machine says, and
// the right-hand status line for each state of the dot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { when, stamp, phone, nameOf, rowStatus, dotOf, duration, FILTERS } from "../lib/request-view.js";

const TZ = "America/Chicago";
const now = new Date("2026-10-05T14:10:00-05:00"); // Monday 2:10 PM Central, the mocks' clock

test("times read in Central, relative to today", () => {
  assert.equal(when("2026-10-05T16:00:00-05:00", TZ, now), "4:00 PM today");
  assert.equal(when("2026-10-02T16:00:00-05:00", TZ, now), "Fri 4:00 PM");
  assert.equal(when("2026-09-20T16:00:00-05:00", TZ, now), "Sun Sep 20, 4:00 PM");
  assert.equal(stamp("2026-10-03T21:42:00-05:00", TZ), "Sat Oct 3, 9:42 PM");
  // 11:52 PM Sunday Central is already Monday in UTC; it must still read as Sunday.
  assert.equal(stamp("2026-10-05T04:52:00Z", TZ), "Sun Oct 4, 11:52 PM");
});

test("phone numbers and names", () => {
  assert.equal(phone("+13165550142"), "(316) 555-0142");
  assert.equal(phone("+447700900123"), "+447700900123");
  assert.equal(nameOf({ caller_name: "Dana" }), "Dana");
  assert.equal(nameOf({ member: { first_name: "Marcus" } }), "Marcus");
  assert.equal(nameOf({}), "Unknown caller");
});

test("the status column for each state", () => {
  const base = { status: "open", due_at: "2026-10-05T16:00:00-05:00", events: [] };
  assert.deepEqual(rowStatus({ ...base, sla: "amber" }, TZ, now), { cls: "", head: "Due 4:00 PM today", line: "no attempts" });
  assert.deepEqual(rowStatus({ ...base, due_at: "2026-10-02T16:00:00-05:00", sla: "red" }, TZ, now),
    { cls: "bad", head: "Overdue", line: "was due Fri 4:00 PM · no attempts" });
  const vm = { kind: "voicemail", at: "2026-10-05T09:05:00-05:00" };
  assert.deepEqual(rowStatus({ ...base, sla: "green", first_attempt: vm.at, events: [vm] }, TZ, now),
    { cls: "ok", head: "Called back on time", line: "voicemail 9:05 AM today" });
  assert.equal(rowStatus({ ...base, status: "closed", closed_at: "2026-10-05T10:00:00-05:00" }, TZ, now).head, "Closed 10:00 AM today");
});

test("dots and filters", () => {
  assert.equal(dotOf({ status: "open", sla: "red" }), "bad");
  assert.equal(dotOf({ status: "open", sla: "amber" }), "warn");
  assert.equal(dotOf({ status: "open", sla: "green" }), "ok");
  assert.equal(dotOf({ status: "closed", sla: "green" }), "none");
  const rows = [{ status: "open", verified: true }, { status: "open", verified: false }, { status: "closed", verified: false }];
  const count = (k) => rows.filter(FILTERS.find((f) => f.key === k).test).length;
  assert.deepEqual([count("open"), count("unverified"), count("done"), count("all")], [2, 1, 1, 3]);
});

test("durations", () => {
  assert.equal(duration(220), "3h 40m");
  assert.equal(duration(45), "45m");
  assert.equal(duration(3000), "2d 2h");
  assert.equal(duration(null), "—");
});
