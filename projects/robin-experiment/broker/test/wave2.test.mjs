// Wave 2 readiness: wave windows shared with Quality (lib/waves.js), extra phone agents from
// ROBIN_AGENT_IDS (lib/requests.js), a second webhook signing secret (api/postcall.js), and the wave
// filter on /api/calls end to end against a stubbed database.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pickWave, inWave, waveOptions, loadWaves } from "../lib/waves.js";
import { extraAgents, recordsCalls, filesRequests, safetyNetDecision, AGENTS } from "../lib/requests.js";
// The database client reads its address when first loaded, so the stub address is set before any
// module that imports it (api/postcall.js, api/calls.js) is loaded.
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const { verifySig, webhookSecrets } = await import("../api/postcall.js");

// The live rows (2026-11-25) plus the second wave as migration 027 declares it.
const WAVES = [
  { wave: "internal", label: "Internal testing", internal: true, started_at: "2026-09-08T05:00:00+00:00", ended_at: "2026-09-21T05:00:00+00:00" },
  { wave: "first", label: "First wave", internal: false, started_at: "2026-09-21T05:00:00+00:00", ended_at: "2026-09-24T05:00:00+00:00" },
  { wave: "second", label: "Second wave", internal: false, started_at: "2026-12-10T17:30:00+00:00", ended_at: null },
];

test("a wave is its date window: start inclusive, end exclusive, no end means still running", () => {
  const first = pickWave(WAVES, "first"), second = pickWave(WAVES, "SECOND");
  assert.equal(first.label, "First wave");
  assert.equal(inWave("2026-09-21T05:00:00Z", first), true, "midnight Central on the first day is in");
  assert.equal(inWave("2026-09-24T05:00:00Z", first), false, "midnight after the last day is out");
  assert.equal(inWave("2026-12-10T17:29:59Z", second), false, "11:29:59 AM Central on Dec 10 is before wave 2");
  assert.equal(inWave("2026-12-10T17:30:00Z", second), true, "11:30 AM Central on Dec 10 starts wave 2 (CST, UTC-6)");
  assert.equal(inWave("2027-03-01T12:00:00Z", second), true, "an open wave has no end");
  assert.equal(inWave(null, second), false, "no timestamp, no wave");
});

test("no wave, 'all', or a name no wave has means every row", () => {
  for (const raw of [undefined, "", "all", "ALL", "third", "first'; drop"]) {
    const w = pickWave(WAVES, raw);
    assert.equal(w, null, String(raw));
    assert.equal(inWave("2020-01-01T00:00:00Z", w), true);
  }
});

test("the filter row lists All first, then each wave in order, with counts", () => {
  const rows = [{ t: "2026-09-10T12:00:00Z" }, { t: "2026-09-22T12:00:00Z" }, { t: "2026-12-11T12:00:00Z" }, { t: "2026-11-01T12:00:00Z" }];
  assert.deepEqual(waveOptions(WAVES, rows, "t").map((o) => [o.key, o.count]),
    [["all", 4], ["internal", 1], ["first", 1], ["second", 1]]);
});

test("a waves read that fails or returns junk leaves the pages working without waves", async () => {
  assert.deepEqual(await loadWaves(async () => { throw new Error("supabase 500"); }), []);
  assert.deepEqual(await loadWaves(async () => [{ conversation_id: "c1" }, null, { wave: "first" }]), [{ wave: "first" }]);
});

test("ROBIN_AGENT_IDS adds phone agents; unset or junk changes nothing", () => {
  const W2 = "agent_7701enterpriserobin01";
  assert.deepEqual(extraAgents({}), []);
  assert.deepEqual(extraAgents({ ROBIN_AGENT_IDS: ` ${W2}, agent_x , *, not-an-agent ` }), [W2], "only well-formed agent ids count");
  const env = { ROBIN_AGENT_IDS: W2 };
  assert.equal(recordsCalls(W2, env), true);
  assert.equal(filesRequests(W2, env), true);
  assert.equal(recordsCalls(W2, {}), false, "without the setting the new agent is dropped, as before");
  assert.equal(recordsCalls(AGENTS.robin, {}), true, "the built-in agents still count");
  assert.equal(recordsCalls("agent_someoneelse0001", env), false);
});

