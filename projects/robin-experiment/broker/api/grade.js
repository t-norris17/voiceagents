// POST /api/grade -> grade not-yet-scored calls against the knowledge base Robin ACTUALLY USED.
//
// The old grader compared every answer to a fixed set of 25 curated questions with hand-written
// ideal answers. That breaks the moment there is more than one tenant: 25 companies with 25
// knowledge bases would need 25 answer keys, maintained by hand, and a call graded against the
// wrong key produces confidently wrong quality numbers. (We hit exactly that — the agent moved to
// a different plan's knowledge base and the scores kept grading against the old plan's key.)
//
// This version has NO answer key. For each call it reconstructs the source Robin retrieved on that
// turn — ElevenLabs records the document_id of every chunk in rag_retrieval_info — looks those
// documents up in kb_articles, and asks whether what she SAID is supported by what she READ. The
// evidence travels with the call, so nothing per-tenant needs configuring.
//
// The score is arithmetic on that evidence, not the model's opinion, exactly as in the Knowledge
// Factory's critic: a model can be generous with a number, it can't be generous with a quote that
// isn't in the source.
//
// Limitation worth knowing: only documents published through our pipeline have a kb_articles row.
// A document uploaded straight into the ElevenLabs dashboard has no text on our side, so those
// answers grade as `no_source` — visible, not silently scored. Fetching document text from the
// ElevenLabs KB API would close that gap and is the obvious next step.
import Anthropic from "@anthropic-ai/sdk";
import { sb } from "../lib/supabase.js";
import { scoreAnswer } from "../lib/score.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY
const MAX_PER_RUN = 10; // bound latency/cost per invocation; later polls catch up the rest
const q = (s) => encodeURIComponent(s);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answers: {
      type: "array",
      description: "One entry per question the caller asked that Robin gave a substantive answer to.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          canonical_key: { type: "string", description: "Short stable kebab-case key for the topic, e.g. loan-repayment-terms." },
          question_text: { type: "string", description: "The question in plain, reusable words." },
          answer_text: { type: "string", description: "What Robin actually said, from the transcript." },
          claims: {
            type: "array",
            description: "Every checkable factual claim in Robin's answer, traced to the SOURCE DOCUMENTS provided.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                claim: { type: "string", description: "The claim as Robin stated it." },
                source_quote: { type: "string", description: "Verbatim span from the source documents that establishes it. Empty when unsupported." },
                verdict: { type: "string", enum: ["supported", "unsupported", "contradicted"] },
              },
              required: ["claim", "source_quote", "verdict"],
            },
          },
          answered_the_question: { type: "boolean", description: "Did the answer actually address what was asked?" },
          complete: { type: "boolean", description: "Did she include the parts of the source that matter to this question, or leave out a material condition/exception?" },
          appropriately_routed: { type: "boolean", description: "True when she either answered fully OR correctly said she wasn't certain and offered a person. False when she gave a thin answer where the source had more, or bluffed past a gap." },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          sentiment_score: { type: "number", description: "-1.0 to 1.0 caller sentiment around this exchange." },
          note: { type: "string", description: "Short reviewer-facing line ONLY if something is off. Empty string if clean." },
        },
        required: ["canonical_key", "question_text", "answer_text", "claims", "answered_the_question", "complete", "appropriately_routed", "sentiment", "sentiment_score", "note"],
      },
    },
    all_questions: {
      type: "array",
      description: "EVERY distinct question the caller asked in this call, answered or not. The top-of-funnel demand record — do not omit anything the caller genuinely asked.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          canonical_key: { type: "string", description: "Short stable kebab-case key. Use the SAME key here as in `answers` when it's the same question." },
          canonical_question: { type: "string", description: "The question in plain, reusable words (not the caller's exact wording)." },
          asked_text: { type: "string", description: "The caller's verbatim phrasing from the transcript." },
          category: { type: "string", description: "Topic area, e.g. loans, enrollment, account_access, investments." },
          answered: { type: "boolean", description: "True only if Robin gave a substantive answer. Deflecting, routing, or 'I don't have that' = false." },
          fail_reason: { type: "string", enum: ["", "no_content", "not_retrieved", "out_of_scope", "guardrail"], description: "Empty when answered. no_content = nothing in the KB covers it (retrieval used no chunk). not_retrieved = the KB likely covers it but she didn't use it. out_of_scope = not a plan-knowledge question at all. guardrail = she correctly declined (e.g. investment advice)." },
        },
        required: ["canonical_key", "canonical_question", "asked_text", "category", "answered", "fail_reason"],
      },
    },
    security_flag: { type: "boolean", description: "True ONLY if Robin disclosed PII/SSN/credentials, or gave account-specific info before the caller was verified." },
    security_detail: { type: "string", description: "What the concern is; empty string if none." },
  },
  required: ["answers", "all_questions", "security_flag", "security_detail"],
};

