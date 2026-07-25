// POST /api/gap_request  { canonical_key, canonical_question, status?, note? }
// The human half of the feedback loop: Robin's self-review surfaces a question she couldn't answer,
// a person claims it ("content requested") and later marks it resolved once an article is published.
// Status lives here rather than on call_questions so the atomic per-call facts stay immutable.
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
      canonical_key,
      canonical_question,
      status,
      note: String(b.note || "").trim() || null,
      resolved_slug: String(b.resolved_slug || "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    await sb("gap_requests?on_conflict=canonical_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: row,
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, canonical_key, status });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
