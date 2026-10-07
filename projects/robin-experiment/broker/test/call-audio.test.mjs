// Call audio: the switch, the channel rule, the route's cache-or-fetch path and its listen log, the
// sweep, and the ElevenLabs fetch. Everything external is a stub; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { audioEnabled, channelHasAudio, objectKey, idleCutoff, MIN_RECORDING_BYTES } from "../lib/call-audio.js";
import handler, { issue } from "../api/call-audio.js";
import { authorized, sweep } from "../api/call-audio-sweep.js";
import { fetchConversationAudio } from "../lib/el-audio.js";

const ID = "conv_2601m34qt28vfqsv3hmy9epxqz4h";
const NOW = new Date("2026-10-07T19:00:00Z");
const PHONE = { conversation_id: ID, text_only: "false", phone_type: "twilio" };
const CHAT = { conversation_id: ID, text_only: "true", phone_type: null };
const WEB_VOICE = { conversation_id: ID, text_only: "false", phone_type: null };

// A fake world: one ai_call_events row, an optional cache row, and logs of every write.
function world({ call = PHONE, cached = false, audio = { ok: true, bytes: new Uint8Array(5000), contentType: "audio/mpeg", ms: 10 }, signFails = 0, listenFails = false } = {}) {
  const w = { writes: [], puts: [], fetches: 0, signs: 0 };
  w.deps = {
    now: () => NOW,
    env: { CALL_AUDIO_ENABLED: "on" },
    fetchAudio: async () => { w.fetches++; return audio; },
    put: async (bucket, key, bytes, opts) => { w.puts.push({ bucket, key, size: bytes.length, ...opts }); },
    sign: async (bucket, key, opts) => {
      w.signs++;
      if (w.signs <= signFails) throw new Error("storage sign 400: Object not found");
      return `https://x.supabase.co/storage/v1/object/sign/${bucket}/${key}?token=t&e=${opts.expiresIn}`;
    },
    db: async (path, opts = {}) => {
      if (!opts.method || opts.method === "GET") {
        if (path.startsWith("ai_call_events?")) return call ? [call] : [];
        if (path.startsWith("call_audio_cache?")) return cached ? [{ conversation_id: ID }] : [];
        throw new Error(`unexpected read ${path}`);
      }
      if (listenFails && path === "call_audio_listens") throw new Error("supabase 500: down");
      w.writes.push({ path, ...opts });
      return null;
    },
  };
  return w;
}

