// What Robin is RIGHT NOW, read from ElevenLabs: her live prompt and the documents attached to her.
//
// Dry Run used to answer from a snapshot that no longer describes her: an embedded INTRUST knowledge
// base, or whatever the Knowledge Factory had marked "published". Published is not attached: the 29
// INTRUST articles from July are published and attached to no agent, while her five live Vertex
// documents were uploaded straight to ElevenLabs and have no row in our database. So the only
// faithful source is the agent itself: its prompt, and the knowledge_base list on it.
//
// Fails LOUDLY (a thrown Error with the fix in it) rather than falling back to some other knowledge:
// a dry run that quietly tests the wrong thing is worse than one that says it cannot run.
import { fetchElevenLabsDocument } from "./kb-text.js";

const BASE = "https://api.elevenlabs.io";
const TTL_MS = 60 * 1000;
let _cache = { at: 0, key: "", value: null };

// { prompt, temperature, documents: [{ id, name, usage_mode }], docs: [{ id, name, usage_mode, body }], unreadable: [name], kbText }
export async function liveRobin({ fetchImpl = fetch, env = process.env, now = Date.now, ttl = TTL_MS } = {}) {
  const key = env.ELEVENLABS_API_KEY, agentId = env.ELEVENLABS_AGENT_ID;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set on the broker, so Dry Run cannot read Robin's knowledge.");
  if (!agentId) throw new Error("ELEVENLABS_AGENT_ID is not set on the broker, so Dry Run cannot tell which documents are attached to Robin. Set it to her agent id and redeploy.");
  const cacheKey = `${agentId}`;
  if (ttl && _cache.value && _cache.key === cacheKey && now() - _cache.at < ttl) return _cache.value;

  const res = await fetchImpl(`${BASE}/v1/convai/agents/${encodeURIComponent(agentId)}`, { headers: { "xi-api-key": key } });
  if (!res.ok) throw new Error(`ElevenLabs returned ${res.status} when reading Robin's configuration.`);
  const agent = await res.json();
  const p = agent?.conversation_config?.agent?.prompt || {};
  const prompt = String(p.prompt || "").trim();
  const attached = Array.isArray(p.knowledge_base) ? p.knowledge_base : [];
  if (!prompt) throw new Error("Robin's live prompt came back empty.");
  if (!attached.length) throw new Error("No knowledge-base documents are attached to Robin.");

  const read = await Promise.all(attached.map(async (d) => ({ d, doc: await fetchElevenLabsDocument(d.id, { fetchImpl, key, headings: true }) })));
  const readable = read.filter((x) => x.doc);
  if (!readable.length) throw new Error(`None of the ${attached.length} documents attached to Robin could be read from ElevenLabs.`);

  const value = {
    prompt,
    temperature: Number.isFinite(Number(p.temperature)) ? Number(p.temperature) : 0.5,
    documents: attached.map((d) => ({ id: d.id, name: d.name, usage_mode: d.usage_mode })),
    unreadable: read.filter((x) => !x.doc).map((x) => x.d.name),
    // each readable document with its text (headings kept as "## Title"), for Utilization
    docs: readable.map((x) => ({ id: x.d.id, name: x.d.name, usage_mode: x.d.usage_mode, body: x.doc.body_md })),
    kbText: readable.map((x) => `--- DOCUMENT: ${x.d.name} ---\n${x.doc.body_md}`).join("\n\n"),
  };
  if (ttl) _cache = { at: now(), key: cacheKey, value };
  return value;
}

// Robin's own prompt, framed for a text-only test. The live prompt asks for identity, calls tools and
// speaks aloud; none of that can happen in a text box, so the frame says what to skip and says it LAST
// as well as first, because a long prompt's final instruction is the one a model keeps.
export function dryRunSystem({ prompt, kbText }) {
  return `THIS IS A TEXT DRY RUN OF ROBIN. Below is Robin's real, live prompt, then the knowledge documents attached to her. A tester is typing the questions a caller might ask. For this test only:
- Treat the participant as ALREADY VERIFIED. Skip greetings, identity checks and any verification steps.
- You have no tools. Do not try to call any. If an answer would need the participant's own account figures (a balance, a loan on file), say you can't see account details in a dry run.
- Answer exactly as Robin would speak it aloud, from the documents below, and follow the rest of her prompt (brevity, tone, what she never says).

=== ROBIN'S LIVE PROMPT ===
${prompt}

=== KNOWLEDGE ATTACHED TO ROBIN ===
${kbText}

=== REMINDER ===
This is a dry run: no verification, no tools, answer only from the documents above, and if they don't cover it, say so the way Robin's prompt says to.`;
}

// An instruction to "treat the participant as verified" was not enough: asked "what happens to my loan if I
// leave?", the model still answered "first I need to verify your identity", because Robin's own prompt has a
// strong verification rule for loan topics. So the dry run also starts from the state a live call is in once
// verification has passed: a short exchange in which Robin has already verified the caller. The tester's
// question is then the first real thing the caller says. (Nothing here is sent anywhere but the model.)
export const VERIFIED_OPENING = [
  { role: "user", content: "Member ID 90002, date of birth September 30th, 1998." },
  { role: "assistant", content: "Thanks, you're verified, and I have you on the Vertex Manufacturing 401(k). What can I help you with today?" },
];
export const dryRunMessages = (question) => [...VERIFIED_OPENING, { role: "user", content: String(question) }];
