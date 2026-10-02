// /api/kb_list must say what is really attached to Robin. "published" is a state in our table; whether
// she uses a document is a fact about the agent in ElevenLabs, and the two drifted: 29 INTRUST articles
// are published and attached to no agent, and her five live Vertex documents have no row here.
//
// Stubbed fetch for both Supabase and ElevenLabs. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
process.env.ELEVENLABS_API_KEY = "k";
process.env.ELEVENLABS_AGENT_ID = "agent_x";
const { default: handler } = await import("../api/kb_list.js");

const ROWS = [
  { id: "r1", slug: "attached-one", state: "published", elevenlabs_document_id: "DOC_ATTACHED" },
  { id: "r2", slug: "orphan", state: "published", elevenlabs_document_id: "DOC_ORPHAN" },
  { id: "r3", slug: "waiting", state: "approved", elevenlabs_document_id: null },
];
const AGENT = { conversation_config: { agent: { prompt: { knowledge_base: [
  { id: "DOC_ATTACHED", name: "Factory article", type: "text", usage_mode: "auto" },
  { id: "DOC_DASHBOARD", name: "Uploaded in the dashboard", type: "file", usage_mode: "auto" },
] } } } };

function run({ agent = AGENT, agentStatus = 200 } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
    if (u.includes("/convai/agents/")) return reply(agentStatus, agent);
    return reply(200, ROWS);
  };
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method: "GET", query: {} }, res);
  });
}

test("each row says whether Robin actually has its document", async () => {
  const res = await run();
  assert.equal(res.code, 200);
  const by = Object.fromEntries(res.body.rows.map((r) => [r.slug, r.attached]));
  assert.equal(by["attached-one"], true);
  assert.equal(by["orphan"], false, "published but attached to no agent");
  assert.equal(by["waiting"], false, "an approved row has no document yet");
  assert.equal(res.body.attached_known, true);
});

test("the response lists EVERY document attached to her, including ones the Factory never made", async () => {
  const res = await run();
  assert.deepEqual(res.body.attached.map((d) => d.name), ["Factory article", "Uploaded in the dashboard"]);
});

test("if the agent cannot be read the list still loads, with attached unknown rather than guessed", async () => {
  const res = await run({ agentStatus: 403 });
  assert.equal(res.code, 200);
  assert.equal(res.body.attached_known, false);
  assert.ok(res.body.rows.every((r) => r.attached === null));
  assert.match(res.body.attached_error, /403/);
});

test("an agent with no knowledge_base list is unknown, not empty", async () => {
  const res = await run({ agent: { conversation_config: { agent: { prompt: {} } } } });
  assert.equal(res.body.attached_known, false);
});
