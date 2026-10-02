// GET /api/calls?limit=50 -> { calls: [...], summary: { last_24h, last_7d, ungraded_in_window } }
//
// The portal's Calls page and its landing-page counts. A thin select over ai_call_events, newest
// first, with no transcript: the transcript drawer keeps calling /api/survey-call per call, which
// already scrubs the caller's side of PII. This endpoint is behind the gate (see middleware.js).
import { sb, sbAll } from "../lib/supabase.js";
import { CALL_COLS, clampLimit, summarize, parseFilter, parseOffset, sourceStatusByCall, statusOf, selectIds, totals } from "../lib/calls.js";
import { CHANNEL_COLS, withChannel } from "../lib/channel.js";

// Each row also says which channel it came in on (phone, web voice, web chat). That is derived from
// the stored webhook payload; if the database rejects the extra select the list still loads, with
// channel: null on every row.
async function callRows(ids) {
  if (!ids.length) return [];
  const list = encodeURIComponent(`(${ids.map((i) => `"${i}"`).join(",")})`);
  const path = (cols) => `ai_call_events?provider=eq.elevenlabs&conversation_id=in.${list}&select=${cols}&order=started_at.desc.nullslast`;
  try {
    return withChannel(await sb(path(`${CALL_COLS},${CHANNEL_COLS}`)));
  } catch (e) {
    console.error("calls: channel select failed, returning rows without channel:", String(e?.message || e));
    return withChannel(await sb(path(CALL_COLS)));
  }
}

// GET /api/calls?limit=50&offset=0&filter=all|ungraded|graded|no_source
// `filter` and `offset` are what the Accuracy page pages through; without them this is the newest
// `limit` calls, as before. `totals` counts the whole table, so the page's numbers never depend on how
// many rows it has loaded. Each call carries `source_status`: ungraded, sourced (its answers were
// checked against documents), no_source (graded, but nothing could be checked) or no_answers.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const limit = clampLimit(req.query?.limit);
  const offset = parseOffset(req.query?.offset);
  const filter = parseFilter(req.query?.filter);
  try {
    // Every call, newest first, with only the columns needed to count and filter; the full rows are
    // fetched for the one page that is shown.
    const [all, scores] = await Promise.all([
      sbAll(`ai_call_events?provider=eq.elevenlabs&select=conversation_id,started_at,scored_at&order=started_at.desc.nullslast,conversation_id.asc`),
      sbAll(`call_question_scores?select=conversation_id,grounding&order=conversation_id.asc,question_key.asc`),
    ]);
    const status = sourceStatusByCall(scores || []);
    const matching = selectIds(all || [], filter, status);
    const pageIds = matching.slice(offset, offset + limit);
    const rows = await callRows(pageIds);
    const byId = new Map(rows.map((r) => [r.conversation_id, r]));
    const byAll = new Map((all || []).map((r) => [r.conversation_id, r]));
    const calls = pageIds.map((id) => byId.get(id)).filter(Boolean)
      .map((r) => ({ ...r, source_status: statusOf(byAll.get(r.conversation_id) || r, status) }));

    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const week = (all || []).filter((r) => Date.parse(r?.started_at || "") >= weekAgo);
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({
      calls, summary: summarize(week), totals: totals(all || [], status),
      matching: matching.length, offset, limit, filter,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
