// The three broker changes the portal rests on, tested at the seam rather than inside:
//   1. the gate accepts the portal's header only when the secret is set, and only when it matches;
//   2. /api/calls is gated like the rest of the survey family;
//   3. the grader's ElevenLabs fallback is inert without a key, never throws, and turns the API's
//      HTML into text the scorer can quote.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isProtected } from "../middleware.js";
import { htmlToText, fetchElevenLabsDocument } from "../lib/kb-text.js";
import { clampLimit, summarize } from "../lib/calls.js";

const req = (path, headers = {}) => ({
  url: `https://example.vercel.app${path}`,
  headers: { get: (k) => headers[String(k).toLowerCase()] },
});

async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); }
  finally { for (const k of Object.keys(vars)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("the internal header opens the gate only when the secret is set and matches", async () => {
  const { default: middleware } = await import("../middleware.js");
  await withEnv({ SURVEY_PASSWORD: "pw", ROBIN_INTERNAL_SECRET: "s3cret" }, () => {
    assert.equal(middleware(req("/api/metrics", { "x-robin-internal": "s3cret" })), undefined, "matching header passes");
    assert.equal(middleware(req("/api/metrics", { "x-robin-internal": "wrong" }))?.status, 401, "wrong header is denied");
    assert.equal(middleware(req("/api/metrics"))?.status, 401, "no header, no password: denied");
  });
  await withEnv({ SURVEY_PASSWORD: "pw", ROBIN_INTERNAL_SECRET: undefined }, () => {
    assert.equal(middleware(req("/api/metrics", { "x-robin-internal": "s3cret" }))?.status, 401,
      "with no secret configured the header is ignored — the branch is inert");
  });
  await withEnv({ SURVEY_PASSWORD: "pw", ROBIN_INTERNAL_SECRET: "s3cret" }, () => {
    const basic = "Basic " + Buffer.from("anyone:pw").toString("base64");
    assert.equal(middleware(req("/survey", { authorization: basic })), undefined, "the password still works alongside the header");
    assert.equal(middleware(req("/api/verify_caller", { "x-robin-internal": "wrong" })), undefined, "Robin's endpoints never reach the check");
  });
});

test("/api/calls is behind the gate and named in the matcher", async () => {
  const { config } = await import("../middleware.js");
  assert.equal(isProtected("/api/calls"), true);
  assert.equal(isProtected("/api/calls?limit=20"), true);
  assert.equal(isProtected("/api/callsheet"), false, "a sibling is not swept in");
  assert.ok(config.matcher.includes("/api/calls"));
  assert.equal(isProtected("/api/call-scores"), true);
  assert.equal(isProtected("/api/call-scores?id=conv_x"), true);
  assert.ok(config.matcher.includes("/api/call-scores"));
});

test("htmlToText keeps the words and the block structure, drops the markup", () => {
  const html = '<html><body><div data-name="X"><h1>Loans</h1><p><b>Minimum:</b> $1,000.</p><p>One loan &amp; done &#8212; ok</p></div></body></html>';
  const text = htmlToText(html);
  assert.match(text, /^Loans\n/);
  assert.match(text, /Minimum: \$1,000\./);
  assert.match(text, /One loan & done — ok/);
  assert.doesNotMatch(text, /<|>/);
  assert.equal(htmlToText("# Already markdown\n\n**Bold** stays"), "# Already markdown\n\n**Bold** stays");
  assert.equal(htmlToText(null), "");
});

test("fetchElevenLabsDocument is inert without a key and never throws", async () => {
  await withEnv({ ELEVENLABS_API_KEY: undefined }, async () => {
    let called = false;
    const out = await fetchElevenLabsDocument("omgR8I0aJlWd7BAUptbJ", { fetchImpl: async () => { called = true; } });
    assert.equal(out, null); assert.equal(called, false, "no key: no network call");
  });
  await withEnv({ ELEVENLABS_API_KEY: "k" }, async () => {
    const ok = await fetchElevenLabsDocument("omgR8I0aJlWd7BAUptbJ", { fetchImpl: async (url, opts) => {
      assert.match(url, /\/v1\/convai\/knowledge-base\/omgR8I0aJlWd7BAUptbJ$/);
      assert.equal(opts.headers["xi-api-key"], "k");
      return { ok: true, json: async () => ({ name: "Vertex — Loans", extracted_inner_html: "<h1>Loans</h1><p>Prime + 1%</p>" }) };
    }});
    assert.deepEqual(ok, { title: "Vertex — Loans", body_md: "Loans\nPrime + 1%" });
    assert.equal(await fetchElevenLabsDocument("omgR8I0aJlWd7BAUptbJ", { fetchImpl: async () => ({ ok: false }) }), null, "404 is a miss");
    assert.equal(await fetchElevenLabsDocument("omgR8I0aJlWd7BAUptbJ", { fetchImpl: async () => { throw new Error("net"); } }), null, "network error is a miss");
    assert.equal(await fetchElevenLabsDocument("../etc", { fetchImpl: async () => { throw new Error("must not be called"); } }), null, "a malformed id is never sent");
  });
});

test("calls helpers: limit is clamped and the summary counts the right windows", () => {
  assert.equal(clampLimit(undefined), 50);
  assert.equal(clampLimit("abc"), 50);
  assert.equal(clampLimit("0"), 50);
  assert.equal(clampLimit("20"), 20);
  assert.equal(clampLimit("5000"), 100);
  const now = Date.parse("2026-09-16T12:00:00Z");
  const rows = [
    { started_at: "2026-09-16T10:00:00Z", scored_at: null },          // today, ungraded
    { started_at: "2026-09-15T10:00:00Z", scored_at: "2026-09-15T11:00:00Z" }, // yesterday, graded
    { started_at: "2026-09-10T10:00:00Z", scored_at: null },          // 6 days ago, ungraded
    { started_at: "junk", scored_at: null },                          // unparseable date, still ungraded
  ];
  assert.deepEqual(summarize(rows, now), { last_24h: 1, last_7d: 3, ungraded_in_window: 3 });
});
