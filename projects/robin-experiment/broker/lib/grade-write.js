// Writes one graded interaction (the database half of POST /api/grade). The Supabase client and the
// score upsert are passed in so the delete ordering can be tested against a stub.
import { replacedKeys, mergeSecurity, inList } from "./grade-run.js";

const q = (s) => encodeURIComponent(s);

// Writes one graded interaction. A normal grade only adds rows and stamps the call. A RE-GRADE (one
// already-graded interaction, graded again) replaces the old grade, in an order that cannot lose data:
//   1. read the old rows (state first), 2. write the new rows, 3. delete only the OLD rows whose key the
//   new grade did not write again, 4. stamp the call. A model failure or a failed write before step 3
// leaves the old grade untouched. The demand record is replaced only when the new run produced one, and a
// security flag already raised is never cleared here (lib/grade-run.js).
export async function writeGrade(call, v, regrade, { sb, upsertScores }) {
  const id = v.conversation_id;
  if (regrade && !v.rows.length) {
    throw new Error("the new grade found no answers to score, so the old grade was left as it was");
  }
  const before = regrade
    ? await sb(`call_question_scores?conversation_id=eq.${q(id)}&select=question_key,grounding,quality_score`)
    : [];
  const beforeQs = regrade
    ? await sb(`call_questions?conversation_id=eq.${q(id)}&select=canonical_key`)
    : [];

  if (v.rows.length) await upsertScores(v.rows);
  if (v.askedRows && v.askedRows.length) {
    await sb("call_questions?on_conflict=conversation_id,canonical_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: v.askedRows,
    });
  }

  let removed = { scores: [], questions: [] };
  if (regrade) {
    removed.scores = replacedKeys(before.map((r) => r.question_key), v.rows.map((r) => r.question_key));
    if (removed.scores.length) {
      await sb(`call_question_scores?conversation_id=eq.${q(id)}&question_key=in.${q(inList(removed.scores))}`, { method: "DELETE", prefer: "return=minimal" });
    }
    if (v.askedRows && v.askedRows.length) {
      removed.questions = replacedKeys(beforeQs.map((r) => r.canonical_key), v.askedRows.map((r) => r.canonical_key));
      if (removed.questions.length) {
        await sb(`call_questions?conversation_id=eq.${q(id)}&canonical_key=in.${q(inList(removed.questions))}`, { method: "DELETE", prefer: "return=minimal" });
      }
    }
  }

  // Stamp the call so it isn't re-graded, and carry the security verdict onto the call row.
  const sec = regrade ? mergeSecurity({ security_flag: call.security_flag, security_detail: call.security_detail }, v)
    : { security_flag: v.security_flag, security_detail: v.security_detail };
  await sb(`ai_call_events?conversation_id=eq.${q(id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { scored_at: new Date().toISOString(), ...sec },
  });

  return {
    conversation_id: id,
    status: "graded",
    scored_rows: v.rows.length,
    asked_rows: v.askedRows ? v.askedRows.length : 0,
    sourced: v.rows.some((r) => r.grounding && r.grounding !== "no_source"),
    ...(regrade ? {
      replaced: {
        before: before.map((r) => ({ key: r.question_key, grounding: r.grounding, quality: r.quality_score })),
        after: v.rows.map((r) => ({ key: r.question_key, grounding: r.grounding, quality: r.quality_score })),
        removed_score_keys: removed.scores,
        removed_question_keys: removed.questions,
      },
    } : {}),
  };
}
