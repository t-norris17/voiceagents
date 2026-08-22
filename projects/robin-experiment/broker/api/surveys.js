// GET /api/surveys  ->  what callers said, plus the counts that matter.
//
// Exists so a test call can be verified with one curl instead of a database session: place a call,
// answer the two questions, hit this, see your row at the top.
//
// Read-only. The service-role key stays server-side (lib/supabase.js); the browser sees aggregates
// and answers, never the members table.
import { sb } from "../lib/supabase.js";

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const rows = await sb(
      "call_surveys?select=conversation_id,subject_ref,survey_offered,survey_consent,csat,fcr," +
        "callback_consent,callback_window,created_at&order=created_at.desc&limit=200"
    ) || [];

    const answered = rows.filter((r) => r.survey_consent === "accepted");
    const scores = answered.map((r) => Number(r.csat)).filter((n) => Number.isFinite(n));
    const fcrKnown = answered.filter((r) => r.fcr !== null);
    const consented = rows.filter((r) => r.callback_consent === true);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      // Offered is the denominator for "will people talk to us", answered for everything else.
      offered: rows.length,
      answered: answered.length,
      declined: rows.filter((r) => r.survey_consent === "declined").length,
      response_rate_pct: rows.length ? Math.round((answered.length / rows.length) * 100) : null,

      csat: scores.length ? Number(avg(scores).toFixed(2)) : null,
      csat_n: scores.length,
      // Reported as a share of the answers where they actually told us, not of every survey —
      // an unanswered FCR question is not a "no".
      fcr_pct: fcrKnown.length ? Math.round((fcrKnown.filter((r) => r.fcr).length / fcrKnown.length) * 100) : null,
      fcr_n: fcrKnown.length,

      // The population an outbound survey call could lawfully reach, once that clears compliance.
      callback_consented: consented.length,

      recent: rows.slice(0, 25),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
