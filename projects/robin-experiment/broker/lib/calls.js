// Pure helpers for /api/calls, kept out of the handler so they can be tested without a database.

export const CALL_COLS =
  "conversation_id,started_at,ended_at,duration_seconds,topic,outcome,transfer_reason,auth_outcome," +
  "overall_sentiment,security_flag,scored_at";

// Clamp a user-supplied limit to something the page can render and the database can serve fast.
export function clampLimit(raw, { fallback = 50, max = 100 } = {}) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// Counts the landing page shows on the Calls and Grader doors. Computed in JS over the rows of the
// last seven days rather than with PostgREST count headers, which lib/supabase.js does not expose.
export function summarize(rows, now = Date.now()) {
  const dayAgo = now - 24 * 3600 * 1000;
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  let last_24h = 0, last_7d = 0, ungraded = 0;
  for (const r of rows || []) {
    const t = Date.parse(r?.started_at || "");
    if (Number.isFinite(t)) {
      if (t >= weekAgo) last_7d += 1;
      if (t >= dayAgo) last_24h += 1;
    }
    if (!r?.scored_at) ungraded += 1;
  }
  return { last_24h, last_7d, ungraded_in_window: ungraded };
}

// ---- Accuracy page: filter, page, and say what each grade rests on ------------------------------------
// The grader stamps scored_at on a call when it is graded. Whether that grade had a source to check
// against is a property of its score rows: every row `no_source` means Robin's answers could not be
// checked (the grader could not read the documents), which is what makes an interaction worth re-grading.
export const FILTERS = new Set(["all", "ungraded", "graded", "no_source"]);
export const parseFilter = (raw) => (FILTERS.has(String(raw)) ? String(raw) : "all");
export function parseOffset(raw, max = 5000) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

// conversation_id -> "sourced" (at least one answer was checked against a document) | "no_source" (it
// has score rows and none could be). A graded call missing from the map has no score rows at all.
export function sourceStatusByCall(scoreRows) {
  const m = new Map();
  for (const r of scoreRows || []) {
    const id = r?.conversation_id; if (!id) continue;
    const sourced = !!r.grounding && r.grounding !== "no_source";
    if (sourced) m.set(id, "sourced");
    else if (!m.has(id)) m.set(id, "no_source");
  }
  return m;
}

export const statusOf = (row, map) => (row?.scored_at ? (map.get(row.conversation_id) || "no_answers") : "ungraded");

// `rows` are every call, newest first; returns the ids a filter keeps, in that order.
export function selectIds(rows, filter, map) {
  const keep = {
    all: () => true,
    ungraded: (r) => !r.scored_at,
    graded: (r) => !!r.scored_at,
    no_source: (r) => !!r.scored_at && map.get(r.conversation_id) === "no_source",
  }[parseFilter(filter)];
  return (rows || []).filter(keep).map((r) => r.conversation_id);
}

// Counts over the WHOLE table, so the page's numbers do not depend on how many rows it has loaded.
export function totals(rows, map) {
  let graded = 0, withoutSource = 0;
  for (const r of rows || []) {
    if (!r.scored_at) continue;
    graded += 1;
    if (map.get(r.conversation_id) === "no_source") withoutSource += 1;
  }
  return { total: (rows || []).length, graded, ungraded: (rows || []).length - graded, graded_without_source: withoutSource };
}
