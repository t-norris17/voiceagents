// GET /api/calls?limit=50 -> { calls: [...], summary: { last_24h, last_7d, ungraded_in_window } }
//
// The portal's Calls page and its landing-page counts. A thin select over ai_call_events, newest
// first, with no transcript: the transcript drawer keeps calling /api/survey-call per call, which
// already scrubs the caller's side of PII. This endpoint is behind the gate (see middleware.js).
import { sb } from "../lib/supabase.js";
import { CALL_COLS, clampLimit, summarize } from "../lib/calls.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const limit = clampLimit(req.query?.limit);
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [calls, week] = await Promise.all([
      sb(`ai_call_events?provider=eq.elevenlabs&select=${CALL_COLS}&order=started_at.desc.nullslast&limit=${limit}`),
      sb(`ai_call_events?provider=eq.elevenlabs&started_at=gte.${encodeURIComponent(since)}&select=started_at,scored_at`),
    ]);
    res.setHeader("cache-control", "private, max-age=15");
    return res.status(200).json({ calls: calls || [], summary: summarize(week || []) });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
