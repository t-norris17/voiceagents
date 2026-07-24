// Stage 3 — validate. Deterministic guards run FIRST so a bad rewrite can't slip PII or
// un-speakable artifacts through on model judgment alone (PII is a HARD FAIL). Then an LLM
// critic judges what code can't: grounding, requestor's-words, coverage completeness, "just
// enough". Mirrors the grader's split (deterministic security scan + LLM judge).
import Anthropic from "@anthropic-ai/sdk";
import { CRITIC_SYSTEM } from "./kcs.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

// --- deterministic patterns ---
const SSN_RE = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/;          // SSN-shaped 9-digit number (HARD FAIL)
const SSN_WORDS = /\bsocial security number\b/i;
const CROSSREF_RE = /\b(see|refer to|as (noted|mentioned|shown|described))\b[^.]*\b(above|below|section|table|chart|page|earlier|previous)\b/i;
const GESTURE_RE = /\b(click|tap|press)\b[^.]*\b(icon|button|gear|dropdown|drop-down|menu|link)\b/i;
const TABLEROW_RE = /^\s*\|.*\|\s*$/m;                        // markdown table row
const BARE_PHONE_RE = /\b\d{10}\b/;                          // 10 digits with no separators (hard to speak)
const RESOLUTION_MAX = 2600;                                  // "just enough" soft ceiling (chars) — a rich, multi-section article is fine; this only flags a runaway

// Scan one rendered article. Returns findings [{severity,kind,detail}]. severity: "fatal" | "warn".
export function deterministicScan(md, article) {
  const findings = [];
  if (SSN_RE.test(md)) findings.push({ severity: "fatal", kind: "pii-ssn", detail: "An SSN-shaped 9-digit number is present." });
  if (SSN_WORDS.test(md) && /\d/.test(md)) findings.push({ severity: "fatal", kind: "pii-ssn-words", detail: "References an SSN alongside digits." });
  if (CROSSREF_RE.test(md)) findings.push({ severity: "warn", kind: "cross-reference", detail: "Contains a cross-reference (see above/below/section) — must be self-contained for voice." });
  if (GESTURE_RE.test(md)) findings.push({ severity: "warn", kind: "ui-gesture", detail: "Contains a UI gesture (click/tap an icon/button) that doesn't read aloud." });
  if (TABLEROW_RE.test(md)) findings.push({ severity: "warn", kind: "table", detail: "Contains a markdown table — doesn't speak; convert to prose." });
  if (BARE_PHONE_RE.test(md)) findings.push({ severity: "warn", kind: "bare-phone", detail: "A 10-digit run with no separators is hard for TTS to speak clearly." });
  if (article && article.resolution && article.resolution.length > RESOLUTION_MAX)
    findings.push({ severity: "warn", kind: "length", detail: `Resolution is ${article.resolution.length} chars (> ${RESOLUTION_MAX}) — trim to "just enough".` });
  if (!article || !Array.isArray(article.coverage_flags))
    findings.push({ severity: "warn", kind: "coverage", detail: "No coverage_flags — confirm the source fully covers this topic." });
  return findings;
}

const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slug: { type: "string" },
          grounded: { type: "boolean", description: "Every claim traceable to the source; no invented figures." },
          requestor_words: { type: "boolean", description: "Title/issue phrased as a participant would ask." },
          coverage_complete: { type: "boolean", description: "Gaps a participant would ask about are flagged." },
          just_enough: { type: "boolean", description: "Complete but not bloated." },
          score: { type: "integer", description: "1 (poor) to 5 (KCS-gold)." },
          issues: { type: "array", items: { type: "string" }, description: "Specific misses; empty if clean." },
        },
        required: ["slug", "grounded", "requestor_words", "coverage_complete", "just_enough", "score", "issues"],
      },
    },
  },
  required: ["reviews"],
};

// LLM critic over all articles in one call. `rendered` is [{slug, md}].
export async function critique(rendered, rawText) {
  const articlesBlock = rendered.map((r) => `--- ARTICLE ${r.slug} ---\n${r.md}`).join("\n\n");
  const user = `RAW SOURCE (ground truth):
"""
${rawText}
"""

CLEANED ARTICLES TO REVIEW:
${articlesBlock}

Review each article per your instructions. Return ONLY the structured JSON.`;
  // Critic runs on Sonnet at medium effort — it REVIEWS (grounding/coverage), it doesn't
  // generate, so the premium tier isn't needed here. The rewrite stays on Opus. This is the
  // main cost lever: it roughly halves the per-run Opus spend with negligible quality loss.
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: CRITIC_SCHEMA } },
    system: CRITIC_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text) throw new Error("critic returned no text block");
  return JSON.parse(text.text).reviews;
}
