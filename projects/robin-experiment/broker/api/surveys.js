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
    const nums = (k) => answered.map((r) => Number(r[k])).filter((n) => Number.isFinite(n));
    const csat = nums("csat"), understood = nums("understood");
    const prefs = answered.map((r) => r.prefer_agent).filter(Boolean);
    const consented = rows.filter((r) => r.callback_consent === true);
    const verbatims = answered.filter((r) => r.improve_verbatim);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      // Offered is the denominator for "will people talk to us", answered for everything else.
      offered: rows.length,
      answered: answered.length,
      declined: rows.filter((r) => r.survey_consent === "declined").length,
      response_rate_pct: rows.length ? Math.round((answered.length / rows.length) * 100) : null,

      // Headline number, kept for reporting — but no longer the only one.
      csat: csat.length ? Number(avg(csat).toFixed(2)) : null,
      csat_n: csat.length,
      // What the caller felt about being understood. Worth crossing against the grader's grounding:
      // high understood + ungrounded answers is the confidently-wrong quadrant.
      understood: understood.length ? Number(avg(understood).toFixed(2)) : null,
      understood_n: understood.length,

      // The business question. Reported as counts, not a single score — "no preference" is a real
      // answer and averaging it away would hide the split.
      prefer: {
        agent: prefs.filter((p) => p === "agent").length,
        person: prefs.filter((p) => p === "person").length,
        no_preference: prefs.filter((p) => p === "no_preference").length,
        answered: prefs.length,
      },

      // The population an outbound survey call could lawfully reach, once that clears compliance.
      callback_consented: consented.length,

      // Where the actual insight lives. Redacted count is surfaced so the PII scan's hit rate is
      // visible rather than looking like people simply had nothing to say.
      improvements: verbatims.map((r) => ({ text: r.improve_verbatim, at: r.created_at })),
      improvements_redacted: rows.filter((r) => r.improve_redacted).length,

      recent: rows.slice(0, 25),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
