// Claiming an interaction before it is graded, so two runs can never pay for the same one.
//
// The old grader chose the interactions, called the model for each (30 to 70 seconds), and only then marked
// them graded. Two runs that overlapped (a double click, two people, a retry) both chose the same
// interactions and both paid. On Sep 8 and Sep 15 that is the likely reason every interaction graded that day
// was written in two passes, with fresh topic keys each time, and so appears twice in the tables.
//
// Now the interaction is claimed FIRST, in one conditional UPDATE that Postgres arbitrates:
//     UPDATE ai_call_events SET scored_at = <stamp> WHERE conversation_id IN (...) AND scored_at IS NULL
//     RETURNING conversation_id
// Each row can be changed by one statement only, so the rows a caller gets back are rows nobody else has,
// and only those are sent to the model. No schema change: `scored_at` is the claim.
//
// If grading then fails, the claim is released by restoring the old value, but only while the row still
// carries OUR stamp, so a release can never undo someone else's work. If the function is killed before it
// can release (a platform timeout), the interaction is left stamped with no scores: the Accuracy page lists
// it as "graded, no answers found" and it can be re-graded. That is visible, and it costs nothing more.
//
// The Supabase client is passed in so the arbitration can be tested against a stub that behaves like the
// database (each row changes once).
import { inList } from "./grade-run.js";

const q = (s) => encodeURIComponent(s);

// Claim ungraded interactions. Returns the Set of conversation ids THIS caller now holds.
export async function claimUngraded(ids, stamp, { sb }) {
  if (!ids.length) return new Set();
  const rows = await sb(
    `ai_call_events?provider=eq.elevenlabs&conversation_id=in.${q(inList(ids))}&scored_at=is.null&select=conversation_id`,
    { method: "PATCH", prefer: "return=representation", body: { scored_at: stamp } },
  );
  return new Set((Array.isArray(rows) ? rows : []).map((r) => r.conversation_id));
}

// Claim ONE already-graded interaction for a re-grade: succeeds only if its scored_at is still the value the
// caller read, so two re-grades of the same interaction cannot both proceed.
export async function claimRegrade(id, seenScoredAt, stamp, { sb }) {
  if (!id || !seenScoredAt) return false;
  const rows = await sb(
    `ai_call_events?provider=eq.elevenlabs&conversation_id=eq.${q(id)}&scored_at=eq.${q(seenScoredAt)}&select=conversation_id`,
    { method: "PATCH", prefer: "return=representation", body: { scored_at: stamp } },
  );
  return Array.isArray(rows) && rows.length === 1;
}

// Give a claim back (grading failed): restore the previous value (null for an ungraded interaction), only while
// the row still carries our stamp.
export async function releaseClaim(id, stamp, restoreTo, { sb }) {
  await sb(
    `ai_call_events?provider=eq.elevenlabs&conversation_id=eq.${q(id)}&scored_at=eq.${q(stamp)}`,
    { method: "PATCH", prefer: "return=minimal", body: { scored_at: restoreTo } },
  );
}
