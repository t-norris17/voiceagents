// GET /api/utilization[?days=30]  ->  how much of Robin's attached knowledge callers actually used.
// Read-only and free: it reads stored grades (never runs the grader), the documents attached to her, and
// the questions nothing answered (real gaps only: no_content, or not_retrieved when she had it and did not find it;
// "guardrail" and "out_of_scope" refusals are by design and are not gaps). See lib/utilization.js for what the number means and what it cannot.
import { sb } from "../lib/supabase.js";
import { liveRobin } from "../lib/robin-live.js";
import { compute } from "../lib/utilization.js";

const q = (s) => encodeURIComponent(s);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const days = Math.min(90, Math.max(1, Number(req.query?.days) || 30));
    const since = new Date(Date.now() - days * 86400e3).toISOString();

    // Which interactions fall in the window (the grades and questions are keyed by conversation).
    const events = await sb(`ai_call_events?provider=eq.elevenlabs&started_at=gte.${q(since)}&select=conversation_id,scored_at&limit=5000`);
    const inWindow = new Set(events.map((e) => e.conversation_id));
    const graded = events.filter((e) => e.scored_at).length;

    // A call is graded after it happens, so its scores are created at or after the window start.
    const [scores, asked] = await Promise.all([
      sb(`call_question_scores?created_at=gte.${q(since)}&select=conversation_id,evidence&limit=5000`),
      sb(`call_questions?created_at=gte.${q(since)}&answered=eq.false&fail_reason=in.(no_content,not_retrieved)&select=conversation_id,asked_text,canonical_key,canonical_question,fail_reason&limit=5000`),
    ]);
    const quotes = [];
    for (const s of scores) {
      if (!inWindow.has(s.conversation_id)) continue;
      for (const c of s?.evidence?.claims || []) if (c?.source_quote) quotes.push(String(c.source_quote));
    }
    const unmet = asked.filter((a) => inWindow.has(a.conversation_id));

    let live;
    try { live = await liveRobin(); }
    catch (e) { return res.status(503).json({ error: String(e.message || e) }); }

    return res.status(200).json({
      ...compute({ docs: live.docs, quotes, interactions: events.length, graded, unmet, days }),
      unreadable_documents: live.unreadable,
      measured_at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