test("wave 2's agent can be a safety-net filer for an after-hours call", () => {
  const W2 = "agent_7701enterpriserobin01";
  const base = { agentId: W2, requestType: "loan", externalNumber: "+13165550101", startedAt: "2026-12-08T04:00:00Z", linked: false, now: new Date("2026-12-08T04:05:00Z") };
  assert.equal(safetyNetDecision({ ...base, env: { ROBIN_AGENT_IDS: W2, VERCEL_ENV: "production" } }).file, true);
  assert.equal(safetyNetDecision({ ...base, env: { VERCEL_ENV: "production" } }).why, "agent does not file requests");
});

test("either signing secret verifies a webhook; an unset one never matches", () => {
  const raw = '{"type":"post_call_transcription"}', t = "1795620000";
  const sign = (secret) => `t=${t},v0=${crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
  const secrets = webhookSecrets({ ELEVENLABS_WEBHOOK_SECRET: "wsec_personal", ELEVENLABS_WEBHOOK_SECRET_ENTERPRISE: "wsec_enterprise" });
  assert.equal(secrets.some((s) => verifySig(raw, sign("wsec_enterprise"), s)), true);
  assert.equal(secrets.some((s) => verifySig(raw, sign("wsec_personal"), s)), true);
  assert.equal(secrets.some((s) => verifySig(raw, sign("wsec_other"), s)), false);
  assert.deepEqual(webhookSecrets({ ELEVENLABS_WEBHOOK_SECRET: "a", ELEVENLABS_WEBHOOK_SECRET_ENTERPRISE: "" }), ["a"]);
  assert.equal(verifySig(raw, sign(""), undefined), false);
});

test("/api/calls?wave= narrows list, matching and totals, but not the landing page's 7-day counts", async () => {
  const ROWS = [
    { conversation_id: "w1a", started_at: "2026-09-22T12:00:00Z", scored_at: null },
    { conversation_id: "w1b", started_at: "2026-09-23T12:00:00Z", scored_at: "2026-09-23T13:00:00Z" },
    { conversation_id: "mid", started_at: "2026-11-19T12:00:00Z", scored_at: null },
    { conversation_id: "w2a", started_at: "2026-12-11T12:00:00Z", scored_at: null },
  ];
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    const reply = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (u.includes("experiment_waves")) return reply(WAVES);
    if (u.includes("call_question_scores")) return reply([]);
    const m = u.match(/conversation_id=in\.\((.*?)\)&select/);
    if (m) { const ids = m[1].split(",").map((s) => s.replace(/"/g, "")); return reply(ROWS.filter((r) => ids.includes(r.conversation_id))); }
    return reply(ROWS);
  };
  const { default: handler } = await import("../api/calls.js");
  const run = (query) => new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method: "GET", query }, res);
  });
  const first = (await run({ limit: "10", wave: "first" })).body;
  assert.deepEqual(first.calls.map((c) => c.conversation_id).sort(), ["w1a", "w1b"]);
  assert.equal(first.matching, 2); assert.equal(first.totals.total, 2); assert.equal(first.wave, "first");
  const second = (await run({ limit: "10", wave: "second" })).body;
  assert.deepEqual(second.calls.map((c) => c.conversation_id), ["w2a"]);
  const all = (await run({ limit: "10" })).body;
  assert.equal(all.matching, 4); assert.equal(all.wave, "all");
  assert.deepEqual(all.waves.map((o) => [o.key, o.count]), [["all", 4], ["internal", 0], ["first", 2], ["second", 1]]);
  assert.deepEqual(first.summary, all.summary, "the 24h/7d counts ignore the wave");
});
