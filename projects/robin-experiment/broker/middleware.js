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
  matcher: ["/survey/:path*", "/dashboard/:path*", "/api/metrics", "/api/survey-:path*"],
};

export default function middleware(request) {
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

  const header = request.headers.get("authorization") || "";
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
