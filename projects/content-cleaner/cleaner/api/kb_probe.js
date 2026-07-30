// GET /api/kb_probe  ->  read-only: what does ElevenLabs actually return for a KB document?
//
// One open question blocks a real feature. The call grader checks Robin's answers against the
// documents she retrieved, but it can only read documents WE published, because only those have a
// kb_articles row with the text. Documents uploaded straight into the ElevenLabs dashboard grade as
// `no_source` — right now that's 5 of the 12 documents her calls have touched.
//
// If the Get-document endpoint returns the document's text, we can adopt those: pull the text once,
// create the missing kb_articles rows, and every answer becomes gradeable regardless of how the
// content got there. Our reference confirms the endpoint exists but not what it returns, so this
// reports the real field shape instead of us assuming one.
//
// Read-only and deliberately shy about content: field names, types and sizes, plus a short snippet
// of anything text-shaped. Enough to decide, not a dump of the plan documents.
import { getAgent, getDocument } from "../lib/elevenlabs.js";
import { sb } from "../lib/supabase.js";

const SNIP = 220;

// Describe a value without printing it: what shape is it, and how big?
function describe(v) {
  if (v === null) return { type: "null" };
  if (Array.isArray(v)) return { type: "array", length: v.length, of: v.length ? typeof v[0] : null };
  const t = typeof v;
  if (t === "string") {
    const s = v.trim();
    return { type: "string", length: v.length, snippet: s.length > SNIP ? s.slice(0, SNIP) + "…" : s };
  }
  if (t === "object") return { type: "object", keys: Object.keys(v).slice(0, 25) };
  return { type: t, value: v };
}

// Which field, if any, actually carries the document body? Whatever it's called, it'll be the
// longest string on the object.
function likelyTextField(doc) {
  let best = null;
  for (const [k, v] of Object.entries(doc || {})) {
    if (typeof v === "string" && v.length > 200 && (!best || v.length > best.length)) best = { field: k, length: v.length };
  }
  return best;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return res.status(500).json({ error: "ELEVENLABS_AGENT_ID not set" });

  try {
    // The agent's attached documents — this path is already exercised by publish/unpublish.
    const agent = await getAgent(agentId);
    const attached = agent?.conversation_config?.agent?.prompt?.knowledge_base || [];

    // Which of them do we already hold text for?
    let known = new Set();
    try {
      const rows = await sb(`kb_articles?elevenlabs_document_id=not.is.null&select=elevenlabs_document_id`);
      known = new Set((rows || []).map((r) => String(r.elevenlabs_document_id)));
    } catch (_) { /* the shape question doesn't depend on this */ }

    const inventory = attached.map((d) => ({
      id: d.id, name: d.name, usage_mode: d.usage_mode,
      we_have_the_text: known.has(String(d.id)),
    }));

    // Probe a document we DON'T have text for — that's the case this whole question is about.
    const target = inventory.find((d) => !d.we_have_the_text) || inventory[0];
    if (!target) return res.status(200).json({ ok: true, attached: 0, note: "No documents attached to the agent." });

    let doc = null, error = null;
    try { doc = await getDocument(target.id); }
    catch (e) { error = String(e.message || e); }

    return res.status(200).json({
      ok: true,
      attached: inventory.length,
      we_have_text_for: inventory.filter((d) => d.we_have_the_text).length,
      inventory,
      probed: { id: target.id, name: target.name, we_have_the_text: target.we_have_the_text },
      // The answer to the question:
      get_document_worked: !error,
      error,
      returns_document_text: doc ? Boolean(likelyTextField(doc)) : null,
      text_field: doc ? likelyTextField(doc) : null,
      fields: doc ? Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, describe(v)])) : null,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