test("the switch: explicit on/off wins; unset is on in preview only; anything else is off", () => {
  assert.equal(audioEnabled({ CALL_AUDIO_ENABLED: "on", VERCEL_ENV: "production" }), true);
  assert.equal(audioEnabled({ CALL_AUDIO_ENABLED: " ON " }), true);
  assert.equal(audioEnabled({ CALL_AUDIO_ENABLED: "off", VERCEL_ENV: "preview" }), false);
  assert.equal(audioEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(audioEnabled({ VERCEL_ENV: "preview" }), true);
  assert.equal(audioEnabled({}), false, "local/dev with nothing set stays off");
  for (const typo of ["true", "1", "yes", "onn"]) assert.equal(audioEnabled({ CALL_AUDIO_ENABLED: typo, VERCEL_ENV: "preview" }), false, typo);
});

test("only spoken conversations have a recording", () => {
  assert.equal(channelHasAudio("phone"), true);
  assert.equal(channelHasAudio("web_voice"), true);
  assert.equal(channelHasAudio("chat"), false);
  assert.equal(channelHasAudio(null), false);
  assert.equal(objectKey(ID), `${ID}.mp3`);
});

test("first play: fetch, store with a 60 s cache header, record the cache row, log a first_fetch listen, sign 5 minutes", async () => {
  const w = world();
  const out = await issue(ID, w.deps);
  assert.equal(out.status, 200);
  assert.equal(out.body.first_fetch, true);
  assert.match(out.body.url, /e=300$/);
  assert.equal(out.body.expires_at, "2026-10-07T19:05:00.000Z");
  assert.equal(w.fetches, 1);
  assert.deepEqual(w.puts, [{ bucket: "call-audio", key: `${ID}.mp3`, size: 5000, contentType: "audio/mpeg", cacheSeconds: 60 }]);
  const [cache, listen] = w.writes;
  assert.match(cache.path, /^call_audio_cache\?on_conflict=conversation_id/);
  assert.equal(cache.body.bytes, 5000);
  assert.equal(listen.path, "call_audio_listens");
  assert.deepEqual(listen.body, { conversation_id: ID, at: NOW.toISOString(), actor: "birdnest", first_fetch: true });
  assert.equal(w.writes.length, 2, "no separate last_played PATCH on a first fetch");
});

test("cached: no ElevenLabs call, a plain listen, last_played_at moves", async () => {
  const w = world({ cached: true });
  const out = await issue(ID, w.deps);
  assert.equal(out.status, 200);
  assert.equal(out.body.first_fetch, false);
  assert.equal(w.fetches, 0);
  assert.equal(w.puts.length, 0);
  assert.deepEqual(w.writes.map((x) => x.path), ["call_audio_listens", `call_audio_cache?conversation_id=eq.${ID}`]);
  assert.equal(w.writes[0].body.first_fetch, false);
  assert.equal(w.writes[1].body.last_played_at, NOW.toISOString());
});

test("web voice plays; chat and unknown conversations are 404 and nothing is fetched", async () => {
  assert.equal((await issue(ID, world({ call: WEB_VOICE }).deps)).status, 200);
  for (const call of [CHAT, null]) {
    const w = world({ call });
    const out = await issue(ID, w.deps);
    assert.equal(out.status, 404);
    assert.equal(w.fetches, 0);
    assert.equal(w.writes.length, 0, "no listen logged for a refusal");
  }
});

test("a stub smaller than a real recording is refused and never stored", async () => {
  const w = world({ audio: { ok: true, bytes: new Uint8Array(45), contentType: "audio/mpeg", ms: 1 } });
  const out = await issue(ID, w.deps);
  assert.equal(out.status, 404);
  assert.equal(w.puts.length, 0);
  assert.equal(w.writes.length, 0);
  assert.ok(MIN_RECORDING_BYTES > 45);
});

test("ElevenLabs failures pass through as their status, with nothing stored or logged", async () => {
  const w = world({ audio: { ok: false, status: 404, error: "elevenlabs 404" } });
  const out = await issue(ID, w.deps);
  assert.deepEqual(out, { status: 404, body: { error: "elevenlabs 404" } });
  assert.equal(w.writes.length, 0);
});

test("a cache row whose object is gone is refetched once, and the listen says first_fetch", async () => {
  const w = world({ cached: true, signFails: 1 });
  const out = await issue(ID, w.deps);
  assert.equal(out.status, 200);
  assert.equal(out.body.first_fetch, true);
  assert.equal(w.fetches, 1);
  assert.equal(w.puts.length, 1);
});

test("no link is issued when the listen cannot be logged", async () => {
  const w = world({ cached: true, listenFails: true });
  await assert.rejects(() => issue(ID, w.deps), /down/);
});

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test("handler: switch off is a 404 before anything else; bad ids are 400; errors are a plain 500", async () => {
  const off = world(); off.deps.env = { VERCEL_ENV: "production" };
  let res = fakeRes(); await handler({ method: "GET", query: { id: ID } }, res, off.deps);
  assert.equal(res.code, 404); assert.equal(off.fetches, 0);

  const on = world();
  res = fakeRes(); await handler({ method: "GET", query: { id: "conv_x'; drop" } }, res, on.deps);
  assert.equal(res.code, 400);
  res = fakeRes(); await handler({ method: "POST", query: { id: ID } }, res, on.deps);
  assert.equal(res.code, 405);
  res = fakeRes(); await handler({ method: "GET", query: { id: ID } }, res, on.deps);
  assert.equal(res.code, 200); assert.equal(res.headers["cache-control"], "no-store");

  const broken = world({ cached: true, listenFails: true });
  res = fakeRes(); await handler({ method: "GET", query: { id: ID } }, res, broken.deps);
  assert.equal(res.code, 500); assert.equal(res.body.url, undefined);
});

test("sweep auth: fails closed without CRON_SECRET, and only the exact bearer passes", () => {
  assert.equal(authorized({ authorization: "Bearer x" }, {}).status, 503);
  assert.equal(authorized({ authorization: "Bearer s3cret" }, { CRON_SECRET: "s3cret" }).ok, true);
  assert.equal(authorized({ authorization: "Bearer s3cre" }, { CRON_SECRET: "s3cret" }).status, 401);
  assert.equal(authorized({}, { CRON_SECRET: "s3cret" }).status, 401);
});

test("sweep: idle copies are deleted object-first; a failure is reported and the rest continue", async () => {
  const calls = [];
  const db = async (path, opts = {}) => {
    calls.push({ path, method: opts.method || "GET" });
    if (!opts.method) return [{ conversation_id: "conv_aaaaaaaa" }, { conversation_id: "conv_bbbbbbbb" }];
    return null;
  };
  const del = async (bucket, key) => { calls.push({ del: key }); if (key.startsWith("conv_aaaa")) throw new Error("storage delete 500"); };
  const out = await sweep({ db, del, now: NOW });
  assert.equal(out.deleted, 1);
  assert.equal(out.failed.length, 1);
  assert.match(calls[0].path, new RegExp(`last_played_at=lt\\.${idleCutoff(NOW).replace(/\./g, "\\.")}`));
  assert.equal(idleCutoff(NOW), "2026-09-07T19:00:00.000Z");
  assert.deepEqual(calls.slice(1).map((c) => c.del || `${c.method} ${c.path}`), [
    "conv_aaaaaaaa.mp3", "conv_bbbbbbbb.mp3", "DELETE call_audio_cache?conversation_id=eq.conv_bbbbbbbb",
  ], "a failed object delete keeps its row, so the next play refetches rather than orphaning a file");
});

test("sweep with an id deletes that one copy regardless of age", async () => {
  const seen = [];
  const db = async (path, opts = {}) => { seen.push(path); return opts.method ? null : [{ conversation_id: ID }]; };
  const out = await sweep({ id: ID, db, del: async () => {}, now: NOW });
  assert.equal(out.deleted, 1);
  assert.equal(seen[0], `call_audio_cache?conversation_id=eq.${ID}&select=conversation_id`);
});

test("ElevenLabs fetch: key, id, 404 and success", async () => {
  assert.equal((await fetchConversationAudio(ID, { key: "" })).status, 503);
  assert.equal((await fetchConversationAudio("../etc", { key: "k" })).status, 400);
  let url, hdr;
  const ok = await fetchConversationAudio(ID, {
    key: "k",
    fetchImpl: async (u, o) => { url = u; hdr = o.headers; return new Response(new Uint8Array([0x49, 0x44, 0x33, 4]), { headers: { "content-type": "audio/mpeg" } }); },
  });
  assert.equal(url, `https://api.elevenlabs.io/v1/convai/conversations/${ID}/audio`);
  assert.equal(hdr["xi-api-key"], "k");
  assert.equal(ok.ok, true); assert.equal(ok.bytes.length, 4); assert.equal(ok.contentType, "audio/mpeg");
  const gone = await fetchConversationAudio(ID, { key: "k", fetchImpl: async () => new Response("nope", { status: 404 }) });
  assert.equal(gone.status, 404);
  const bad = await fetchConversationAudio(ID, { key: "k", fetchImpl: async () => new Response("x", { status: 500 }) });
  assert.equal(bad.status, 502);
});
