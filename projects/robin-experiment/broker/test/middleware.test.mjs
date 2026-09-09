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

// The middleware runs on every request, so a throw in it is an agent outage, not a broken page:
// a 500 on /api/verify_caller fails every caller's verification mid-call. These prove it survives
// whatever it is handed, and that Robin's paths still pass through untouched.
test("middleware never throws, and lets Robin's endpoints through", async () => {
  const { default: middleware } = await import("../middleware.js");
  const before = process.env.SURVEY_PASSWORD;
  process.env.SURVEY_PASSWORD = "test-password";
  try {
    for (const p of MUST_STAY_OPEN) {
      const res = middleware({ url: `https://example.vercel.app${p}` });
      assert.equal(res, undefined, `${p} should pass straight through`);
    }
    for (const bad of [undefined, null, "", "://nonsense", {}]) {
      // Unparseable: denied, but crucially it returns a response rather than throwing.
      const res = middleware({ url: bad });
      assert.equal(res?.status, 401, "an unparseable URL is denied, not thrown on");
    }
    assert.doesNotThrow(() => middleware({}));
    assert.doesNotThrow(() => middleware(undefined));
  } finally {
    if (before === undefined) delete process.env.SURVEY_PASSWORD;
    else process.env.SURVEY_PASSWORD = before;
  }
});

test("a protected path with no password set fails closed, not open", async () => {
  const { default: middleware } = await import("../middleware.js");
  const before = process.env.SURVEY_PASSWORD;
  delete process.env.SURVEY_PASSWORD;
  try {
    const res = middleware({ url: "https://example.vercel.app/api/survey-export" });
    assert.equal(res.status, 503, "unset password must lock the page, never serve it");
    // ...while Robin still gets through, because her paths never reach the password check.
    assert.equal(middleware({ url: "https://example.vercel.app/api/verify_caller" }), undefined);
  } finally {
    if (before !== undefined) process.env.SURVEY_PASSWORD = before;
  }
});

// The matcher decides what RUNS; isProtected decides what is DENIED. They are two lists, so they
// can drift — and drift here is silent and one-directional: add api/survey-new.js, and isProtected
// covers it (the "/api/survey-" prefix) while the matcher does not, so the middleware never runs
// and the endpoint serves survey data to anyone. That is the same failure the invalid glob would
// have caused, arriving by a different route.
//
// So this reads the actual endpoint files off disk and insists each one is named in the matcher.
// A new survey endpoint fails the suite until it is gated.
test("every /api/survey-* endpoint on disk is named in the matcher", async () => {
  const { readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));

  const { config } = await import("../middleware.js");
  const matcher = config.matcher;

  const endpoints = readdirSync(join(here, "..", "api"))
    .filter((f) => f.startsWith("survey-") && f.endsWith(".js"))
    .map((f) => `/api/${f.replace(/\.js$/, "")}`);

  assert.ok(endpoints.length > 0, "expected to find survey endpoints to check");
  for (const route of endpoints) {
    assert.ok(matcher.includes(route), `${route} exists but is not in middleware.js matcher — it would be UNGATED`);
    assert.equal(isProtected(route), true, `${route} is not covered by isProtected either`);
  }
});

// The reverse: nothing in the matcher should be a route the predicate would wave through, or the
// middleware would run and then pass the request on anyway.
test("every matcher route is one isProtected actually denies", async () => {
  const { config } = await import("../middleware.js");
  for (const route of config.matcher) {
    const concrete = route.replace("/:path*", "/something");
    assert.equal(isProtected(concrete), true, `matcher lists ${route} but isProtected says it is open`);
  }
});