const SYSTEM = `You review ONE recorded call handled by a voice agent for a workplace retirement plan. You are
given the transcript, and the SOURCE DOCUMENTS the agent actually retrieved from her knowledge base during that
call. There is no answer key and you do not need one — the source documents are the ground truth.

You do NOT assign a quality score. You produce evidence; someone else does the arithmetic.

=== 1. CLAIMS — the core of the job ===
For each question the caller asked and the agent substantively ANSWERED, list every checkable factual claim in
her answer: figures, percentages, dollar amounts, ages, deadlines, waiting periods, limits, phone numbers, named
forms or systems, eligibility rules, and any statement of what the plan does or allows.

For each claim:
- source_quote: the EXACT span from the SOURCE DOCUMENTS that establishes it. Copy verbatim. Do not paraphrase,
  do not reconstruct from your own knowledge, do not stitch distant fragments into one quote.
- verdict:
  - "supported"    — a quoted span plainly establishes it.
  - "unsupported"  — no span establishes it. Use this when the claim is TRUE in general but these documents do
                     not say it. Your own knowledge of retirement plans is NOT support. Leave source_quote empty.
  - "contradicted" — the documents say something different. Quote the conflicting span.

Be exacting about drift: "up to five years" where the source says "up to 60 months" is supported; "about 5%"
where it says "6%" is contradicted; a repayment term the source never states is unsupported even if it is the
industry norm. Softening an absolute rule with "generally" or "typically" is drift — mark it unsupported and
say so in the note.

If the agent read a figure from the CALLER'S OWN ACCOUNT (a balance, a vested amount, whether they have a loan),
that comes from a tool and not from a document. Do not mark those unsupported — leave them out of claims.

=== 2. JUDGMENTS ===
- answered_the_question: did she address what was actually asked?
- complete: did she include what matters from the source, or drop a material condition or exception?
- appropriately_routed: true when she either answered fully, OR correctly said she wasn't certain and offered a
  person. False when she gave a thin answer where the source had more, or talked past a gap.

=== 3. DEMAND RECORD ===
Separately, record EVERY distinct question the caller asked — including ones she could not answer. This measures
how much of what callers actually ask she can handle, and feeds the queue of content that needs writing. You are
given a RETRIEVAL TRACE showing what the knowledge base was queried for and whether any chunk was used: use it to
tell "no_content" (nothing retrieved or used) from "not_retrieved" (the source covers it but she didn't use it).

=== 4. SECURITY ===
Set security_flag true ONLY if she disclosed PII/SSN/credentials, or gave account-specific information before the
caller was verified.

If NO source documents were provided, still record the demand and security findings, and return claims as an
empty list — do not guess at grounding without a source.

Ground everything in the transcript and the provided documents. Return ONLY the structured tool.`;

