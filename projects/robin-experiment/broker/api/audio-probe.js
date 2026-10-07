// TEMPORARY, deleted before merge. Answers the two questions call audio is built on, from a preview
// deployment (the only place with the keys and the network): what ElevenLabs returns for a
// conversation's audio, and whether a signed Supabase Storage URL serves byte ranges (seeking needs
// them). Reports status codes, sizes and timings only, never audio. Refuses to run in production.
import { fetchConversationAudio, CONVERSATION_ID } from "../lib/el-audio.js";
import { bucketExists, putObject, signObject, deleteObject } from "../lib/storage.js";

const BUCKET = "call-audio";

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === "production") return res.status(404).json({ error: "not found" });
  const id = String(req.query?.id || "");
  if (!CONVERSATION_ID.test(id)) return res.status(400).json({ error: "bad id" });
  const out = { id, key_set: !!process.env.ELEVENLABS_API_KEY };

  const el = await fetchConversationAudio(id);
  if (!el.ok) return res.status(200).json({ ...out, elevenlabs: el });
  const b = el.bytes;
  out.elevenlabs = {
    ok: true, ms: el.ms, content_type: el.contentType, bytes: b.length,
    head_hex: Buffer.from(b.slice(0, 4)).toString("hex"), // 494433 = ID3 tag (MP3), fff3/fffb = MP3 frame
  };

  // Does ElevenLabs itself honour a Range request? (If so, a straight pass-through could seek.)
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}/audio`, {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, range: "bytes=0-1023" },
    });
    out.elevenlabs.range = { status: r.status, content_range: r.headers.get("content-range"), accept_ranges: r.headers.get("accept-ranges") };
    await r.arrayBuffer().catch(() => {});
  } catch (e) { out.elevenlabs.range = { error: String(e.message || e) }; }

  try {
    out.bucket_exists = await bucketExists(BUCKET);
    if (!out.bucket_exists) return res.status(200).json(out);
    const path = `_probe/${id}.mp3`;
    const t0 = Date.now();
    await putObject(BUCKET, path, b, { contentType: el.contentType, cacheSeconds: 60 });
    const tUp = Date.now();
    const url = await signObject(BUCKET, path, { expiresIn: 120 });
    const r = await fetch(url, { headers: { range: "bytes=1000-1999" } });
    const got = (await r.arrayBuffer()).byteLength;
    out.storage = {
      upload_ms: tUp - t0,
      range: { status: r.status, content_range: r.headers.get("content-range"), accept_ranges: r.headers.get("accept-ranges"), content_type: r.headers.get("content-type"), cache_control: r.headers.get("cache-control"), bytes: got },
    };
    const whole = await fetch(url);
    out.storage.whole = { status: whole.status, bytes: (await whole.arrayBuffer()).byteLength };
    await deleteObject(BUCKET, path);
    const after = await fetch(url);
    out.storage.after_delete_status = after.status;
  } catch (e) { out.storage_error = String(e.message || e); }

  return res.status(200).json(out);
}
