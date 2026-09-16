// Live facts about Robin for the landing page's information block. Read from the ElevenLabs API on
// the server, never from a file in this repo: every stale-file incident this project has had came
// from trusting a file over the platform.
import "server-only";

const BASE = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io"; // override for local tests only
const TTL_MS = 60_000;
let cache = { at: 0, value: null };

async function el(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`elevenlabs ${path} ${res.status}`);
  return res.json();
}

// Shape the page renders. `ok:false` carries a plain reason; the page shows it instead of guessing.
export async function getRobinStatus() {
  if (Date.now() - cache.at < TTL_MS && cache.value) return cache.value;
  const key = process.env.ELEVENLABS_API_KEY, agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agentId) {
    return { ok: false, reason: "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID are not set on this deployment." };
  }
  try {
    const agent = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}`);
    const prompt = agent?.conversation_config?.agent?.prompt || {};
    let version = null;
    if (agent?.version_id) {
      try { version = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(agent.version_id)}`); }
      catch { version = null; }
    }
    const value = {
      ok: true,
      name: agent?.name || "Robin",
      phone: agent?.phone_numbers?.[0]?.phone_number || null,
      version_id: agent?.version_id || null,
      version_seq: version?.seq_no_in_branch ?? null,
      version_description: version?.version_description || null,
      version_committed_at: version?.time_committed_secs ? new Date(version.time_committed_secs * 1000).toISOString() : null,
      llm: prompt.llm || null,
      tts_model: agent?.conversation_config?.tts?.model_id || null,
      knowledge_base: (prompt.knowledge_base || []).map((d) => d.name),
      tools: (prompt.tools || []).map((t) => t.name),
      procedures: Object.values(agent?.procedures || {}).map((p) => p.name),
      fetched_at: new Date().toISOString(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
