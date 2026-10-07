// GET /api/call-audio?id=conv_...  ->  { url, expires_at, first_fetch }
//
// A short-lived link to one conversation's recording, for Birdnest's player. Portal-only (middleware).
// Returns a LINK, never audio: the browser plays straight from Supabase Storage, which serves byte
// ranges, so seeking works and no function carries megabytes.
//
//   1. The switch is on (lib/call-audio.js audioEnabled), else 404.
//   2. The conversation is ours and spoken (phone or web voice), else 404.
//   3. Our cached copy exists, or it is fetched from ElevenLabs and stored now (first play).
//   4. A 5-minute signed URL.
//   5. One row in call_audio_listens. If the listen cannot be logged, no link is issued.
import { sb } from "../lib/supabase.js";
import { CHANNEL_COLS, channelOf } from "../lib/channel.js";
import { fetchConversationAudio, CONVERSATION_ID } from "../lib/el-audio.js";
import { putObject, signObject } from "../lib/storage.js";
import { BUCKET, SIGNED_URL_SECONDS, MIN_RECORDING_BYTES, audioEnabled, channelHasAudio, objectKey } from "../lib/call-audio.js";

// Fetch from ElevenLabs into our bucket and record it in the cache table.
async function fill(id, deps) {
  const el = await deps.fetchAudio(id);
  if (!el.ok) return el;
  if (el.bytes.length < MIN_RECORDING_BYTES) return { ok: false, status: 404, error: "no recording for this conversation" };
  await deps.put(BUCKET, objectKey(id), el.bytes, { contentType: el.contentType, cacheSeconds: 60 });
  await deps.db("call_audio_cache?on_conflict=conversation_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { conversation_id: id, bytes: el.bytes.length, content_type: el.contentType, fetched_at: deps.now().toISOString(), last_played_at: deps.now().toISOString() },
  });
  return { ok: true };
}

export async function issue(id, deps) {
  const [row] = (await deps.db(`ai_call_events?provider=eq.elevenlabs&conversation_id=eq.${id}&select=conversation_id,${CHANNEL_COLS}&limit=1`)) || [];
  if (!row) return { status: 404, body: { error: "not found" } };
  if (!channelHasAudio(channelOf(row))) return { status: 404, body: { error: "no audio for this channel" } };

  const [cached] = (await deps.db(`call_audio_cache?conversation_id=eq.${id}&select=conversation_id&limit=1`)) || [];
  let firstFetch = false;
  if (!cached) {
    const f = await fill(id, deps);
    if (!f.ok) return { status: f.status, body: { error: f.error } };
    firstFetch = true;
  }

  let url;
  try {
    url = await deps.sign(BUCKET, objectKey(id), { expiresIn: SIGNED_URL_SECONDS });
  } catch (e) {
    // The cache row says we hold it but the object is gone (deleted by hand, or a sweep raced this
    // play). Fetch it again once rather than fail the play.
    if (firstFetch) throw e;
    const f = await fill(id, deps);
    if (!f.ok) return { status: f.status, body: { error: f.error } };
    firstFetch = true;
    url = await deps.sign(BUCKET, objectKey(id), { expiresIn: SIGNED_URL_SECONDS });
  }

  const at = deps.now();
  await deps.db("call_audio_listens", { method: "POST", prefer: "return=minimal", body: { conversation_id: id, at: at.toISOString(), actor: "birdnest", first_fetch: firstFetch } });
  if (!firstFetch) {
    await deps.db(`call_audio_cache?conversation_id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: { last_played_at: at.toISOString() } });
  }
  return { status: 200, body: { url, expires_at: new Date(at.getTime() + SIGNED_URL_SECONDS * 1000).toISOString(), first_fetch: firstFetch } };
}

export default async function handler(req, res, deps = { db: sb, fetchAudio: fetchConversationAudio, put: putObject, sign: signObject, now: () => new Date(), env: process.env }) {
  res.setHeader("cache-control", "no-store");
  if (!audioEnabled(deps.env)) return res.status(404).json({ error: "call audio is off" });
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const id = String(req.query?.id || "").trim();
  if (!CONVERSATION_ID.test(id)) return res.status(400).json({ error: "bad id" });
  try {
    const out = await issue(id, deps);
    return res.status(out.status).json(out.body);
  } catch (e) {
    console.error("call-audio failed:", String(e.message || e));
    return res.status(500).json({ error: "could not get the recording" });
  }
}
