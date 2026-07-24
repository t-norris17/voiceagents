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
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slug: { type: "string", description: "kebab-case, becomes the filename (e.g. account-access)." },
          title: { type: "string", description: "Findable, phrased the way a participant would ASK." },
          issue: { type: "string", description: "The participant's need in their own words." },
          environment: { type: "string", description: "What it applies to; use the provided environment verbatim." },
          resolution: { type: "string", description: "Grounded, complete, spoken-friendly answer. No tables/UI gestures/cross-refs." },
          cause: { type: "string", description: "The why, when it helps. Empty string if it adds nothing." },
          coverage_flags: { type: "array", items: { type: "string" }, description: "What the source does NOT cover for this topic → route to specialist." },
          candidate_questions: { type: "array", items: { type: "string" }, description: "1-3 questions a participant would ask that this article answers." },
          source_span: { type: "string", description: "Short quote/anchor from the raw text this came from." },
        },
        required: ["slug", "title", "issue", "environment", "resolution", "cause", "coverage_flags", "candidate_questions", "source_span"],
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

Segment this into KCS-gold, Robin-ready articles per your instructions. One topic per article.
Drop the noise (record each drop). Flag what the source does not cover. Return ONLY the structured JSON.`;

  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: REWRITE_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
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
