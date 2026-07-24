// ElevenLabs Knowledge Base API client — dependency-light. Publishes an article into Robin's
// NATIVE KB so retrieval stays in-runtime (Architecture A). Auth: xi-api-key header, server-only.
//
// Flow: createFromText -> computeRagIndex -> attachToAgent. See docs/elevenlabs-reference.md.
// create-from-text and rag-index shapes are documented and stable. The ATTACH step (PATCH agent
// knowledge_base) is the one payload to verify against the live API on first real publish — it is
// isolated in attachToAgent() so a shape fix is a one-function change.
const BASE = "https://api.elevenlabs.io";
const KEY = () => process.env.ELEVENLABS_API_KEY;
const RAG_MODEL = "multilingual_e5_large_instruct"; // pinned (SCOPE decision)

async function el(path, { method = "GET", body } = {}) {
  if (!KEY()) throw new Error("Missing ELEVENLABS_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "xi-api-key": KEY(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`elevenlabs ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// 1) Create a KB document from text. Returns { id, name }.
export async function createFromText(text, name) {
  return el(`/v1/convai/knowledge-base/text`, { method: "POST", body: { text, name } });
}

// 2) Trigger RAG indexing for the document (idempotent — returns status if already indexed).
export async function computeRagIndex(documentId, model = RAG_MODEL) {
  return el(`/v1/convai/knowledge-base/${documentId}/rag-index`, { method: "POST", body: { model } });
}

// Poll the RAG index status for a document.
export async function getRagIndex(documentId) {
  return el(`/v1/convai/knowledge-base/${documentId}/rag-index`, { method: "GET" });
}

export async function getAgent(agentId) {
  return el(`/v1/convai/agents/${agentId}`, { method: "GET" });
}

export async function deleteDocument(documentId) {
  return el(`/v1/convai/knowledge-base/${documentId}`, { method: "DELETE" });
}

// 3) Attach a KB document to the agent in RAG/Auto mode WITHOUT clobbering existing docs:
//    read the agent's current knowledge_base list, append this doc, PATCH it back.
//    NOTE: verify the knowledge_base entry + usage_mode shape against the live API on first publish.
export async function attachToAgent(agentId, documentId, name, { usageMode = "auto" } = {}) {
  const agent = await getAgent(agentId);
  const prompt = agent?.conversation_config?.agent?.prompt || {};
  const current = Array.isArray(prompt.knowledge_base) ? prompt.knowledge_base : [];
  if (current.some((d) => d.id === documentId)) return { already: true };
  const entry = { type: "text", id: documentId, name, usage_mode: usageMode };
  const knowledge_base = [...current, entry];
  // PATCH ONLY the field we change. Echoing the whole prompt back drags along both `tools` and
  // `tool_ids`, which ElevenLabs rejects ("cannot specify both tools and tool IDs"). Deep-merge
  // updates just knowledge_base and leaves tools/prompt untouched.
  await el(`/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    body: { conversation_config: { agent: { prompt: { knowledge_base } } } },
  });
  return { attached: true, count: knowledge_base.length };
}

// Best-effort detach: remove a document from the agent's knowledge_base (used on supersede).
export async function detachFromAgent(agentId, documentId) {
  const agent = await getAgent(agentId);
  const prompt = agent?.conversation_config?.agent?.prompt || {};
  const current = Array.isArray(prompt.knowledge_base) ? prompt.knowledge_base : [];
  const knowledge_base = current.filter((d) => d.id !== documentId);
  if (knowledge_base.length === current.length) return { changed: false };
  await el(`/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    body: { conversation_config: { agent: { prompt: { knowledge_base } } } },
  });
  return { changed: true };
}
