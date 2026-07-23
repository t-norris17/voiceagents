// POST /api/get_balance  { subject_ref }  ->  the verified caller's own plan figures.
// Call ONLY after verify_caller. Keyed by the opaque subject_ref (members.id).
// Deliberately does NOT return a loan limit — the enrollment guide has none, so Robin
// routes loan-amount questions to a specialist rather than quoting a figure.
import { sb } from "../lib/supabase.js";
import { dollars } from "../lib/parse.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { subject_ref } = req.body || {};
    if (!subject_ref) return res.status(200).json({ found: false });

    const rows = await sb(
      `members?id=eq.${encodeURIComponent(subject_ref)}` +
        `&select=plan_name,balance_cents,vested_balance_cents,fully_vested,outstanding_loan,deferral_pct`
    );
    const m = rows && rows[0];
    if (!m) return res.status(200).json({ found: false });

    return res.status(200).json({
      found: true,
      plan_name: m.plan_name,
      balance: dollars(m.balance_cents),
      vested_balance: dollars(m.vested_balance_cents),
      fully_vested: m.fully_vested,
      outstanding_loan: m.outstanding_loan,
      deferral_pct: Number(m.deferral_pct),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
