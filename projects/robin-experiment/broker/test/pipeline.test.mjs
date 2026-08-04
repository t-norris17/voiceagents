// Tests for "where your calls are" — the logic behind the complaint that calls come in and don't
// show up. Every case here is a shape that used to render as an empty, silent dashboard.
// Run: `node --test`. No API key, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePipeline, sortByArrival, callState, arrivedAt, STALL_MS } from "../lib/pipeline.js";

const T = (min) => new Date(Date.UTC(2026, 0, 1, 12, min)).toISOString();
const call = (id, { created = T(0), started = T(0), scored = null } = {}) =>
  ({ conversation_id: id, created_at: created, started_at: started, scored_at: scored });

test("a fully-processed set reports everything checked and nothing stuck", () => {
  const p = computePipeline({ events: [call("a", { scored: T(5) }), call("b", { scored: T(6) })], ingest: [] });
  assert.equal(p.received, 2);
  assert.equal(p.graded, 2);
  assert.equal(p.awaiting_grading, 0);
  assert.equal(p.no_transcript, 0);
  assert.equal(p.stalled, false);
});

test("an ungraded call is counted as waiting, not lost", () => {
  const p = computePipeline({ events: [call("a", { scored: T(5) }), call("b")], ingest: [], now: Date.parse(T(6)) });
  assert.equal(p.awaiting_grading, 1);
  assert.equal(p.stalled, false, "recent arrivals are queued, not stalled");
});

test("a call waiting longer than the stall window is called out", () => {
  const p = computePipeline({ events: [call("b", { created: T(0) })], ingest: [], now: Date.parse(T(0)) + STALL_MS + 1 });
  assert.equal(p.stalled, true);
  assert.equal(p.oldest_awaiting_at, T(0));
});

test("a transcript-less call is un-gradable, not perpetually 'waiting'", () => {
  // The shape that makes a queue look like it never drains: counted as pending forever, with
  // nothing anywhere saying it can never be scored.
  const events = [call("a", { scored: T(5) }), call("b"), call("c")];
  const p = computePipeline({ events, noTranscript: [{ conversation_id: "c" }], ingest: [], now: Date.parse(T(1)) });
  assert.equal(p.no_transcript, 1);
  assert.equal(p.awaiting_grading, 1);
  assert.equal(p.graded + p.awaiting_grading + p.no_transcript, p.received, "every call is in exactly one bucket");
});

test("a transcript-less call that WAS somehow graded isn't double-counted", () => {
  const p = computePipeline({ events: [call("c", { scored: T(5) })], noTranscript: [{ conversation_id: "c" }], ingest: [] });
  assert.equal(p.graded, 1);
  assert.equal(p.no_transcript, 0);
  assert.equal(p.awaiting_grading, 0);
});

test("rejected webhooks are grouped by reason with the most recent detail", () => {
  const p = computePipeline({
    events: [],
    ingest: [
      { accepted: false, reason: "bad_signature", received_at: T(9), detail: "newest" },
      { accepted: false, reason: "bad_signature", received_at: T(1), detail: "older" },
      { accepted: false, reason: "no_secret", received_at: T(3), detail: "unset" },
      { accepted: true, reason: "stored", received_at: T(4) },
    ],
  });
  assert.equal(p.rejected_recent, 3);
  assert.equal(p.rejected_by_reason.bad_signature.count, 2);
  assert.equal(p.rejected_by_reason.bad_signature.last_at, T(9));
  assert.equal(p.rejected_by_reason.bad_signature.detail, "newest");
  assert.equal(p.rejected_by_reason.no_secret.count, 1);
  assert.equal(p.last_webhook_at, T(4), "only accepted webhooks count as a successful delivery");
});

test("zero calls plus zero rejections is the honest 'quiet' case", () => {
  const p = computePipeline({ events: [], ingest: [] });
  assert.equal(p.received, 0);
  assert.equal(p.rejected_recent, 0);
  assert.equal(p.ingest_log_available, true);
  assert.equal(p.last_call_at, null);
});

test("with no ingest log, rejections are UNKNOWN rather than zero", () => {
  // A deployment that hasn't run the migration can't see rejections. Reporting 0 would be the
  // same lie the dashboard already told, in a new place.
  const p = computePipeline({ events: [call("a", { scored: T(1) })], ingest: null });
  assert.equal(p.ingest_log_available, false);
  assert.equal(p.rejected_recent, 0);
  assert.deepEqual(p.rejected_by_reason, {});
});

// --- ordering: the bug where a real call never reached the "recent calls" list ---

test("a call with no start time still sorts by when it arrived", () => {
  const withStart = call("a", { created: T(1), started: T(1) });
  const noStart = { conversation_id: "b", created_at: T(9), started_at: null, scored_at: null };
  const sorted = sortByArrival([withStart, noStart]);
  assert.equal(sorted[0].conversation_id, "b", "newest arrival first, start time or not");
  assert.equal(arrivedAt(noStart), T(9));
});

test("a null-start call can't be pushed past the 20-row cut by its missing timestamp", () => {
  // The old query ordered on started_at with nulls last, so this call sat at position 21 of 21
  // and never appeared — while plainly existing in the database.
  const many = Array.from({ length: 20 }, (_, i) => call(`old${i}`, { created: T(1), started: T(1), scored: T(2) }));
  const newest = { conversation_id: "new", created_at: T(19), started_at: null, scored_at: null };
  const top20 = sortByArrival([...many, newest]).slice(0, 20).map((e) => e.conversation_id);
  assert.ok(top20.includes("new"));
  assert.equal(top20[0], "new");
});

test("callState names what each call is waiting on", () => {
  const none = new Set();
  assert.equal(callState(call("a", { scored: T(1) }), none), "graded");
  assert.equal(callState(call("b"), none), "awaiting_grading");
  assert.equal(callState(call("c"), new Set(["c"])), "no_transcript");
});
