// Where every call actually is — the answer to "calls are coming in but not showing up".
//
// A call becomes a number on the dashboard by surviving three hops:
//
//   webhook accepted  ->  row with a transcript  ->  graded  ->  counted in every metric
//
// Each hop can drop it, and each drop used to be silent. The dashboard rendered only what
// survived all three, so a webhook rejecting every call, a provider sending transcript-less
// events, and a genuinely quiet afternoon all produced the same empty page. This module reports
// the hops themselves, so the page can name its own gap.
//
// Pulled out of api/metrics.js to be testable: this is the logic the whole complaint hinges on,
// and it shouldn't only be exercisable by placing a real call.

// A provider-reported start time can be missing or odd. Arrival — when WE stored the row — is the
// one timestamp that always exists, so it's what ordering and staleness are measured against.
export const arrivedAt = (e) => e?.created_at || e?.started_at || null;

// Newest arrival first. The old dashboard ordered on started_at alone and then sliced the top 20,
// which sent every call with a null start time to the end of the list — genuinely received,
// genuinely invisible.
export function sortByArrival(events) {
  return events.slice().sort((a, b) => String(arrivedAt(b) || "").localeCompare(String(arrivedAt(a) || "")));
}

export function callState(e, noTranscriptIds) {
  if (e.scored_at) return "graded";
  if (noTranscriptIds.has(e.conversation_id)) return "no_transcript";
  return "awaiting_grading";
}

// A call still ungraded this long after arriving means grading is failing, not queuing. Grading
// only runs while the dashboard is open, so the threshold is generous.
export const STALL_MS = 10 * 60 * 1000;

// events        rows from ai_call_events (need conversation_id, created_at, started_at, scored_at)
// noTranscript  rows whose transcript is null — these can never be graded
// ingest        recent webhook_ingest_log rows, or null when the table isn't there yet
export function computePipeline({ events = [], noTranscript = [], ingest = null, now = Date.now() } = {}) {
  const noTranscriptIds = new Set((noTranscript || []).map((e) => e.conversation_id));

  const graded = events.filter((e) => e.scored_at).length;
  // A call with no transcript is un-gradable, not "waiting" — counting it as waiting is what makes
  // a queue look like it never drains.
  const ungradable = events.filter((e) => noTranscriptIds.has(e.conversation_id) && !e.scored_at).length;
  const awaiting = events.length - graded - ungradable;

  const newest = (list) => list.reduce((m, t) => (t && (!m || t > m) ? t : m), null);
  const oldest = (list) => list.reduce((m, t) => (t && (!m || t < m) ? t : m), null);

  const lastCallAt = newest(events.map(arrivedAt));
  const oldestWaiting = oldest(
    events.filter((e) => !e.scored_at && !noTranscriptIds.has(e.conversation_id)).map(arrivedAt)
  );

  // Rejections grouped by reason: one wrong secret produces a hundred identical rows, and the
  // count is the whole point.
  const rejects = (ingest || []).filter((r) => !r.accepted);
  const rejectByReason = {};
  for (const r of rejects) {
    const g = rejectByReason[r.reason] || { count: 0, last_at: null, detail: null };
    g.count++;
    if (!g.last_at || r.received_at > g.last_at) { g.last_at = r.received_at; g.detail = r.detail || null; }
    rejectByReason[r.reason] = g;
  }
  const lastAccepted = newest((ingest || []).filter((r) => r.accepted).map((r) => r.received_at));

  return {
    // null means the log table isn't there. The UI must say "unknown", never "none" — claiming
    // zero rejections on a deployment that can't see them is the same lie in a new place.
    ingest_log_available: ingest !== null,
    received: events.length,
    graded,
    awaiting_grading: awaiting,
    no_transcript: ungradable,
    last_call_at: lastCallAt,
    oldest_awaiting_at: oldestWaiting,
    last_webhook_at: lastAccepted,
    rejected_recent: rejects.length,
    rejected_by_reason: rejectByReason,
    stalled: !!(oldestWaiting && now - new Date(oldestWaiting).getTime() > STALL_MS),
  };
}
