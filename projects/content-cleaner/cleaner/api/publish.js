// POST /api/publish  { article } | { id }  ->  publish one approved article to Robin's KB.
// Runs Architecture A: write the versioned record to Supabase kb_articles AND push the article
// into ElevenLabs' native KB (create-from-text -> rag-index -> attach). Robin then retrieves it
// in-runtime — no Supabase in the call loop for knowledge.
//
// Append-only versions: every publish inserts a new state='published' row (bumped version) and
// supersedes the prior published row for the same (plan_id, slug), detaching/deleting its stale
// ElevenLabs document. Idempotent by checksum: re-publishing identical body is a no-op.
//
// Needs env on this project: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY,
// ELEVENLABS_AGENT_ID.
import { createHash } from "node:crypto";
import { sb } from "../lib/supabase.js";
import { createFromText, computeRagIndex, getRagIndex, attachToAgent, detachFromAgent, deleteDocument } from "../lib/elevenlabs.js";

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");
const q = (s) => encodeURIComponent(s);

async function resolveArticle(body) {
  if (body.id) {
    const rows = await sb(`kb_articles?id=eq.${q(body.id)}&limit=1`);
    if (!rows.length) throw new Error(`no kb_articles row ${body.id}`);
    return { row: rows[0], a: rows[0] };
  }
  return { row: null, a: body.article || {} };
}

async function bestEffortIndexed(documentId) {
  // The rag-index status shape isn't verified against the live API yet; be defensive.
  // Poll briefly; treat an obvious "done/succeeded/complete" signal as indexed, else false.
  for (let i = 0; i < 4; i++) {
    try {
      const s = await getRagIndex(documentId);
      const blob = JSON.stringify(s || {}).toLowerCase();
      if (/succeeded|complete|"done"|ready|indexed/.test(blob)) return true;
    } catch (_) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false; // attached and indexing; the UI can note it may take a moment
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return res.status(500).json({ error: "ELEVENLABS_AGENT_ID not set" });

  try {
    const { row, a } = await resolveArticle(req.body || {});
    const plan_id = String(a.plan_id || "").trim();
    const slug = String(a.slug || "").trim();
    const title = String(a.title || "").trim();
    const environment = String(a.environment || "").trim();
    const body_md = String(a.body_md || a.md || "").trim();
    if (!plan_id || !slug || !title || !environment || !body_md)
      return res.status(400).json({ error: "need plan_id, slug, title, environment, body_md" });

    const checksum = sha256(body_md);
    const name = `${environment} — ${title}`;

    // published rows for this article
    const published = await sb(`kb_articles?plan_id=eq.${q(plan_id)}&slug=eq.${q(slug)}&state=eq.published`);
    const same = published.find((p) => p.checksum === checksum);
    if (same) return res.status(200).json({ ok: true, noop: true, reason: "already published (same content)", document_id: same.elevenlabs_document_id, version: same.version });

    // next version across all rows for this article
    const all = await sb(`kb_articles?plan_id=eq.${q(plan_id)}&slug=eq.${q(slug)}&select=version&order=version.desc&limit=1`);
    const version = (all.length ? all[0].version : 0) + 1;

    // --- ElevenLabs: create -> index -> attach (any failure leaves the DB untouched) ---
    const doc = await createFromText(body_md, name);
    await computeRagIndex(doc.id);
    await attachToAgent(agentId, doc.id, name, { usageMode: "auto" });
    const indexed = await bestEffortIndexed(doc.id);

    // --- supersede prior published (detach + delete their stale ElevenLabs docs) ---
    for (const p of published) {
      if (p.elevenlabs_document_id) {
        try { await detachFromAgent(agentId, p.elevenlabs_document_id); } catch (_) {}
        try { await deleteDocument(p.elevenlabs_document_id); } catch (_) {}
      }
      await sb(`kb_articles?id=eq.${q(p.id)}`, { method: "PATCH", body: { state: "superseded", updated_at: new Date().toISOString() } });
    }
    // consume the source approved/draft row if we published from one
    if (row && row.state !== "published") {
      await sb(`kb_articles?id=eq.${q(row.id)}`, { method: "PATCH", body: { state: "superseded", updated_at: new Date().toISOString() } });
    }

    // --- insert the new published version ---
    const nowIso = new Date().toISOString();
    const inserted = await sb(`kb_articles`, {
      method: "POST",
      prefer: "return=representation",
      body: {
        plan_id, slug, title, environment, body_md,
        source: a.source || null,
        coverage_flags: a.coverage_flags || [],
        candidate_questions: a.candidate_questions || [],
        version, state: "published",
        elevenlabs_document_id: doc.id,
        elevenlabs_rag_indexed: indexed,
        checksum,
        published_at: nowIso,
        published_by: a.published_by || "cleaner-console",
        updated_at: nowIso,
      },
    });

    return res.status(200).json({ ok: true, document_id: doc.id, version, indexed, row: inserted?.[0] || null });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
