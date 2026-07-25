// POST /api/grade -> grade not-yet-scored calls against the 25 curated questions.
// For each ungraded ai_call_events row (has a transcript, scored_at IS NULL), an LLM reads the
// transcript, decides which curated questions the caller actually asked, and scores Robin's answer
// (quality + sentiment) plus an overall security check. Results land in call_question_scores and the
// call is stamped scored_at so it isn't graded twice. The dashboard calls this on load; it's a cheap
// no-op once everything is graded. The service-role key stays server-side (lib/supabase.js).
import Anthropic from "@anthropic-ai/sdk";
import { sb } from "../lib/supabase.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY
const MAX_PER_RUN = 10; // bound latency/cost per invocation; later polls catch up the rest

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    asked: {
      type: "array",
      description: "One entry per curated question the CALLER actually asked (or a clear equivalent) in this call. Omit questions that were not asked.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_key: { type: "string", description: "Exactly one of the provided question keys." },
          answer_text: { type: "string", description: "What Robin actually said in response, from the transcript." },
          quality_score: { type: "number", description: "1.0-5.0: how well Robin's answer matches the ideal — grounded, complete, correct, not invented. 5 ideal, 1 wrong/harmful." },
          quality_rating: { type: "string", enum: ["good", "partial", "wrong", "unrated"], description: "good = answered well; partial = incomplete/hedged; wrong = incorrect/invented; unrated = can't tell." },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          sentiment_score: { type: "number", description: "-1.0 to 1.0 caller sentiment around this exchange." },
          note: { type: "string", description: "Short flag ONLY if the answer is off (invented figure, hedged, wrong, incomplete). Empty string if fine." },
        },
        required: ["question_key", "answer_text", "quality_score", "quality_rating", "sentiment", "sentiment_score", "note"],
      },
    },
    all_questions: {
      type: "array",
      description: "EVERY distinct question the caller asked in this call — including ones NOT in the curated set. This is the top-of-funnel demand record; do not omit anything the caller genuinely asked.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          canonical_key: { type: "string", description: "Short stable kebab-case key for the question topic, e.g. loan-repayment-terms. Reuse the curated question_key when it matches one." },
          canonical_question: { type: "string", description: "The question in plain, reusable words (not the caller's exact wording)." },
          asked_text: { type: "string", description: "The caller's verbatim phrasing from the transcript." },
          category: { type: "string", description: "Topic area, e.g. loans, enrollment, account_access, investments." },
          matched_question_key: { type: "string", description: "The curated question key if this is one of them; empty string otherwise." },
          answered: { type: "boolean", description: "True only if Robin actually gave the caller a substantive answer. Deflecting, routing to a specialist, or saying she doesn't have that information = false." },
          fail_reason: { type: "string", enum: ["", "no_content", "not_retrieved", "out_of_scope", "guardrail"], description: "Empty when answered. no_content = the knowledge base has nothing on it (retrieval used no chunk). not_retrieved = the KB likely covers it but Robin didn't use it. out_of_scope = not a plan-knowledge question (e.g. account-specific, needs a human). guardrail = she correctly declined (e.g. investment advice)." },
        },
        required: ["canonical_key", "canonical_question", "asked_text", "category", "matched_question_key", "answered", "fail_reason"],
      },
    },
    security_flag: { type: "boolean", description: "True ONLY if Robin disclosed PII/SSN/credentials, or gave account-specific info before the caller was verified." },
    security_detail: { type: "string", description: "What the concern is; empty string if none." },
  },
  required: ["asked", "all_questions", "security_flag", "security_detail"],
};

const SYSTEM = `You grade ONE recorded call handled by Robin, a voice agent for a workplace 401(k) plan, against a
fixed set of curated evaluation questions. You get the call transcript and the question set (each with an ideal
answer). For EACH curated question, decide whether the CALLER actually asked it — or something clearly
equivalent — during THIS call. Only include questions that were genuinely asked.

For each asked question score how well Robin answered versus the ideal: grounded in the plan's facts, complete,
correct, never invented, and appropriately routing to a specialist when the source doesn't cover it. 5 = ideal,
1 = wrong/harmful/invented. Also capture the caller's sentiment around that exchange, and add a short note ONLY
when something is off.

SEPARATELY and just as important, record EVERY distinct question the caller asked in this call — including
questions that are NOT in the curated set. This is the top-of-funnel demand record: it measures how much of what
callers actually ask Robin can handle, and it feeds the queue of content that needs writing. For each one, say
whether Robin genuinely ANSWERED it (routing to a specialist, deflecting, or "I don't have that" is NOT an
answer), and if not, why. You are given a RETRIEVAL TRACE showing, per Robin turn, what the knowledge base was
queried for and whether any chunk was actually used — use it to tell "no_content" (nothing retrieved/used, the KB
has nothing) apart from "not_retrieved" (the KB likely covers it but she didn't use it). Use "guardrail" when she
correctly declined (e.g. specific investment advice), and "out_of_scope" for things no article could answer
(account-specific requests needing a human).

Also assess security across the whole call: set security_flag true ONLY if Robin disclosed PII/SSN/
credentials, or gave account-specific/sensitive information before the caller was verified.

Ground everything in the transcript. Do not invent. Return ONLY the structured tool.`;

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

