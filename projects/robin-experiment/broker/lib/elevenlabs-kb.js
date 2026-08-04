// Read the knowledge base Robin ACTUALLY has, not the part of it we happened to publish.
//
// The grader used to resolve a retrieved `document_id` against our own `kb_articles` table. That
// only ever held documents the Knowledge Factory published. Measured on this project's first 39
// calls: five documents carried nearly all the retrieval traffic (30-37 calls each) and none were
// ours — they'd been uploaded straight into the ElevenLabs dashboard. So 100 of 108 graded answers
// came back `no_source`, and scored ~4.2/5 anyway, because an answer with no source has no claims
// and therefore takes no grounding deductions. The dashboard was reporting a quality number
// computed from answers nobody had checked.
//
// ElevenLabs exposes the document text, so there is no reason to be blind to it:
//   GET /v1/convai/knowledge-base/{documentation_id}/content
// https://elevenlabs.io/docs/api-reference/knowledge-base/get-content
//
// Needs ELEVENLABS_API_KEY on this deployment. Without it the grader still runs and still records
// demand and security findings — it just reports `no_source` honestly instead of scoring blind.
const BASE = "https://api.elevenlabs.io";
const KEY = () => process.env.ELEVENLABS_API_KEY;

export const hasElevenLabsKey = () => !!(KEY() && String(KEY()).trim());

// The content endpoint returns the document body. It is not guaranteed to be JSON — a plain-text
// document comes back as text — so this reads the raw body and only unwraps a JSON envelope when
// it actually finds one.
export async function getDocumentContent(documentId, { timeoutMs = 20000 } = {}) {
  if (!hasElevenLabsKey()) throw new Error("ELEVENLABS_API_KEY not set");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/v1/convai/knowledge-base/${encodeURIComponent(documentId)}/content`, {
      headers: { "xi-api-key": KEY() },
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${text.slice(0, 200)}`);
    return unwrap(text);
  } finally {
    clearTimeout(timer);
  }
}

// Document metadata, for a human-readable name on the dashboard. Best-effort: a missing name is
// cosmetic, and must never be the reason a document goes ungraded.
export async function getDocumentName(documentId, { timeoutMs = 10000 } = {}) {
  if (!hasElevenLabsKey()) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/v1/convai/knowledge-base/${encodeURIComponent(documentId)}`, {
      headers: { "xi-api-key": KEY() },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const j = JSON.parse(await res.text());
    return j?.name || null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Pull the readable text out of whatever came back. Exported for testing — the response shape is
// the part most likely to drift, and a silent shape change here would put the grader straight back
// to grading against nothing.
export function unwrap(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!(s.startsWith("{") || s.startsWith("["))) return s;   // plain text document
  let j;
  try { j = JSON.parse(s); } catch (_) { return s; }         // looked like JSON, wasn't
  if (typeof j === "string") return j;
  for (const k of ["content", "text", "extracted_inner_html", "body"]) {
    if (typeof j?.[k] === "string" && j[k].trim()) return j[k];
  }
  // An unrecognized JSON envelope is more useful to the critic as its own text than as an empty
  // string — but it is NOT silently treated as a document body of length zero.
  return s;
}
