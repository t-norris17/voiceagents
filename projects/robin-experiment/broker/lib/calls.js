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
