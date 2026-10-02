// Pure helpers for POST /api/grade, kept out of the handler so the rules that protect live data can be
// tested without a database or a model.
//
// A request grades one of three ways:
//   (nothing)                     the newest ungraded interactions, up to MAX_PER_RUN
//   { conversation_ids: [...] }   exactly those ungraded interactions, up to MAX_PER_RUN
//   { conversation_ids: [id], regrade: true }
//                                 ONE already-graded interaction, graded again. This is the only path that
//                                 deletes anything, and only rows of that one interaction that the new
//                                 grade no longer produces. See replacedKeys().

export const MAX_PER_RUN = 10;
const ID = /^[A-Za-z0-9_-]{4,100}$/;

export function parseGradeRequest(body) {
  const b = body && typeof body === "object" ? body : {};
  const regrade = b.regrade === true;
  let ids = null;
  if (b.conversation_ids != null) {
    if (!Array.isArray(b.conversation_ids)) return { error: "conversation_ids must be a list" };
    ids = [...new Set(b.conversation_ids.map(String))];
    if (ids.some((i) => !ID.test(i))) return { error: "conversation_ids holds a value that is not a conversation id" };
    if (ids.length === 0) return { error: "conversation_ids is empty" };
    if (ids.length > MAX_PER_RUN) return { error: `at most ${MAX_PER_RUN} interactions per run` };
  }
  if (regrade && (!ids || ids.length !== 1)) return { error: "a re-grade takes exactly one conversation id" };
  return { ids, regrade };
}

// The rows of an interaction's OLD grade that a re-grade may remove: those whose key the new grade did
// not write again. The new rows are written first, so a failed model call or a failed write removes
// nothing, and rows with the same key were already overwritten in place.
export function replacedKeys(oldKeys, newKeys) {
  const keep = new Set(newKeys);
  return [...new Set(oldKeys)].filter((k) => !keep.has(k));
}

// Re-grading must never clear a security flag on its own. A flag already raised stays raised (with its
// original detail); a new flag is raised; only a person clears one.
export function mergeSecurity(prev, next) {
  if (prev?.security_flag) return { security_flag: true, security_detail: prev.security_detail ?? next?.security_detail ?? null };
  return { security_flag: !!next?.security_flag, security_detail: next?.security_detail ?? null };
}

// PostgREST list literal for a set of keys (ids and slugs only; callers pass already-validated values).
export const inList = (keys) => `(${keys.map((k) => `"${String(k).replace(/"/g, "")}"`).join(",")})`;

// The model's reply, parsed. A reply that stopped at the token limit is cut mid-JSON; say so plainly
// instead of surfacing "Unterminated string in JSON at position 7947". (The budget pays for the model's
// thinking as well as the answer, so a long interaction with many questions can run out.)
export function parseGradeOutput(msg) {
  const text = (msg?.content || []).find((b) => b?.type === "text");
  if (msg?.stop_reason === "max_tokens") {
    throw new Error("the review was cut off at the model's output limit, so nothing was written; this interaction is too long to grade in one pass");
  }
  if (!text) throw new Error("grade returned no text block");
  try { return JSON.parse(text.text); }
  catch (e) { throw new Error(`the review was not valid JSON (${String(e.message || e).slice(0, 80)}); nothing was written`); }
}
