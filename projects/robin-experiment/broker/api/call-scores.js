// GET /api/call-scores?id=conv_... -> { conversation_id, scored_at, rows: [...] }
//
// The grader's per-call drill-down for the portal: every question the grader found on this call,
// what Robin answered, the score, the evidence (grounding, the claims with their source quotes
// once migration 003 is applied, what it was graded against), and the demand record from
// call_questions: every question asked, answered or not, with why not. Read-only, behind the gate
// (see middleware.js).
import { sb } from "../lib/supabase.js";

const COLS =
  "question_key,question_text,asked,answer_text,quality_score,quality_rating,grounding," +
  "unsupported_claims,contradicted_claims,graded_against,sentiment,reviewed,reviewer_note";
const QCOLS = "canonical_key,canonical_question,asked_text,category,answered,fail_reason,handling,fault,gap_note";

// Ask for `evidence` first; a live table without the column (migration 003 pending) makes PostgREST
// reject the select, and the rows are then read without it rather than not at all.
async function scoreRows(id) {
  try {
    return await sb(`call_question_scores?conversation_id=eq.${id}&select=${COLS},evidence&order=question_key.asc`);
  } catch (e) {
    if (!/evidence/.test(String(e?.message || e))) throw e;
    return sb(`call_question_scores?conversation_id=eq.${id}&select=${COLS}&order=question_key.asc`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const id = String(req.query?.id || "").trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: "bad id" });
  try {
    const [rows, questions, [call]] = await Promise.all([
      scoreRows(id),
      sb(`call_questions?conversation_id=eq.${id}&select=${QCOLS}&order=created_at.asc`),
      sb(`ai_call_events?conversation_id=eq.${id}&select=conversation_id,scored_at,security_flag,security_detail&limit=1`),
    ]);
    if (!call) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ ...call, rows: rows || [], questions: questions || [] });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
