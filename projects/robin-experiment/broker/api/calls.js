// GET /api/calls?limit=50 -> { calls: [...], summary: { last_24h, last_7d, ungraded_in_window } }
//
// The portal's Calls page and its landing-page counts. A thin select over ai_call_events, newest
// first, with no transcript: the transcript drawer keeps calling /api/survey-call per call, which
// already scrubs the caller's side of PII. This endpoint is behind the gate (see middleware.js).
import { sb } from "../lib/supabase.js";
import { CALL_COLS, clampLimit, summarize } from "../lib/calls.js";
import { CHANNEL_COLS, withChannel } from "../lib/channel.js";

// Each row also says which channel it came in on (phone, web voice, web chat). That is derived from
// the stored webhook payload; if the database rejects the extra select the list still loads, with
// channel: null on every row.
async function callRows(limit) {
  const path = (cols) => `ai_call_events?provider=eq.elevenlabs&select=${cols}&order=started_at.desc.nullslast&limit=${limit}`;
  try {
    return withChannel(await sb(path(`${CALL_COLS},${CHANNEL_COLS}`)));
  } catch (e) {
    console.error("calls: channel select failed, returning rows without channel:", String(e?.message || e));
    return withChannel(await sb(path(CALL_COLS)));
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const limit = clampLimit(req.query?.limit);
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [calls, week] = await Promise.all([
      callRows(limit),
      sb(`ai_call_events?provider=eq.elevenlabs&started_at=gte.${encodeURIComponent(since)}&select=started_at,scored_at`),
    ]);
    res.setHeader("cache-control", "private, max-age=15");
    return res.status(200).json({ calls, summary: summarize(week || []) });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
