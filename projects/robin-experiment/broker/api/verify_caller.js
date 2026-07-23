// POST /api/verify_caller  { member_id, dob }  ->  { verified, subject_ref, first_name, consented }
// Verifies a caller against the Supabase members table by Member ID + DOB.
// Returns the OPAQUE subject_ref (members.id), never the member_id or any PII beyond first name.
import { sb } from "../lib/supabase.js";
import { normMemberId, sameDob } from "../lib/parse.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { member_id, dob } = req.body || {};
    const id = normMemberId(member_id);
    if (!id || !dob) return res.status(200).json({ verified: false });

    // Fetch the single candidate by member_id, then compare DOB in code (tolerant parsing).
    const rows = await sb(
      `members?member_id=eq.${encodeURIComponent(id)}&select=id,dob,first_name,consented`
    );
    const m = rows && rows[0];
    if (!m || !sameDob(dob, m.dob)) return res.status(200).json({ verified: false });

    return res.status(200).json({
      verified: true,
      subject_ref: m.id,          // opaque uuid used by every downstream tool
      first_name: m.first_name,
      consented: m.consented,     // false = tester has not opted in; prompt should handle
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
