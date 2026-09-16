// The route map. Every API path the portal will proxy, and where it goes. A path not listed here
// is a 404: adding a door means adding a line, deliberately.
//
// Robin's own endpoints (verify_caller, get_balance, postcall) are NOT here. ElevenLabs calls the
// broker for those directly; the portal never sits between a live call and its tools.
export const BROKER_PATHS = new Set([
  "metrics",
  "survey-export",
  "survey-call",
  "survey-ask",
  "survey-themes",
  "calls",
  "call-scores",
  "grade",
  "ask",
  "questions",
  "gap_request",
]);

export const CLEANER_PATHS = new Set([
  "clean",
  "extract",
  "refine",
  "scan",
  "approve",
  "publish",
  "unpublish",
  "kb_list",
  "kb_article",
  "gaps",
]);

// Returns { base, name } for the first path segment after /api/, or null when unlisted.
export function upstreamFor(firstSegment, env = process.env) {
  const seg = String(firstSegment || "");
  if (BROKER_PATHS.has(seg)) return env.BROKER_URL ? { base: env.BROKER_URL.replace(/\/$/, ""), name: "broker" } : null;
  if (CLEANER_PATHS.has(seg)) return env.CLEANER_URL ? { base: env.CLEANER_URL.replace(/\/$/, ""), name: "cleaner" } : null;
  return null;
}
