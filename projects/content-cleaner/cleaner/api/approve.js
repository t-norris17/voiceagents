// POST /api/approve  { article }  ->  stage a cleaned article into kb_articles as state='approved'.
// This is the "Send to Publish" step in the Clean tab: the human accepts the article; it lands in
// the Publish queue. It does NOT touch ElevenLabs — that happens at /api/publish. One staged row
// per (plan_id, slug): re-approving updates it in place.
import { createHash } from "node:crypto";
import { sb } from "../lib/supabase.js";
import { deterministicScan } from "../lib/validate.js";

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");
const q = (s) => encodeURIComponent(s);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const a = (req.body && req.body.article) || {};
    const plan_id = String(a.plan_id || "").trim();
    const slug = String(a.slug || "").trim();
    const title = String(a.title || "").trim();
    const environment = String(a.environment || "").trim();
    const body_md = String(a.body_md || a.md || "").trim();
    if (!plan_id || !slug || !title || !environment || !body_md)
      return res.status(400).json({ error: "need plan_id, slug, title, environment, body_md" });

    // Re-run the deterministic PII guard — an edited article must not slip an SSN past the gate.
    const fatal = deterministicScan(body_md, { resolution: body_md, coverage_flags: a.coverage_flags || [] }).filter((f) => f.severity === "fatal");
    if (fatal.length) return res.status(400).json({ error: "PII detected — " + fatal.map((f) => f.detail).join("; ") + " Remove it before staging." });

    const checksum = sha256(body_md);
    const fields = {
      title, environment, body_md,
      source: a.source || null,
      coverage_flags: a.coverage_flags || [],
      candidate_questions: a.candidate_questions || [],
      checksum, state: "approved",
      updated_at: new Date().toISOString(),
    };

    // Already live with identical content? Nothing to stage.
    const pub = await sb(`kb_articles?plan_id=eq.${q(plan_id)}&slug=eq.${q(slug)}&state=eq.published&select=checksum,version`);
    if (pub.some((p) => p.checksum === checksum))
      return res.status(200).json({ ok: true, already_published: true });

    // Update an existing staged (draft/approved) row, else insert a new version.
    const staged = await sb(`kb_articles?plan_id=eq.${q(plan_id)}&slug=eq.${q(slug)}&state=in.(draft,approved)&order=version.desc&limit=1`);
    if (staged.length) {
      const upd = await sb(`kb_articles?id=eq.${q(staged[0].id)}`, { method: "PATCH", prefer: "return=representation", body: fields });
      return res.status(200).json({ ok: true, staged: upd?.[0] || null, updated: true });
    }
    const all = await sb(`kb_articles?plan_id=eq.${q(plan_id)}&slug=eq.${q(slug)}&select=version&order=version.desc&limit=1`);
    const version = (all.length ? all[0].version : 0) + 1;
    const ins = await sb(`kb_articles`, { method: "POST", prefer: "return=representation", body: { plan_id, slug, version, ...fields } });
    return res.status(200).json({ ok: true, staged: ins?.[0] || null, created: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
