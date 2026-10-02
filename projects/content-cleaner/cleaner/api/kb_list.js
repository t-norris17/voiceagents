// GET /api/kb_list[?plan_id=intrust]  ->  { rows: [...] }
// Feeds the Library: the current kb_articles (title/slug/state/version/doc id/timestamps) AND what is
// really attached to Robin. "Published" is a state in OUR table; whether Robin uses a document is a fact
// about the agent in ElevenLabs, and the two drift (29 INTRUST articles are published and attached to no
// agent; her five live Vertex documents have no row here). So each row carries `attached` (true/false, or
// null when the agent could not be read) and the response lists every document attached to her, whoever
// put it there. Read-only; keys server-only.
import { sb } from "../lib/supabase.js";
import { getAgent } from "../lib/elevenlabs.js";

const q = (s) => encodeURIComponent(s);
const COLS = "id,plan_id,slug,title,environment,state,version,elevenlabs_document_id,elevenlabs_rag_indexed,published_at,updated_at";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const plan = (req.query?.plan_id || "").trim();
    const filter = plan ? `plan_id=eq.${q(plan)}&` : "";
    const rows = await sb(`kb_articles?${filter}select=${COLS}&order=updated_at.desc&limit=500`);

    // What is attached to Robin right now. Never fails the list: if the agent cannot be read the rows come
    // back with attached: null and the page says it does not know, instead of guessing.
    let attached = [], attached_known = false, attached_error = null;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!agentId || !process.env.ELEVENLABS_API_KEY) {
      attached_error = "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID are not both set on this deployment.";
    } else {
      try {
        const kb = (await getAgent(agentId))?.conversation_config?.agent?.prompt?.knowledge_base;
        if (!Array.isArray(kb)) throw new Error("the agent has no knowledge_base list");
        attached = kb.map((d) => ({ id: d.id, name: d.name, type: d.type, usage_mode: d.usage_mode }));
        attached_known = true;
      } catch (e) { attached_error = String(e.message || e); }
    }
    const ids = new Set(attached.map((d) => d.id));
    const withAttached = rows.map((r) => ({ ...r, attached: attached_known ? !!r.elevenlabs_document_id && ids.has(r.elevenlabs_document_id) : null }));
    return res.status(200).json({ rows: withAttached, attached, attached_known, attached_error });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
