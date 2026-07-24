// GET /api/kb_article?id=<uuid>  ->  { article }
// Loads ONE article's full row (including body_md) so the Publish tab can pull a live article
// back into an editor. kb_list deliberately omits body_md to keep the list light; this is the
// "open it" call. Read-only; service key stays server-side.
import { sb } from "../lib/supabase.js";

const q = (s) => encodeURIComponent(s);
const COLS =
  "id,plan_id,slug,title,environment,body_md,source,coverage_flags,candidate_questions,state,version,elevenlabs_document_id,updated_at";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).json({ error: "need id" });
    const rows = await sb(`kb_articles?id=eq.${q(id)}&select=${COLS}&limit=1`);
    if (!rows || !rows.length) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ article: rows[0] });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
