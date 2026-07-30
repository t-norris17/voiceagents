// POST /api/gap_request  { canonical_key, canonical_question, plan_id?, status?, note? }
// The human half of the feedback loop: Robin's self-review surfaces a question she couldn't answer,
// and a person claims it ("content requested"). Resolution is no longer manual — publishing an
// article that answers the question closes the gap automatically (content-cleaner/lib/gaps.js), so
// "resolved" means an article actually exists rather than that somebody ticked a box.
// Status lives here rather than on call_questions so the atomic per-call facts stay immutable.
// plan_id scopes the queue per tenant: 25 companies with 25 knowledge bases each get their own.
import { sb } from "../lib/supabase.js";

const STATUSES = new Set(["new", "requested", "in_progress", "resolved"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = req.body || {};
    const canonical_key = String(b.canonical_key || "").trim();
    const canonical_question = String(b.canonical_question || "").trim();
    if (!canonical_key || !canonical_question)
      return res.status(400).json({ error: "need canonical_key and canonical_question" });

    const status = STATUSES.has(b.status) ? b.status : "requested";
    const row = {
      plan_id: String(b.plan_id || "").trim(),
      canonical_key,
      canonical_question,
      status,
      note: String(b.note || "").trim() || null,
      resolved_slug: String(b.resolved_slug || "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    await sb("gap_requests?on_conflict=plan_id,canonical_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: row,
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, canonical_key, status, plan_id: row.plan_id });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
