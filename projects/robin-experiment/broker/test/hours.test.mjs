// lib/hours.js: open/closed, the after-hours callback deadline, federal holidays and the spoken sentence.
//
// Every instant here is written as an explicit Central wall-clock time with its UTC offset (-05:00 in
// daylight time, -06:00 in standard time), so the expectations never depend on the code under test.
// Calendar facts were checked against the system calendar on 2026-10-05 (e.g. July 4 2026 is a
// Saturday, DST ends 2026-11-01 and starts 2026-03-08).
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOURS, isOpen, callbackDue, nextOpen, callbackByText, handoffOption, federalHolidays } from "../lib/hours.js";

const at = (s) => new Date(s);
const same = (actual, expected, msg) => assert.equal(actual.toISOString(), at(expected).toISOString(), msg);

test("open Monday to Friday 8 AM to 6 PM Central, closed at 6 PM sharp and before 8", () => {
  assert.equal(isOpen(at("2026-10-05T10:00:00-05:00")), true, "Mon 10 AM");
  assert.equal(isOpen(at("2026-10-05T08:00:00-05:00")), true, "Mon 8:00 AM opens");
  assert.equal(isOpen(at("2026-10-05T17:59:00-05:00")), true, "Mon 5:59 PM");
  assert.equal(isOpen(at("2026-10-05T18:00:00-05:00")), false, "Mon 6:00 PM is closed");
  assert.equal(isOpen(at("2026-10-05T07:59:00-05:00")), false, "Mon 7:59 AM");
});

test("Saturday and Sunday are closed all day", () => {
  assert.equal(isOpen(at("2026-10-03T10:00:00-05:00")), false, "Sat 10 AM");
  assert.equal(isOpen(at("2026-10-04T10:00:00-05:00")), false, "Sun 10 AM");
});

test("the deadlines shown in the requests mocks", () => {
  same(callbackDue(at("2026-10-01T21:14:00-05:00")), "2026-10-02T16:00:00-05:00", "Thu 9:14 PM -> Fri 4 PM");
  same(callbackDue(at("2026-10-03T21:42:00-05:00")), "2026-10-05T16:00:00-05:00", "Sat 9:42 PM -> Mon 4 PM");
  same(callbackDue(at("2026-10-04T14:18:00-05:00")), "2026-10-05T16:00:00-05:00", "Sun 2:18 PM -> Mon 4 PM");
  same(callbackDue(at("2026-10-04T23:52:00-05:00")), "2026-10-05T16:00:00-05:00", "Sun 11:52 PM -> Mon 4 PM");
});

test("weekday evenings and early mornings", () => {
  same(callbackDue(at("2026-09-30T18:15:00-05:00")), "2026-10-01T16:00:00-05:00", "Wed 6:15 PM -> Thu 4 PM");
  same(callbackDue(at("2026-10-05T06:30:00-05:00")), "2026-10-05T16:00:00-05:00", "Mon 6:30 AM -> Mon 4 PM");
  same(callbackDue(at("2026-10-02T19:00:00-05:00")), "2026-10-05T16:00:00-05:00", "Fri 7 PM -> Mon 4 PM (Saturday closed)");
  same(callbackDue(at("2026-10-03T12:30:00-05:00")), "2026-10-05T16:00:00-05:00", "Sat 12:30 PM -> Mon 4 PM");
});

test("federal holidays close the call center and push the deadline", () => {
  assert.equal(isOpen(at("2026-10-12T10:00:00-05:00")), false, "Columbus Day, Mon Oct 12 2026");
  same(callbackDue(at("2026-10-09T19:00:00-05:00")), "2026-10-13T16:00:00-05:00", "Fri before Columbus Day -> Tue 4 PM");
  same(callbackDue(at("2026-11-10T19:00:00-06:00")), "2026-11-12T16:00:00-06:00", "Veterans Day (Wed Nov 11) skipped");
  same(callbackDue(at("2026-11-25T19:00:00-06:00")), "2026-11-27T16:00:00-06:00", "Thanksgiving skipped; the Friday after is open");
  same(callbackDue(at("2026-12-24T19:00:00-06:00")), "2026-12-28T16:00:00-06:00", "Christmas Fri Dec 25 -> Mon Dec 28");
});

