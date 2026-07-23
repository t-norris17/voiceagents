// POST /api/postcall — ElevenLabs post-call (Transcription) webhook receiver.
// Verifies the HMAC signature, then idempotently upserts one row into ai_call_events.
// The async scoring pass reads these rows later; this endpoint only persists.
import crypto from "node:crypto";
import { sb } from "../lib/supabase.js";

// We need the RAW body to verify the signature, so disable Vercel's body parser.
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

// ElevenLabs signs with header "ElevenLabs-Signature: t=<ts>,v0=<hmac>",
// where hmac = HMAC_SHA256(secret, `${t}.${rawBody}`).
function verifySig(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v0) return false;
  const mac = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const a = Buffer.from(parts.v0);
  const b = Buffer.from(mac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const iso = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const raw = await readRaw(req);
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    if (!verifySig(raw, req.headers["elevenlabs-signature"], secret)) {
      return res.status(401).json({ error: "bad signature" });
    }

    const evt = JSON.parse(raw);
    const d = evt.data || evt; // payload shape: { type, data: {...} }
    const meta = d.metadata || {};
    const analysis = d.analysis || {};
    const dc = analysis.data_collection_results || {}; // agent Data Collection fields
    const pick = (k) => (dc[k] && (dc[k].value ?? dc[k])) || null;

    const row = {
      provider: "elevenlabs",
      conversation_id: d.conversation_id,
      started_at: iso(meta.start_time_unix_secs),
      duration_seconds: meta.call_duration_secs ?? null,
      topic: pick("topic"),
      outcome: pick("outcome") || "unknown",
      transfer_reason: pick("transfer_reason"),
      auth_outcome: pick("auth_outcome") || "not_attempted",
      subject_ref: pick("subject_ref"),
      transcript: d.transcript || null,
      raw_payload: evt,
    };
    if (!row.conversation_id) return res.status(400).json({ error: "no conversation_id" });

    // Idempotent upsert on the (provider, conversation_id) unique constraint.
    await sb("ai_call_events?on_conflict=provider,conversation_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: row,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
