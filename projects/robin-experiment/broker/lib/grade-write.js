// The database half of POST /api/grade. The Supabase client and the score upsert are passed in so the
// write and delete ordering can be tested against a stub.
import { replacedKeys, mergeSecurity, inList } from "./grade-run.js";

const q = (s) => encodeURIComponent(s);

// Writes one graded interaction. EVERY grade, first or repeat, REPLACES that interaction's rows, in an order
// that cannot lose data:
//   1. write the new rows,
//   2. read what the database holds for this interaction NOW, and delete only the rows whose key this grade
//      did not write (so rows left by an earlier pass, or by a run that interleaved with this one, go too),
//   3. stamp the call.
// Why after the write and not from a snapshot taken before it: the grader invents a fresh topic key every
// run, so a second pass over the same interaction adds new rows beside the old instead of overwriting them
// (that is how some interactions came to hold the same question 3 to 5 times). Computing "stale" after our
// own write means that however two writers interleave, the last to finish leaves exactly its own rows.
// A model failure or a failed write before step 2 leaves the old rows untouched, and an empty new grade
// never deletes anything. The demand record is replaced only when this run produced one, and a security
// flag already raised is never cleared here (lib/grade-run.js).
export async function writeGrade(call, v, regrade, { sb, upsertScores }) {
  const id = v.conversation_id;
  if (regrade && !v.rows.length) {
    throw new Error("the new grade found no answers to score, so the old grade was left as it was");
  }
  // Only a re-grade reports what it replaced; the snapshot is for that report, not for deciding deletes.
  const before = regrade
    ? await sb(`call_question_scores?conversation_id=eq.${q(id)}&select=question_key,grounding,quality_score`)
    : [];

  if (v.rows.length) await upsertScores(v.rows);
  if (v.askedRows && v.askedRows.length) {
    await sb("call_questions?on_conflict=conversation_id,canonical_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: v.askedRows,
    });
  }

  const removed = { scores: [], questions: [] };
  if (v.rows.length) {
    const now = await sb(`call_question_scores?conversation_id=eq.${q(id)}&select=question_key`);
    removed.scores = replacedKeys((now || []).map((r) => r.question_key), v.rows.map((r) => r.question_key));
    if (removed.scores.length) {
      await sb(`call_question_scores?conversation_id=eq.${q(id)}&question_key=in.${q(inList(removed.scores))}`, { method: "DELETE", prefer: "return=minimal" });
    }
  }
  if (v.askedRows && v.askedRows.length) {
    const now = await sb(`call_questions?conversation_id=eq.${q(id)}&select=canonical_key`);
    removed.questions = replacedKeys((now || []).map((r) => r.canonical_key), v.askedRows.map((r) => r.canonical_key));
    if (removed.questions.length) {
      await sb(`call_questions?conversation_id=eq.${q(id)}&canonical_key=in.${q(inList(removed.questions))}`, { method: "DELETE", prefer: "return=minimal" });
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
    cleaned: { score_keys: removed.scores.length, question_keys: removed.questions.length },
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
