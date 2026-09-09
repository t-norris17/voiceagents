// What the password gate covers, and what it must never cover.
//
// This file exists because the first version of middleware.js used
//   matcher: [..., "/api/survey-:path*"]
// which is not a valid path-to-regexp pattern — it throws "Can not repeat 'path' without a prefix
// and suffix". Shipping it would have left /api/survey-export and /api/survey-call ungated: the
// full CSV of every response, and every transcript, to anyone with the URL. Nothing would have
// failed loudly; the pages would have looked correct.
//
// It cannot be caught on a preview deployment either — Vercel's own SSO answers first there, so
// this gate's 401 is unobservable. Hence a plain predicate, tested here.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isProtected } from "../middleware.js";

const GATED = [
  "/survey", "/survey/", "/survey/slide/",
  "/dashboard", "/dashboard/",
  "/api/metrics", "/api/metrics?window=7d",
  "/api/survey-export", "/api/survey-call", "/api/survey-ask", "/api/survey-themes",
];

// Gating any of these does not hide a dashboard — it takes Robin off the phone. ElevenLabs calls
// verify_caller and get_balance MID-CALL, and posts to /api/postcall unauthenticated (it
// authenticates with ELEVENLABS_WEBHOOK_SECRET instead).
const MUST_STAY_OPEN = [
  "/api/postcall", "/api/verify_caller", "/api/get_balance",
  "/api/ask", "/api/grade", "/api/questions", "/api/gap_request",
  "/", "/robin-q-tester/",
];

// Sibling routes that merely start with the same letters. A bare startsWith() would sweep these in.
const NEIGHBOURS = ["/surveys", "/dashboards", "/api/metrics-public", "/survey-notes"];

test("every survey surface is behind the password", () => {
  for (const p of GATED) assert.equal(isProtected(p), true, `${p} should be gated`);
});

test("Robin's own endpoints are never gated", () => {
  for (const p of MUST_STAY_OPEN) assert.equal(isProtected(p), false, `${p} must stay open`);
});

test("neighbouring paths are not swept in by prefix", () => {
  for (const p of NEIGHBOURS) assert.equal(isProtected(p), false, `${p} should not be gated`);
});

test("junk input does not throw or gate", () => {
  for (const p of [undefined, null, "", "not-a-path"]) assert.equal(isProtected(p), false);
});