test("2026 observed federal holidays, bank calendar", () => {
  const h = federalHolidays(2026);
  for (const k of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-09-07",
    "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]) assert.ok(h.has(k), k);
  assert.equal(h.has("2026-07-03"), false, "July 4 2026 is a Saturday: the bank calendar does not close Friday");
  assert.equal(h.size, 10);
});

test("Saturday and Sunday holidays under both calendars", () => {
  assert.ok(federalHolidays(2026, "opm").has("2026-07-03"), "OPM moves Sat Jul 4 2026 to Fri Jul 3");
  assert.ok(federalHolidays(2027).has("2027-07-05"), "Sun Jul 4 2027 -> Mon Jul 5 (both calendars)");
  assert.ok(federalHolidays(2027, "opm").has("2027-12-31"), "Sat Jan 1 2028 -> Fri Dec 31 2027 under OPM");
  assert.equal(federalHolidays(2027).has("2027-12-31"), false, "not under the bank calendar");
  assert.equal(federalHolidays(2027).has("2027-12-24"), false, "Sat Dec 25 2027: bank calendar keeps Friday open");
});

test("daylight saving changes over a weekend", () => {
  // DST ends Sunday 2026-11-01: Friday is -05:00, Monday is -06:00.
  same(callbackDue(at("2026-10-30T19:00:00-05:00")), "2026-11-02T16:00:00-06:00", "fall back");
  // DST starts Sunday 2026-03-08: Friday is -06:00, Monday is -05:00.
  same(callbackDue(at("2026-03-06T19:00:00-06:00")), "2026-03-09T16:00:00-05:00", "spring forward");
});

test("next opening", () => {
  same(nextOpen(at("2026-10-03T21:42:00-05:00")), "2026-10-05T08:00:00-05:00", "Sat night -> Mon 8 AM");
  same(nextOpen(at("2026-10-05T06:30:00-05:00")), "2026-10-05T08:00:00-05:00", "Mon 6:30 AM -> Mon 8 AM");
  same(nextOpen(at("2026-10-09T18:00:00-05:00")), "2026-10-13T08:00:00-05:00", "Fri 6 PM before Columbus Day -> Tue 8 AM");
  same(nextOpen(at("2026-10-05T10:00:00-05:00")), "2026-10-05T10:00:00-05:00", "open now -> now");
});

test("the sentence Robin reads", () => {
  assert.equal(callbackByText(at("2026-10-05T16:00:00-05:00")), "by Monday, October 5 at 4 PM Central");
  assert.equal(callbackByText(at("2026-10-13T16:30:00-05:00")), "by Tuesday, October 13 at 4:30 PM Central");
  assert.equal(callbackByText(at("2026-11-02T09:05:00-06:00")), "by Monday, November 2 at 9:05 AM Central");
  assert.equal(callbackByText(at("2026-10-05T12:00:00-05:00")), "by Monday, October 5 at 12 PM Central");
});

test("handoffOption: transfer while open, a phrased request while closed", () => {
  assert.deepEqual(handoffOption(at("2026-10-05T10:00:00-05:00")), { mode: "transfer" });
  const r = handoffOption(at("2026-10-03T21:42:00-05:00"));
  assert.equal(r.mode, "request");
  same(new Date(r.next_open), "2026-10-05T08:00:00-05:00");
  same(new Date(r.due_at), "2026-10-05T16:00:00-05:00");
  assert.equal(r.callback_by_text, "by Monday, October 5 at 4 PM Central");
});

test("seconds are dropped, so a deadline is never late", () => {
  // In-hours start with seconds: due is at most 59 s early, never after the full 8 hours.
  const start = at("2026-10-05T08:00:45-05:00");
  const due = callbackDue(start);
  assert.ok(due.getTime() <= start.getTime() + 8 * 3600e3, "not late");
  assert.ok(due.getTime() >= start.getTime() + 8 * 3600e3 - 59e3, "at most 59 s early");
});

test("config is the only source of hours: a test config with Saturday open changes the answer", () => {
  const withSaturday = { ...HOURS, week: { ...HOURS.week, 6: [8 * 60, 12 * 60] } };
  same(callbackDue(at("2026-10-02T19:00:00-05:00"), withSaturday), "2026-10-05T12:00:00-05:00",
    "Fri 7 PM -> Mon 12 PM when Saturday 8-12 counts");
});
