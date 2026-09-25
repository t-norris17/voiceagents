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

// A PREVIEW build of the portal talks to the broker preview built from the same branch, so a
// branch that changes both can be tested end to end before it reaches main. Vercel names branch
// previews <project>-git-<branch slug>-<team>.vercel.app; BROKER_PREVIEW_URL overrides the guess.
// Production and local dev are untouched: they read BROKER_URL as before.
export function brokerBase(env = process.env) {
  if (env.VERCEL_ENV === "preview") {
    if (env.BROKER_PREVIEW_URL) return env.BROKER_PREVIEW_URL.replace(/\/$/, "");
    const ref = String(env.VERCEL_GIT_COMMIT_REF || "");
    if (ref && ref !== "main") {
      const slug = ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return `https://voiceagents-git-${slug}-t-norris17s-projects.vercel.app`;
    }
  }
  return env.BROKER_URL ? env.BROKER_URL.replace(/\/$/, "") : null;
}

// Returns { base, name } for the first path segment after /api/, or null when unlisted.
export function upstreamFor(firstSegment, env = process.env) {
  const seg = String(firstSegment || "");
  if (BROKER_PATHS.has(seg)) { const base = brokerBase(env); return base ? { base, name: "broker" } : null; }
  if (CLEANER_PATHS.has(seg)) return env.CLEANER_URL ? { base: env.CLEANER_URL.replace(/\/$/, ""), name: "cleaner" } : null;
  return null;
}
