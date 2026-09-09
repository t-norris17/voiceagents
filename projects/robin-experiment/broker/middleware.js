// Path-scoped password gate.
//
// WHY NOT VERCEL'S PASSWORD PROTECTION: it is per-deployment, not per-path. Any setting that
// covers this project's production domain also covers /api/verify_caller and /api/get_balance,
// which ElevenLabs calls MID-CALL. Gating those doesn't hide a dashboard, it takes Robin down —
// every caller fails verification and gets transferred. So the gate lives here, where it can tell
// a leadership viewer from an agent tool call.
//
// WHAT THIS PROTECTS: the survey and grader pages and the endpoints that carry their data —
// aggregate results, per-call transcripts, verbatim comments, the CSV export.
// WHAT IT DELIBERATELY LEAVES OPEN: Robin's own tool endpoints and the post-call webhook, which
// authenticates itself with ELEVENLABS_WEBHOOK_SECRET and must accept unauthenticated POSTs.
export const config = {
  // Node, not edge: the build warns that the edge runtime is deprecated here, and nothing in this
  // gate needs edge — it reads one env var and compares a string.
  runtime: "nodejs",
  // Deliberately NO `matcher`. The first version of this file carried
  // matcher: [..., "/api/survey-:path*"], which is not a valid path-to-regexp pattern at all — it
  // throws "Can not repeat 'path' without a prefix and suffix", because a repeated parameter has
  // to follow a "/". Had that shipped, /api/survey-export and /api/survey-call would have been
  // UNGATED: the full CSV of every response and every transcript, served to anyone with the URL.
  //
  // A security boundary should not depend on a pattern dialect that fails silently at the edge and
  // cannot be exercised from a preview deployment (Vercel's own SSO answers first there, so a 401
  // from this gate is unobservable). So the middleware runs on everything and the decision lives in
  // isProtected() below, in plain JavaScript, next to the tests that prove what it covers.
};

// Everything the survey publishes: the pages, and every endpoint that carries their data —
// aggregate results, per-call transcripts, verbatim comments, the CSV export.
const PROTECTED = ["/survey", "/dashboard", "/api/metrics", "/api/survey-"];

// Robin's own endpoints and the post-call webhook are deliberately NOT in that list. ElevenLabs
// calls verify_caller and get_balance mid-call and posts to /api/postcall unauthenticated (it
// authenticates with ELEVENLABS_WEBHOOK_SECRET instead). Gating those would not hide a dashboard,
// it would take the agent down — every caller would fail verification.
export function isProtected(pathname) {
  const p = String(pathname || "").split("?")[0];
  return PROTECTED.some((base) =>
    // Exact match, or a child path. "/surveys-of-something" must NOT match "/survey"; a prefix
    // test alone would let a sibling route in, or lock one out, by accident.
    base.endsWith("-") ? p.startsWith(base) : p === base || p.startsWith(base + "/")
  );
}

// Without a `matcher` this middleware runs on EVERY request, Robin's mid-call tool calls included.
// That makes an exception in here an agent outage: a throw becomes a 500 on /api/verify_caller, and
// every caller fails verification and gets transferred. So nothing between the request arriving and
// the pass-through for Robin's paths is allowed to throw.
//
// A URL we cannot parse is denied rather than passed: it is not a shape ElevenLabs produces, and
// guessing in the permissive direction is how a gate quietly stops being one.
function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

export default function middleware(request) {
  const pathname = pathnameOf(request?.url);
  if (pathname !== null && !isProtected(pathname)) return;

  const expected = process.env.SURVEY_PASSWORD;

  // Fail CLOSED. An unset password must not silently publish transcripts; it must break loudly
  // and visibly, on the page, where whoever deployed it will see it immediately.
  if (!expected) {
    return new Response(
      "This page is locked because SURVEY_PASSWORD is not set on this deployment.\n\n" +
        "Set it in Vercel: Project Settings -> Environment Variables -> Add\n" +
        "  Name:  SURVEY_PASSWORD\n" +
        "  Value: (a shared password for whoever should see the survey results)\n" +
        "  Environments: Production, Preview, Development\n\n" +
        "Then redeploy. Robin's own endpoints are unaffected and keep working while this is unset.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  // Optional-chained for the same reason as pathnameOf: nothing on the path to Robin's
  // pass-through, or to a clean 401, may throw.
  const header = request?.headers?.get?.("authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = "";
    }
    // Any username is accepted; this is one shared password, not a user directory.
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded.includes(":") && timingSafeEqual(supplied, expected)) return;
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Robin survey", charset="UTF-8"',
      "content-type": "text/plain",
    },
  });
}

// Constant-time within the limits of the runtime: compare every byte rather than bailing on the
// first mismatch, so response timing doesn't leak how much of the password was right.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