function serializeTranscript(t) {
  if (!Array.isArray(t)) return "";
  return t
    .map((turn) => {
      const who = turn.role === "agent" ? "Robin" : "Caller";
      const msg = String(turn.message ?? turn.text ?? "").trim();
      return msg ? `${who}: ${msg}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// ElevenLabs records, per agent turn, what the KB was queried for, which documents came back, and
// which chunks were actually used. Empty used_chunk_ids is a hard signal she answered without the
// knowledge base — that's what separates "the KB has nothing" from "retrieval missed it".
function retrievalTrace(t) {
  if (!Array.isArray(t)) return "";
  const lines = [];
  for (const turn of t) {
    const rag = turn?.rag_retrieval_info;
    if (!rag || typeof rag !== "object") continue;
    const query = String(rag.retrieval_query || "").trim();
    if (!query) continue;
    const used = Array.isArray(rag.used_chunk_ids) ? rag.used_chunk_ids.length : 0;
    lines.push(`- queried: "${query}" → ${used ? `${used} chunk(s) USED` : "no chunk used"}`);
  }
  return lines.join("\n");
}

// Every KB document this call touched, newest-distance-first. The document_id is the join key back
// to our own copy of the article — no tenant configuration, no answer key.
function documentIds(t) {
  const ids = new Set();
  if (!Array.isArray(t)) return ids;
  for (const turn of t) {
    const chunks = turn?.rag_retrieval_info?.chunks;
    if (!Array.isArray(chunks)) continue;
    for (const c of chunks) if (c?.document_id) ids.add(String(c.document_id));
  }
  return ids;
}

// Pull the text of those documents from kb_articles. Cached across the whole run: one batch of
// calls usually hits the same handful of articles, and this is a hot loop at 10 calls a go.
async function loadSources(ids, cache) {
  const missing = [...ids].filter((id) => !cache.has(id));
  if (missing.length) {
    const list = missing.map((id) => `"${id}"`).join(",");
    let rows = [];
    try {
      rows = await sb(`kb_articles?elevenlabs_document_id=in.(${q(list)})&select=elevenlabs_document_id,title,body_md`);
    } catch (_) { rows = []; }
    for (const r of rows || []) cache.set(String(r.elevenlabs_document_id), { title: r.title, body_md: r.body_md });
    for (const id of missing) if (!cache.has(id)) cache.set(id, null); // remember the miss
  }
  const found = [];
  for (const id of ids) { const v = cache.get(id); if (v) found.push(v); }
  return found;
}

const FAIL_REASONS = new Set(["no_content", "not_retrieved", "out_of_scope", "guardrail"]);
const SENTS = new Set(["positive", "neutral", "negative"]);
const slugKey = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const clampSent = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : null; };

// Reviewer-facing lines, so a card always explains its own score.
function issueLines(a, s) {
  const out = [];
  for (const c of a.claims || []) {
    if (c.verdict === "contradicted") out.push(`Contradicts the source: ${c.claim}`);
    else if (c.verdict === "unsupported") out.push(`Not in the source: ${c.claim}`);
  }
  for (const d of s.deductions) if (!d.label.includes("source")) out.push(d.label);
  const note = String(a.note || "").trim();
  if (note && !out.includes(note)) out.unshift(note);
  return out.join(" · ") || null;
}

async function gradeCall(call, sourceCache) {
  const convText = serializeTranscript(call.transcript);
  if (!convText) return { conversation_id: call.conversation_id, rows: [], askedRows: [], security_flag: false, security_detail: null, empty: true };

  const docs = await loadSources(documentIds(call.transcript), sourceCache);
  const hasSource = docs.length > 0;
  const sourceBlock = hasSource
    ? docs.map((d) => `--- DOCUMENT: ${d.title} ---\n${d.body_md}`).join("\n\n")
    : "(none — no retrieved document was available to check against)";
  const trace = retrievalTrace(call.transcript);

  const user = `SOURCE DOCUMENTS the agent retrieved during this call (the ground truth):
"""
${sourceBlock}
"""

CALL TRANSCRIPT:
"""
${convText}
"""

RETRIEVAL TRACE (what the knowledge base was queried for, and whether a chunk was used):
${trace || "(none recorded)"}

Review this call per your instructions. Return ONLY the structured JSON.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content.find((b) => b.type === "text");
  if (!text) throw new Error("grade returned no text block");
  const out = JSON.parse(text.text);

  const docTitles = docs.map((d) => d.title).filter(Boolean);

  // Scored answers, keyed on the canonical topic rather than a curated question id — that key
  // space is the tenant-agnostic one, and it matches call_questions.
  const seenScore = new Set();
  const rows = [];
  for (const a of out.answers || []) {
    const key = slugKey(a.canonical_key || a.question_text);
    if (!key || seenScore.has(key)) continue;
    seenScore.add(key);
    const s = scoreAnswer(a, hasSource);
    rows.push({
      conversation_id: call.conversation_id,
      question_key: key,
      question_text: String(a.question_text || "").trim() || key,
      asked: true,
      answer_text: String(a.answer_text || "").trim() || null,
      quality_score: s.score,
      quality_rating: s.rating,
      grounding: s.grounding,
      unsupported_claims: s.unsupported,
      contradicted_claims: s.contradicted,
      graded_against: docTitles,
      sentiment: SENTS.has(a.sentiment) ? a.sentiment : null,
      sentiment_score: clampSent(a.sentiment_score),
      graded_by: "llm",
      reviewed: false,
      reviewer_note: issueLines(a, s),
    });
  }

  // Top-of-funnel demand record: every question asked, answered or not. Deduped per call by
  // canonical_key so the (conversation_id, canonical_key) upsert can't collide with itself.
  const seen = new Set();
  const askedRows = [];
  for (const a of out.all_questions || []) {
    const key = slugKey(a.canonical_key || a.canonical_question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const answered = !!a.answered;
    askedRows.push({
      conversation_id: call.conversation_id,
      asked_text: String(a.asked_text || "").trim() || null,
      canonical_key: key,
      canonical_question: String(a.canonical_question || "").trim() || key,
      category: String(a.category || "").trim().toLowerCase() || null,
      matched_question_key: seenScore.has(key) ? key : null,
      answered,
      fail_reason: answered ? null : (FAIL_REASONS.has(a.fail_reason) ? a.fail_reason : "no_content"),
    });
  }

  return {
    conversation_id: call.conversation_id,
    rows,
    askedRows,
    security_flag: !!out.security_flag,
    security_detail: String(out.security_detail || "").trim() || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "POST only" });
  try {
    const pending = await sb(
      `ai_call_events?provider=eq.elevenlabs&scored_at=is.null&transcript=not.is.null` +
        `&select=conversation_id,transcript&order=created_at.asc&limit=${MAX_PER_RUN}`
    );

    if (!pending.length) return res.status(200).json({ ok: true, graded: 0, scored_rows: 0, asked_rows: 0 });

    const sourceCache = new Map(); // document_id -> {title, body_md} | null, shared across the batch
    const results = await Promise.allSettled(pending.map((c) => gradeCall(c, sourceCache)));

    let graded = 0, scoredRows = 0, askedTotal = 0, noSource = 0;
    const failures = [];
    for (const r of results) {
      if (r.status !== "fulfilled") {
        const msg = String(r.reason?.message || r.reason);
        console.error("grade failed:", msg);
        failures.push({ stage: "grade", error: msg.slice(0, 300) });
        continue;
      }
      const { conversation_id, rows, askedRows, security_flag, security_detail } = r.value;
      try {
        if (rows.length) {
          if (rows.every((x) => x.grounding === "no_source")) noSource += 1;
          await sb("call_question_scores?on_conflict=conversation_id,question_key", {
            method: "POST",
            prefer: "resolution=merge-duplicates,return=minimal",
            body: rows,
          });
          scoredRows += rows.length;
        }
        if (askedRows && askedRows.length) {
          await sb("call_questions?on_conflict=conversation_id,canonical_key", {
            method: "POST",
            prefer: "resolution=merge-duplicates,return=minimal",
            body: askedRows,
          });
          askedTotal += askedRows.length;
        }
        // Stamp the call so it isn't re-graded, and carry the security verdict onto the call row.
        await sb(`ai_call_events?conversation_id=eq.${q(conversation_id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: { scored_at: new Date().toISOString(), security_flag, security_detail },
        });
        graded += 1;
      } catch (e) {
        const msg = String(e.message || e);
        console.error("grade write failed:", conversation_id, msg);
        failures.push({ stage: "write", conversation_id, error: msg.slice(0, 300) });
      }
    }

    // A run that graded NOTHING while calls were waiting is a broken grader, not a quiet success.
    // This endpoint used to answer 200 {ok:true, graded:0} in exactly that case, and it did so for
    // weeks: a leftover foreign key rejected every score row, the write threw, the error went to a
    // log nobody reads, and the calls were re-graded on every dashboard refresh forever. The only
    // calls that got through were the ones where she answered nothing, because those write no score
    // rows at all. Say it out loud instead.
    const stuck = graded === 0 && pending.length > 0;

    res.setHeader("Cache-Control", "no-store");
    return res.status(stuck ? 500 : 200).json({
      ok: !stuck && !failures.length,
      graded, scored_rows: scoredRows, asked_rows: askedTotal,
      calls_without_source: noSource, pending: pending.length,
      stuck,
      failed: failures.length,
      // First few only — one broken constraint produces the same error for every call in the batch.
      errors: failures.slice(0, 3),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
