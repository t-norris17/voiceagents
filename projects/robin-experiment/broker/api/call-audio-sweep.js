// GET /api/call-audio-sweep  (Vercel cron, daily)  ->  { deleted, failed }
// GET /api/call-audio-sweep?id=conv_...              ->  deletes that one copy now
//
// Our recordings are a cache; ElevenLabs is the record. This deletes every cached copy nobody has
// played in 30 days (the next play fetches it again), and with ?id= deletes one immediately, which is
// how a member's deletion request clears Birdnest's copy.
//
// NOT behind the portal password: Vercel Cron cannot send it. It authenticates with Vercel's own cron
// header instead (Authorization: Bearer CRON_SECRET) and fails closed when CRON_SECRET is unset.
// Deleting a cached copy never loses a recording, so the worst a caller could do is cost a refetch.
import { sb } from "../lib/supabase.js";
import { deleteObject } from "../lib/storage.js";
import { CONVERSATION_ID } from "../lib/el-audio.js";
import { BUCKET, objectKey, idleCutoff } from "../lib/call-audio.js";

export function authorized(headers, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not set" };
  const got = String(headers?.authorization || "");
  const want = `Bearer ${secret}`;
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.max(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, status: 401, error: "unauthorized" };
}

export async function sweep({ id = null, db = sb, del = deleteObject, now = new Date() } = {}) {
  const rows = id
    ? (await db(`call_audio_cache?conversation_id=eq.${id}&select=conversation_id`)) || []
    : (await db(`call_audio_cache?last_played_at=lt.${idleCutoff(now)}&select=conversation_id&order=last_played_at.asc&limit=500`)) || [];
  let deleted = 0;
  const failed = [];
  for (const r of rows) {
    try {
      // Object first, then the row: a failure leaves a row pointing at nothing, which the next play
      // repairs by refetching, rather than an object no row knows about.
      await del(BUCKET, objectKey(r.conversation_id));
      await db(`call_audio_cache?conversation_id=eq.${r.conversation_id}`, { method: "DELETE", prefer: "return=minimal" });
      deleted++;
    } catch (e) {
      failed.push({ conversation_id: r.conversation_id, error: String(e.message || e).slice(0, 200) });
    }
  }
  return { deleted, failed };
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const auth = authorized(req.headers);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const id = req.query?.id ? String(req.query.id) : null;
  if (id && !CONVERSATION_ID.test(id)) return res.status(400).json({ error: "bad id" });
  try {
    const out = await sweep({ id });
    if (out.failed.length) console.error("call-audio-sweep failures:", JSON.stringify(out.failed));
    return res.status(out.failed.length ? 500 : 200).json(out);
  } catch (e) {
    console.error("call-audio-sweep failed:", String(e.message || e));
    return res.status(500).json({ error: "sweep failed" });
  }
}
