// When does a save get fact-checked, and what stops it?
//
// Split out from api/approve.js so the policy is testable without an API key. The expensive part
// (asking the critic) lives there; the decisions about WHEN to ask and WHAT counts as a blocker
// live here, because those are the parts that get argued about.

// Both verdicts block. `contradicted` is the obvious one. `unsupported` is the case this exists
// for: someone types a figure the article never carried, and nothing contradicts it because the
// baseline is simply silent on the subject. Blocking only on contradictions would miss it.
export const BLOCKING_VERDICTS = new Set(["contradicted", "unsupported"]);

export function blockingClaims(claims) {
  return (Array.isArray(claims) ? claims : []).filter((c) => BLOCKING_VERDICTS.has(c?.verdict));
}

// A hand edit is checked against the version it was edited FROM — text that already passed the
// check on its way in. An edit may cut, reword or reorder; it may not add a fact.
//
// Three ways to skip, each for a different reason:
//   verified — the text came out of a cleaning run, where the critic checked it against the plan
//              document itself. A stronger baseline than the previous version, and one this
//              endpoint doesn't hold. Re-checking here would flag every legitimate addition from
//              an updated source document.
//   force    — the reviewer read the warning and decided. The check is advice, not a veto.
//   no baseline / unchanged — nothing to compare against, or nothing changed.
export function shouldFactCheck({ verified, force, baseline, body_md }) {
  if (verified || force) return false;
  if (!baseline) return false;
  return baseline !== body_md;
}
