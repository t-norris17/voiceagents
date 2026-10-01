// Dry Run reads what Robin is RIGHT NOW from ElevenLabs: her live prompt and the documents attached to
// her. These tests pin the seam that was wrong before: a snapshot (embedded INTRUST text, or "whatever is
// published") standing in for the agent. Stubbed fetch; nothing here touches ElevenLabs.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { liveRobin, dryRunSystem } from "../lib/robin-live.js";

const ENV = { ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "agent_x" };
const AGENT = { conversation_config: { agent: { prompt: {
  prompt: "You are Robin, for the Vertex Manufacturing plan.", temperature: 0.45,
  knowledge_base: [
    { id: "docloans01", name: "Vertex 401(k) Loans", usage_mode: "auto", type: "file" },
    { id: "docroll001", name: "Vertex 401(k) Rolling", usage_mode: "auto", type: "file" },
    { id: "docgone001", name: "Gone", usage_mode: "auto", type: "file" },
  ] } } } };
const DOCS = { docloans01: "<h1>Loans</h1><p>Minimum loan is $1,000.</p>", docroll001: "<p>Rollovers are accepted.</p>" };

function stub({ agent = AGENT, status = 200 } = {}) {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    const u = String(url);
    if (u.includes("/convai/agents/")) return { ok: status < 400, status, json: async () => agent };
    const id = u.split("/").pop();
    if (DOCS[id]) return { ok: true, status: 200, json: async () => ({ name: id, extracted_inner_html: DOCS[id] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, seen };
}

test("reads the attached documents, the live prompt and the configured temperature", async () => {
  const { fetchImpl } = stub();
  const live = await liveRobin({ fetchImpl, env: ENV, ttl: 0 });
  assert.equal(live.temperature, 0.45);
  assert.deepEqual(live.documents.map((d) => d.name), ["Vertex 401(k) Loans", "Vertex 401(k) Rolling", "Gone"]);
  assert.match(live.kbText, /Minimum loan is \$1,000/);
  assert.match(live.kbText, /Rollovers are accepted/);
});

test("a document that cannot be read is named, not silently dropped, and the rest still work", async () => {
  const { fetchImpl } = stub();
  const live = await liveRobin({ fetchImpl, env: ENV, ttl: 0 });
  assert.deepEqual(live.unreadable, ["Gone"]);
  assert.ok(!live.kbText.includes("Gone"));
});

test("it NEVER falls back to other knowledge: missing config is an error that says what to set", async () => {
  await assert.rejects(liveRobin({ env: { ELEVENLABS_AGENT_ID: "a" }, ttl: 0 }), /ELEVENLABS_API_KEY/);
  await assert.rejects(liveRobin({ env: { ELEVENLABS_API_KEY: "k" }, ttl: 0 }), /ELEVENLABS_AGENT_ID/);
});

test("an agent with nothing attached, or an unreadable agent, is an error", async () => {
  const empty = { conversation_config: { agent: { prompt: { prompt: "p", knowledge_base: [] } } } };
  await assert.rejects(liveRobin({ ...stub({ agent: empty }), env: ENV, ttl: 0 }), /No knowledge-base documents are attached/);
  await assert.rejects(liveRobin({ ...stub({ status: 403 }), env: ENV, ttl: 0 }), /403/);
});

test("when every attached document is unreadable it is an error, not an empty knowledge base", async () => {
  const agent = { conversation_config: { agent: { prompt: { prompt: "p", knowledge_base: [{ id: "nothing001", name: "N" }] } } } };
  await assert.rejects(liveRobin({ ...stub({ agent }), env: ENV, ttl: 0 }), /could be read/);
});

test("the system prompt is her live prompt plus her documents, framed as a dry run, and says nothing about INTRUST", () => {
  const sys = dryRunSystem({ prompt: "You are Robin, for the Vertex Manufacturing plan.", kbText: "--- DOCUMENT: Loans ---\nMinimum loan is $1,000." });
  assert.match(sys, /TEXT DRY RUN/);
  assert.match(sys, /Vertex Manufacturing plan/);
  assert.match(sys, /Minimum loan is \$1,000/);
  assert.ok(sys.indexOf("REMINDER") > sys.indexOf("KNOWLEDGE ATTACHED"), "the dry-run rules are restated last");
  assert.ok(!/INTRUST/i.test(sys), "no INTRUST persona leaks in");
});

test("the agent is read once per minute, not once per question", async () => {
  const { fetchImpl, seen } = stub();
  let t = 1000; const now = () => t;
  await liveRobin({ fetchImpl, env: ENV, now, ttl: 60000 });
  const first = seen.length; t += 30000;
  await liveRobin({ fetchImpl, env: ENV, now, ttl: 60000 });
  assert.equal(seen.length, first, "second call within the minute is served from cache");
  t += 40000;
  await liveRobin({ fetchImpl, env: ENV, now, ttl: 60000 });
  assert.ok(seen.length > first, "after the minute it reads again");
});

// The endpoint itself: with Robin's configuration unreadable it refuses (503) instead of answering from
// some other knowledge. This is the behaviour that replaced the silent INTRUST fallback.
// The handler imports the Anthropic SDK, so this one needs `npm ci` first; without it, it is SKIPPED, not passed.
const hasSdk = (() => { try { createRequire(import.meta.url).resolve("@anthropic-ai/sdk"); return true; } catch { return false; } })();
test("/api/ask refuses with a 503 that names the missing setting, on GET and on POST", { skip: hasSdk ? false : "@anthropic-ai/sdk is not installed (run npm ci)" }, async () => {
  delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_AGENT_ID;
  process.env.ANTHROPIC_API_KEY = "test";
  const { default: handler } = await import("../api/ask.js");
  const call = (req) => new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler(req, res);
  });
  const get = await call({ method: "GET" });
  assert.equal(get.code, 503); assert.match(get.body.error, /ELEVENLABS_API_KEY/);
  const post = await call({ method: "POST", body: { question: "Can I take a loan?" } });
  assert.equal(post.code, 503); assert.match(post.body.error, /ELEVENLABS_API_KEY/);
});
