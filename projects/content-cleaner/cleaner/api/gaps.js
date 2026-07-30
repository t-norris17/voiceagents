// GET /api/gaps?plan_id=<id>  ->  the open content queue for one plan.
// The other half of the loop: the dashboard records what Robin couldn't answer, this hands that
// list to whoever writes the article. Read-only — resolution happens automatically on publish
// (lib/gaps.js), so nobody has to remember to tick anything off.
//
// plan_id is optional. Omitted returns the unscoped queue (''), which is what the pre-multi-tenant
// rows carry; a real deployment always passes one.
import { sb } from "../lib/supabase.js";

const q = (s) => encodeURIComponent(s);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const plan_id = String(req.query?.plan_id ?? "").trim();

    const rows = await sb(
      `gap_requests?plan_id=eq.${q(plan_id)}&status=neq.resolved` +
        `&select=canonical_key,canonical_question,status,note,updated_at&order=updated_at.desc`
    );

    // What's already live for this plan, so the writer can see whether something close exists
    // before starting from scratch.
    const live = await sb(
      `kb_articles?plan_id=eq.${q(plan_id)}&state=eq.published&select=slug,title&order=title`
    );

    const recentlyClosed = await sb(
      `gap_requests?plan_id=eq.${q(plan_id)}&status=eq.resolved` +
        `&select=canonical_question,resolved_slug,resolved_at&order=resolved_at.desc.nullslast&limit=10`
    );

    return res.status(200).json({
      ok: true,
      plan_id,
      open: (rows || []).map((r) => ({
        key: r.canonical_key,
        question: r.canonical_question,
        status: r.status,
        note: r.note || null,
        since: r.updated_at,
      })),
      published_count: (live || []).length,
      recently_closed: (recentlyClosed || []).map((r) => ({
        question: r.canonical_question,
        by_slug: r.resolved_slug,
        at: r.resolved_at,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
