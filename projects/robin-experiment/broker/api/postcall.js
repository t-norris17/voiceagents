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

// Guard against an invalid/odd unix value — new Date(NaN).toISOString() throws, which would 500.
function safeIso(unix) {
  const n = Number(unix);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
    // A DC result is usually { value, rationale, ... }; sometimes a bare value (incl. booleans).
    const pick = (k) => {
      const v = dc[k];
      if (v == null) return null;
      const val = (typeof v === "object" && "value" in v) ? v.value : v;
      return val == null ? null : val;
    };

    const conversation_id = d.conversation_id || evt.conversation_id || null;
    if (!conversation_id) return res.status(400).json({ error: "no conversation_id" });

    const row = {
      provider: "elevenlabs",
      conversation_id,
      started_at: safeIso(meta.start_time_unix_secs ?? meta.start_time_unix),
      duration_seconds: Number.isFinite(Number(meta.call_duration_secs)) ? Math.round(Number(meta.call_duration_secs)) : null,
      topic: pick("topic"),
      outcome: pick("outcome") || "unknown",
      transfer_reason: pick("transfer_reason"),
      auth_outcome: pick("auth_outcome") || "not_attempted",
      subject_ref: pick("subject_ref"),
      overall_sentiment: pick("caller_sentiment"), // existing column; the rest of the DC fields ride along in raw_payload
      transcript: Array.isArray(d.transcript) ? d.transcript : null,
      raw_payload: evt,
    };

    try {
      // Idempotent upsert on the (provider, conversation_id) unique constraint.
      await sb("ai_call_events?on_conflict=provider,conversation_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: row,
      });
    } catch (e) {
      console.error("postcall upsert failed:", String(e.message || e), "| data keys:", Object.keys(d || {}), "| meta keys:", Object.keys(meta || {}), "| dc keys:", Object.keys(dc || {}));
      return res.status(500).json({ error: "upsert failed: " + String(e.message || e) });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("postcall error:", String(e.message || e));
    return res.status(500).json({ error: String(e.message || e) });
  }
}