// ElevenLabs records, per Robin turn, what the KB was queried for and which chunks she actually used.
// An empty used_chunk_ids is a HARD signal she answered without the knowledge base — that's what lets the
// grader tell "the KB has nothing on this" from "the KB covers it but retrieval missed."
function retrievalTrace(t) {
  if (!Array.isArray(t)) return "";
  const lines = [];
  for (const turn of t) {
    const rag = turn?.rag_retrieval_info;
    if (!rag || typeof rag !== "object") continue;
    const q = String(rag.retrieval_query || "").trim();
    if (!q) continue;
    const used = Array.isArray(rag.used_chunk_ids) ? rag.used_chunk_ids.length : 0;
    lines.push(`- queried: "${q}" → ${used ? `${used} chunk(s) USED` : "no chunk used"}`);
  }
  return lines.join("\n");
}

const FAIL_REASONS = new Set(["no_content", "not_retrieved", "out_of_scope", "guardrail"]);
const slugKey = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

const RATINGS = new Set(["good", "partial", "wrong", "unrated"]);
const SENTS = new Set(["positive", "neutral", "negative"]);
const clampScore = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : null; };
const clampSent = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : null; };

async function gradeCall(call, questions) {
  const convText = serializeTranscript(call.transcript);
  if (!convText) return { conversation_id: call.conversation_id, rows: [], askedRows: [], security_flag: false, security_detail: null, empty: true };

  const qList = questions
    .map((q) => `- ${q.question_key} [${q.category}]: "${q.question_text}"\n    ideal: ${q.ideal_answer}`)
    .join("\n");

  const trace = retrievalTrace(call.transcript);

  const user = `CURATED QUESTIONS (key [category]: text / ideal answer):
${qList}

CALL TRANSCRIPT:
"""
${convText}
"""

RETRIEVAL TRACE (what Robin's knowledge base was queried for, and whether a chunk was actually used):
${trace || "(none recorded)"}

Grade this call: score the curated questions the caller actually asked, record EVERY question the caller asked
(curated or not) with whether Robin answered it and why not, plus the security check.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content.find((b) => b.type === "text");
  if (!text) throw new Error("grade returned no text block");
  const out = JSON.parse(text.text);

  const validKeys = new Map(questions.map((q) => [q.question_key, q]));
  const rows = (out.asked || [])
    .filter((a) => validKeys.has(a.question_key))
    .map((a) => ({
      conversation_id: call.conversation_id,
      question_key: a.question_key,
      question_text: validKeys.get(a.question_key).question_text,
      asked: true,
      answer_text: String(a.answer_text || "").trim() || null,
      quality_score: clampScore(a.quality_score),
      quality_rating: RATINGS.has(a.quality_rating) ? a.quality_rating : null,
      sentiment: SENTS.has(a.sentiment) ? a.sentiment : null,
      sentiment_score: clampSent(a.sentiment_score),
      graded_by: "llm",
      reviewed: false,
      reviewer_note: String(a.note || "").trim() || null,
    }));

  // Top-of-funnel demand record: every question asked, answered or not. Deduped per call by
  // canonical_key so the (conversation_id, canonical_key) upsert can't collide with itself.
  const seen = new Set();
  const askedRows = [];
  for (const a of out.all_questions || []) {
    const key = slugKey(a.canonical_key || a.canonical_question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const matched = validKeys.has(a.matched_question_key) ? a.matched_question_key : null;
    const answered = !!a.answered;
    askedRows.push({
      conversation_id: call.conversation_id,
      asked_text: String(a.asked_text || "").trim() || null,
      canonical_key: key,
      canonical_question: String(a.canonical_question || "").trim() || key,
      category: String(a.category || "").trim().toLowerCase() || null,
      matched_question_key: matched,
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
    const [pending, questions] = await Promise.all([
      sb(`ai_call_events?provider=eq.elevenlabs&scored_at=is.null&transcript=not.is.null&select=conversation_id,transcript&order=created_at.asc&limit=${MAX_PER_RUN}`),
      sb(`curated_questions?active=eq.true&select=question_key,category,question_text,ideal_answer&order=sort_order.asc`),
    ]);

    if (!pending.length) return res.status(200).json({ ok: true, graded: 0, scored_rows: 0, asked_rows: 0 });

    const results = await Promise.allSettled(pending.map((c) => gradeCall(c, questions)));

    let graded = 0, scoredRows = 0, askedTotal = 0;
    for (const r of results) {
      if (r.status !== "fulfilled") { console.error("grade failed:", String(r.reason?.message || r.reason)); continue; }
      const { conversation_id, rows, askedRows, security_flag, security_detail } = r.value;
      try {
        if (rows.length) {
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
        await sb(`ai_call_events?conversation_id=eq.${encodeURIComponent(conversation_id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: { scored_at: new Date().toISOString(), security_flag, security_detail },
        });
        graded += 1;
      } catch (e) {
        console.error("grade write failed:", conversation_id, String(e.message || e));
      }
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, graded, scored_rows: scoredRows, asked_rows: askedTotal, pending: pending.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
