// The cleaner's door: only the Birdnest portal gets in.
//
// WHY THIS EXISTS. Until 2026-10-05 this project had no gate at all. An unauthenticated GET of
// /api/kb_list from the open internet returned the full article list, and by the code /api/publish and
// /api/unpublish (which attach and remove documents on Robin's LIVE knowledge base) and /api/clean
// (paid model calls) were just as open. The Knowledge Factory now lives inside the portal, which
// proxies these same paths server-side and identifies itself with the x-robin-internal header (the same
// shared secret the broker accepts). So the rule here is the simplest one that is safe: that header,
// or nothing. The cleaner's own standalone console page stops loading, by design; use the portal.
//
// Unlike the broker, nothing here sits on a live call: ElevenLabs never calls the cleaner. So there is
// no path list and no exception. Every request, pages and APIs alike, goes through this check.
//
// Fails CLOSED when ROBIN_INTERNAL_SECRET is unset: a 503 that names the fix, never an open door.
export const config = {
  // Node, not edge, the same as the broker's gate: the build warns that edge is deprecated here, and
  // this reads one env var and compares a string.
  runtime: "nodejs",
};

const HEADER = "x-robin-internal";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns undefined to let the request through (Vercel Routing Middleware's pass-through), or a
// Response that ends it. Nothing in here may throw: an exception would surface as a 500 that hides
// which of the two answers was meant.
export default function middleware(request) {
  const secret = process.env.ROBIN_INTERNAL_SECRET;
  if (!secret) {
    return new Response(
      "The Knowledge Factory service is locked because ROBIN_INTERNAL_SECRET is not set on this deployment.\n" +
        "Set it in Vercel (Project Settings -> Environment Variables) to the same value as the portal and the broker, then redeploy.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  const supplied = request?.headers?.get?.(HEADER) || "";
  if (supplied && timingSafeEqual(supplied, secret)) return;
  return new Response("This service only answers the Birdnest portal.", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
