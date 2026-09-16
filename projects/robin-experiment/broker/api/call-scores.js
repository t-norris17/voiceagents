// GET /api/call-scores?id=conv_... -> { conversation_id, scored_at, rows: [...] }
//
// The grader's per-call drill-down for the portal: every question the grader found on this call,
// what Robin answered, the score, and the evidence columns (grounding, unsupported and contradicted
// claims, what it was graded against). Read-only, behind the gate (see middleware.js).
import { sb } from "../lib/supabase.js";

const COLS =
  "question_key,question_text,asked,answer_text,quality_score,quality_rating,grounding," +
  "unsupported_claims,contradicted_claims,graded_against,sentiment,reviewed,reviewer_note";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const id = String(req.query?.id || "").trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: "bad id" });
  try {
    const [rows, [call]] = await Promise.all([
      sb(`call_question_scores?conversation_id=eq.${id}&select=${COLS}&order=question_key.asc`),
      sb(`ai_call_events?conversation_id=eq.${id}&select=conversation_id,scored_at,security_flag,security_detail&limit=1`),
    ]);
    if (!call) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ ...call, rows: rows || [] });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
