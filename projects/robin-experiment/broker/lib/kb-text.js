// Text of an ElevenLabs Knowledge Base document, for the grader.
//
// The grader scores what Robin SAID against what she READ. What she read is identified by the
// document_id ElevenLabs records on every retrieved chunk; the text behind that id lives in
// kb_articles only for documents our pipeline published. Everything uploaded through the dashboard
// (all five live Vertex documents) has to be read back from ElevenLabs instead. Read-only, one
// GET per document per grading run.
//
// Inert without ELEVENLABS_API_KEY: returns null and the grader records `no_source`, exactly as it
// did before this file existed.
const BASE = "https://api.elevenlabs.io";

// The API returns the stored document as `extracted_inner_html`, which is HTML for documents
// created from files and raw markdown for documents whose content was PATCHed as text. Either way
// the grader wants plain text: tags stripped, block boundaries kept as newlines, entities decoded.
export function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/div|\/tr)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Returns { title, body_md } in the same shape as a kb_articles row, or null when the document
// cannot be read (no key, not found, network). Never throws: a grading run must not die because
// one document was unreadable — that answer grades `no_source` and the rest of the batch proceeds.
export async function fetchElevenLabsDocument(documentId, { fetchImpl = fetch } = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(documentId || ""))) return null;
  try {
    const res = await fetchImpl(`${BASE}/v1/convai/knowledge-base/${encodeURIComponent(documentId)}`, {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) return null;
    const doc = await res.json();
    const body = htmlToText(doc?.extracted_inner_html);
    if (!body) return null;
    return { title: doc?.name || documentId, body_md: body };
  } catch {
    return null;
  }
}

// The summary ElevenLabs writes after every call (analysis.transcript_summary, with its short
// title). Read on demand for the portal's call drawer; never stored, never required. Same rules as
// the document read: inert without the key, null on any failure.
export async function fetchConversationSummary(conversationId, { fetchImpl = fetch } = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(conversationId || ""))) return null;
  try {
    const res = await fetchImpl(`${BASE}/v1/convai/conversations/${encodeURIComponent(conversationId)}`, {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) return null;
    const conv = await res.json();
    const text = String(conv?.analysis?.transcript_summary || "").trim();
    if (!text) return null;
    return { title: String(conv?.analysis?.call_summary_title || "").trim() || null, text };
  } catch {
    return null;
  }
}
