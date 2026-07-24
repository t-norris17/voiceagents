// POST /api/unpublish  { id }  ->  remove a published article from Robin's KB.
// Detaches + deletes the ElevenLabs document and marks the row 'archived'. Used to clean up a
// semantic duplicate (same topic, different slug) that the (plan_id, slug) dedup can't catch.
import { sb } from "../lib/supabase.js";
import { detachFromAgent, deleteDocument } from "../lib/elevenlabs.js";

const q = (s) => encodeURIComponent(s);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return res.status(500).json({ error: "ELEVENLABS_AGENT_ID not set" });
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "need id" });
    const rows = await sb(`kb_articles?id=eq.${q(id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: `no kb_articles row ${id}` });
    const row = rows[0];

    if (row.elevenlabs_document_id) {
      try { await detachFromAgent(agentId, row.elevenlabs_document_id); } catch (_) {}
      try { await deleteDocument(row.elevenlabs_document_id); } catch (_) {}
    }
    await sb(`kb_articles?id=eq.${q(id)}`, { method: "PATCH", body: { state: "archived", updated_at: new Date().toISOString() } });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
