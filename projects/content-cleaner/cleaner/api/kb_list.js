// GET /api/kb_list[?plan_id=intrust]  ->  { rows: [...] }
// Feeds the Publish tab: the current kb_articles (title/slug/state/version/doc id/timestamps).
// Read-only; service key server-only.
import { sb } from "../lib/supabase.js";

const q = (s) => encodeURIComponent(s);
const COLS = "id,plan_id,slug,title,environment,state,version,elevenlabs_document_id,elevenlabs_rag_indexed,published_at,updated_at";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const plan = (req.query?.plan_id || "").trim();
    const filter = plan ? `plan_id=eq.${q(plan)}&` : "";
    const rows = await sb(`kb_articles?${filter}select=${COLS}&order=updated_at.desc&limit=500`);
    return res.status(200).json({ rows });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
