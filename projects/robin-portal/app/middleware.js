// v0 gate: one shared password over the whole portal, the same Basic scheme the broker uses, so a
// person who has the survey password today needs nothing new. v1 replaces this file with a session
// and per-organisation feature grants; nothing else in the app changes.
//
// Fails CLOSED when PORTAL_PASSWORD is unset: a 503 with the fix on it, never an open portal.
import { NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The copied module pages live in public/ and Next serves public files by exact path only, so the
// directory URLs the pages are linked by (with or without the trailing slash) map to index.html.
const MODULE_DIRS = /^\/(survey\/slide|survey|robin-q-tester|dashboard|factory)\/?$/;

export function middleware(request) {
  // The wiring check is the one path outside the gate (exact match only): it reports booleans and
  // Robin's version number, nothing else, so it can be read from anywhere when the doors are dark.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const expected = process.env.PORTAL_PASSWORD;
  if (!expected) {
    return new NextResponse(
      "This portal is locked because PORTAL_PASSWORD is not set on this deployment.\n" +
        "Set it in Vercel: Project Settings -> Environment Variables -> PORTAL_PASSWORD, then redeploy.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(header.slice(6)); } catch { decoded = ""; }
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded.includes(":") && timingSafeEqual(supplied, expected)) {
      const m = request.nextUrl.pathname.match(MODULE_DIRS);
      if (m) return NextResponse.rewrite(new URL(`/${m[1]}/index.html`, request.url));
      return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Robin", charset="UTF-8"', "content-type": "text/plain" },
  });
}
