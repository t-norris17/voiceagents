// POST /api/postcall — ElevenLabs post-call (Transcription) webhook receiver.
// Verifies the HMAC signature, then idempotently upserts one row into ai_call_events.
// The async scoring pass reads these rows later; this endpoint only persists.
//
// Every outcome — stored, rejected, failed to write — is recorded in webhook_ingest_log. That log
// is the difference between "no calls today" and "every call today was rejected for a bad
// signature", which used to look identical from the dashboard.
import crypto from "node:crypto";
import { sb } from "../lib/supabase.js";

// Diagnostic breadcrumb. Best-effort in the strictest sense: it must never change what this
// endpoint returns. A missing table (migration not yet run) is not an error worth surfacing here —
// /api/health reports that instead.
async function logIngest(row) {
  try {
    await sb("webhook_ingest_log", { method: "POST", prefer: "return=minimal", body: row });
  } catch (e) {
    console.error("ingest log write failed (non-fatal):", String(e.message || e));
  }
}

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

// The Data Collection fields are LLM-generated free text ("Verified", "Resolved", ...), but the
// table enforces a fixed lowercase vocabulary. Normalize into it so a row is never rejected on a
// case/wording mismatch; anything unmapped falls back safely (the raw value stays in raw_payload).
const ENUM = {
  auth_outcome: {
    fallback: "not_attempted",
    map: { verified: "verified", authenticated: "verified", success: "verified", pass: "verified", yes: "verified",
           failed: "failed", "not verified": "failed", unverified: "failed", denied: "failed", "failed verification": "failed", no: "failed",
           not_attempted: "not_attempted", "not attempted": "not_attempted", none: "not_attempted", na: "not_attempted" },
  },
  outcome: {
    fallback: "unknown",
    map: { resolved: "resolved", completed: "resolved", answered: "resolved", success: "resolved",
           transferred: "transferred", transfer: "transferred", escalated: "transferred",
           abandoned: "abandoned", dropped: "abandoned", hangup: "abandoned", "hung up": "abandoned",
           unknown: "unknown" },
  },
  overall_sentiment: {
    fallback: null,
    map: { positive: "positive", neutral: "neutral", negative: "negative", mixed: "mixed" },
  },
};
function coerce(kind, v) {
  const n = String(v ?? "").trim().toLowerCase();
  const e = ENUM[kind];
  if (!n) return e.fallback;
  if (e.map[n]) return e.map[n];
  for (const [k, val] of Object.entries(e.map)) if (n.includes(k)) return val; // contains a known token
  return e.fallback;
}

// Guard against an invalid/odd unix value — new Date(NaN).toISOString() throws, which would 500.
function safeIso(unix) {
  const n = Number(unix);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    await logIngest({ accepted: false, reason: "wrong_method", detail: `${req.method} not allowed` });
    return res.status(405).json({ error: "POST only" });
  }
  let raw = "";
  try {
    raw = await readRaw(req);
    const sig = req.headers["elevenlabs-signature"];
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    const base = { had_signature: !!sig, bytes: raw.length };

    if (!secret) {
      // The single most likely cause of "calls aren't showing up" on a fresh deploy.
      await logIngest({ ...base, accepted: false, reason: "no_secret",
        detail: "ELEVENLABS_WEBHOOK_SECRET is not set on this deployment, so no webhook can be accepted." });
      return res.status(401).json({ error: "webhook secret not configured" });
    }
    if (!verifySig(raw, sig, secret)) {
      // Deliberately does not parse the body: an unverified payload is untrusted input and
      // nothing from it is worth storing, not even for diagnosis.
      await logIngest({ ...base, accepted: false, reason: "bad_signature",
        detail: sig ? "Signature present but didn't match — the secret here and the one in the ElevenLabs webhook config differ."
                    : "No ElevenLabs-Signature header on the request." });
      return res.status(401).json({ error: "bad signature" });
    }

    let evt;
    try { evt = JSON.parse(raw); }
    catch (e) {
      await logIngest({ ...base, accepted: false, reason: "unparseable", detail: "Signature verified but the body isn't JSON." });
      return res.status(400).json({ error: "unparseable body" });
    }
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
    const event_type = String(evt.type || d.type || "").slice(0, 64) || null;
    const hasTranscript = Array.isArray(d.transcript) && d.transcript.length > 0;
    const trace = { ...base, conversation_id, event_type, had_transcript: hasTranscript };

    if (!conversation_id) {
      await logIngest({ ...trace, accepted: false, reason: "no_conversation_id",
        detail: `Verified ${event_type || "event"} carried no conversation_id, so there's nothing to key a call on.` });
      return res.status(400).json({ error: "no conversation_id" });
    }

    const row = {
      provider: "elevenlabs",
      conversation_id,
      started_at: safeIso(meta.start_time_unix_secs ?? meta.start_time_unix),
      duration_seconds: Number.isFinite(Number(meta.call_duration_secs)) ? Math.round(Number(meta.call_duration_secs)) : null,
      topic: pick("topic"),
      outcome: coerce("outcome", pick("outcome")),
      transfer_reason: pick("transfer_reason"),
      auth_outcome: coerce("auth_outcome", pick("auth_outcome")),
      subject_ref: pick("subject_ref"),
      overall_sentiment: coerce("overall_sentiment", pick("caller_sentiment")), // existing column; the rest of the DC fields ride along in raw_payload
      transcript: hasTranscript ? d.transcript : null,
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
      await logIngest({ ...trace, accepted: false, reason: "write_failed", detail: String(e.message || e).slice(0, 300) });
      return res.status(500).json({ error: "upsert failed: " + String(e.message || e) });
    }

    await logIngest({ ...trace, accepted: true, reason: "stored",
      detail: hasTranscript ? null : `Stored, but this ${event_type || "event"} carried no transcript — the grader can't score it.` });
    return res.status(200).json({ ok: true, transcript: hasTranscript });
  } catch (e) {
    console.error("postcall error:", String(e.message || e));
    await logIngest({ accepted: false, reason: "write_failed", bytes: raw.length, detail: String(e.message || e).slice(0, 300) });
    return res.status(500).json({ error: String(e.message || e) });
  }
}
