// /api/calls with the channel field: the real handler against a stubbed database.
//
// Covers the two paths that matter. When the database accepts the channel select, every row comes
// back with `channel` and none of the helper fields (the select never carries a phone number). When
// the database REJECTS that select (the one thing that cannot be proven without the live REST
// layer), the list must still load, with channel: null, instead of failing.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const { default: handler } = await import("../api/calls.js");

const BASE_ROWS = [
  { conversation_id: "c1", topic: "401(k) loan", outcome: "resolved", scored_at: null },
  { conversation_id: "c2", topic: "401(k) loan", outcome: "resolved", scored_at: "2026-10-01T00:00:00Z" },
];

function stubDatabase({ rejectChannelSelect }) {
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (u.includes("started_at=gte.")) return reply(200, [{ started_at: new Date().toISOString(), scored_at: null }]);
    if (u.includes("raw_payload")) {
      if (rejectChannelSelect) return reply(400, { code: "PGRST100", message: "failed to parse select parameter" });
      return reply(200, [
        { ...BASE_ROWS[0], text_only: "true", phone_type: null },
        { ...BASE_ROWS[1], text_only: "false", phone_type: "twilio" },
      ]);
    }
    return reply(200, BASE_ROWS);
  };
  return seen;
}

function run() {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; resolve(this); return this; },
    };
    handler({ method: "GET", query: { limit: "10" } }, res);
  });
}

test("rows carry a channel, and no helper field or phone number leaves the server", async () => {
  const seen = stubDatabase({ rejectChannelSelect: false });
  const res = await run();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.calls.map((c) => [c.conversation_id, c.channel]), [["c1", "chat"], ["c2", "phone"]]);
  for (const c of res.body.calls) {
    assert.ok(!("text_only" in c) && !("phone_type" in c) && !("external_number" in c));
  }
  assert.ok(seen.some((u) => u.includes("phone_call->>type")), "the channel select was sent");
  assert.ok(!seen.some((u) => u.includes("external_number")), "the caller's number is never requested");
});

test("if the database rejects the channel select, the list still loads with channel null", async () => {
  const seen = stubDatabase({ rejectChannelSelect: true });
  const res = await run();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.calls.map((c) => [c.conversation_id, c.channel]), [["c1", null], ["c2", null]]);
  assert.equal(seen.filter((u) => u.includes("raw_payload")).length, 1, "tried the channel select once");
});
