// GET /api/survey-call?id=conv_...  ->  { call, transcript: [{role, text, at}] }
//
// The trust anchor for the whole page. Every number on /survey should be clickable down to the
// words somebody actually said; a leadership audience that can read one transcript stops asking
// whether the numbers were made up, and a summary that cannot be checked never earns that.
//
// Behind the password gate (see middleware.js).
// TEMPORARY: delete with the instrument after the customer wave.
import { sb } from "../lib/supabase.js";
import { CALL_COLS } from "../lib/survey-data.js";

// Same patterns the survey_answers view uses on open comments, applied to what the CALLER said.
// A tester reading a member ID aloud is normal and expected; storing it in a transcript that a
// dozen people will open in a browser is not. Agent turns are left intact — Robin is forbidden
// from saying these back, so scrubbing her side would only hide a violation we need to see.
const PII = [
  [/\b\d{3}[-. ]?\d{2}[-. ]?\d{4}\b/g, "[redacted]"],   // SSN, any spacing
  [/\b\d{7,}\b/g, "[redacted]"],                         // account / member id / phone runs
  [/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/g, "[redacted]"],      // spaced phone number
  [/\b(?:\d{4}[-. ]){3}\d{4}\b/g, "[redacted]"],         // card
];
function scrubCaller(text) {
  let s = String(text || "");
  for (const [re, to] of PII) s = s.replace(re, to);
  return s;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const id = String(req.query?.id || "").trim();
  // Conversation ids are ElevenLabs-issued and alphanumeric. Validated rather than interpolated
  // straight into a PostgREST filter.
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: "bad id" });

  try {
    const [meta] = (await sb(`survey_answers?conversation_id=eq.${id}&select=${CALL_COLS}&limit=1`)) || [];
    const [row] = (await sb(`ai_call_events?conversation_id=eq.${id}&select=conversation_id,started_at,duration_seconds,outcome,transfer_reason,auth_outcome,transcript&limit=1`)) || [];
    if (!row) return res.status(404).json({ error: "not found" });

    const turns = Array.isArray(row.transcript) ? row.transcript : [];
    const transcript = turns
      .map((t) => {
        const role = t.role === "agent" ? "agent" : "caller";
        const text = String(t.message ?? "").trim();
        return { role, at: t.time_in_call_secs ?? null, text: role === "caller" ? scrubCaller(text) : text };
      })
      // Tool calls and skipped turns come through as empty messages; they are not speech and
      // padding the transcript with blanks makes it unreadable.
      .filter((t) => t.text.length > 0);

    res.setHeader("cache-control", "no-store");
    return res.status(200).json({
      call: {
        conversation_id: row.conversation_id,
        started_at: row.started_at,
        duration_seconds: row.duration_seconds,
        outcome: row.outcome,
        transfer_reason: row.transfer_reason,
        auth_outcome: row.auth_outcome,
        survey: meta || null,
      },
      transcript,
    });
  } catch (e) {
    console.error("survey-call failed:", String(e.message || e));
    return res.status(500).json({ error: "lookup failed" });
  }
}
