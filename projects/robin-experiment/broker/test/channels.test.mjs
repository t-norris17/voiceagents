// /api/channels: the real handler against a stubbed database.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const { default: handler } = await import("../api/channels.js");

function run(method = "GET") {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method }, res);
  });
}
const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

test("maps each conversation to its channel, leaves out the ones that do not say, and carries no phone number", async () => {
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(decodeURIComponent(String(url)));
    return reply(200, [
      { conversation_id: "a", text_only: "false", phone_type: "twilio" },
      { conversation_id: "b", text_only: "true", phone_type: null },
      { conversation_id: "c", text_only: "false", phone_type: null },
      { conversation_id: "d", text_only: null, phone_type: null },
    ]);
  };
  const r = await run();
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.channels, { a: "phone", b: "chat", c: "web_voice" });
  assert.ok(!seen.some((u) => u.includes("external_number")), "the caller's number is never requested");
  assert.match(r.headers["cache-control"], /max-age=60/);
});

test("if the database rejects the channel select, the page gets an empty map, not an error", async () => {
  globalThis.fetch = async () => reply(400, { code: "PGRST100", message: "failed to parse select parameter" });
  const r = await run();
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.channels, {});
});

test("only GET", async () => {
  const r = await run("POST");
  assert.equal(r.code, 405);
});
