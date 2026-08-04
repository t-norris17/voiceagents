// Stage 2 — rewrite. One Opus call with structured output: segment the raw source into
// topics, drop noise, and rewrite each topic to the KCS-gold + voice-RAG shape. Grounded
// only — reworks the source, never invents; gaps are flagged, not filled. Same structured
// API the grader uses (output_config.format json_schema).
import Anthropic from "@anthropic-ai/sdk";
import { REWRITE_SYSTEM } from "./kcs.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

// Structured outputs don't support numeric min/max; counts are guided in the prompt.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    articles: {
      type: "array",
      description: "One card per participant question. Four parts each: question, answer, qualifiers, notes.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slug: { type: "string", description: "kebab-case, becomes the filename (e.g. account-access)." },
          question: { type: "string", description: "The card's question, phrased the way a participant would ASK it out loud." },
          environment: { type: "string", description: "What it applies to; use the provided environment verbatim." },
          answer: { type: "string", description: "The spoken answer to that question. Grounded, complete, plain text. No conditions (those are qualifiers) and no statements about what the document omits (those are notes)." },
          qualifiers: {
            type: "array",
            description: "Conditions the SOURCE states that CHANGE the answer. Empty when the answer is unconditional — do not invent one.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                when: { type: "string", description: "The condition, without a leading 'if' (e.g. 'you're still employed at the company')." },
                then: { type: "string", description: "How the answer changes when it holds." },
              },
              required: ["when", "then"],
            },
          },
          notes: {
            type: "array",
            items: { type: "string" },
            description: "Agent-facing. What THIS SOURCE does not settle that a member will ask next, so Robin routes instead of guessing. Never a plan fact.",
          },
          candidate_questions: { type: "array", items: { type: "string" }, description: "1-3 questions a participant would ask that this card answers." },
          source_span: { type: "string", description: "Short quote/anchor from the raw text this came from." },
        },
        required: ["slug", "question", "environment", "answer", "qualifiers", "notes", "candidate_questions", "source_span"],
      },
    },
    dropped: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: { type: "string", description: "Short label/quote of the dropped block." },
          reason: { type: "string", description: "Why it was cut (fee table, boilerplate, marketing, not spoken-answerable)." },
        },
        required: ["content", "reason"],
      },
    },
    coverage_gaps: { type: "array", items: { type: "string" }, description: "Run-level: things participants will ask that the source does not answer." },
    terminology_notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"],
      },
      description: "from → to normalizations applied (e.g. deferral → how much you contribute).",
    },
  },
  required: ["articles", "dropped", "coverage_gaps", "terminology_notes"],
};

export async function rewrite(rawText, environment) {
  const user = `ENVIRONMENT (use this verbatim as each article's "environment"): ${environment}

RAW SOURCE CONTENT:
"""
${rawText}
"""

Segment this into KCS-gold, Robin-ready cards per your instructions. One participant question per
card, each with its question, answer, qualifiers and notes. Drop the noise (record each drop).
Put what the source does not settle in each card's notes. Return ONLY the structured JSON.`;

  // Stream the call: at a 32k-token budget the SDK refuses the non-streaming path (the request
  // could exceed its 10-minute ceiling). Streaming lifts that guard; finalMessage() reassembles
  // the complete response, so the stop_reason check and parsing below are unchanged. The actual
  // call finishes well within the function's maxDuration — the ceiling is a budget estimate.
  const res = await client.messages
    .stream({
      model: "claude-opus-4-8",
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: REWRITE_SYSTEM,
      messages: [{ role: "user", content: user }],
    }, { timeout: 280000 }) // bound the wait just under the 300s function cap, not the SDK's 600s default
    .finalMessage();
  // If the model ran out of output budget, the structured JSON is truncated mid-string and
  // JSON.parse would throw a cryptic "unterminated string" — give an actionable message instead.
  if (res.stop_reason === "max_tokens")
    throw new Error("This document produced more cleaned content than fits in one pass. Clean it in smaller sections — a few pages or topics at a time — then publish each.");
  const text = res.content.find((b) => b.type === "text");
  if (!text) throw new Error("rewrite returned no text block");
  try {
    return JSON.parse(text.text);
  } catch (e) {
    throw new Error("Couldn't parse the cleaned output — it may have been cut off. Try a smaller section of the document. (" + String(e.message || e) + ")");
  }
}
