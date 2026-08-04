// POST /api/refine  { article: { slug, title, environment, body_md, source?, source_text?, issues[] } }
//   -> { ok, md, slug, findings, review, candidate_questions, graded_against_source }
// Revise ONE card to address reviewer feedback (e.g. "slight redundancy"), WITHOUT adding facts
// or changing meaning — then re-validate (deterministic guards + critic) so you see the new score.
// Runs on Sonnet: this is a small, targeted edit, not full generation.
//
// `source_text` is the raw document the card came from, and it matters. Re-grading a card against
// ITSELF is a rigged exam — every claim it makes is trivially present in its own text, so the
// critic returns 5/5 no matter what the edit did. With the source, the re-score means the same
// thing the first score meant. Without it, the response says so rather than showing a fake number.
import Anthropic from "@anthropic-ai/sdk";
import { articleToMarkdown, parseArticle } from "../lib/kcs.js";
import { deterministicScan, critique } from "../lib/validate.js";

const client = new Anthropic();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    question: { type: "string", description: "The card's question, as a member would ask it." },
    environment: { type: "string" },
    answer: { type: "string", description: "The revised answer — plain text, no markdown symbols." },
    qualifiers: {
      type: "array",
      description: "Conditions that change the answer. Keep the ones already there unless the feedback says otherwise.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { when: { type: "string" }, then: { type: "string" } },
        required: ["when", "then"],
      },
    },
    notes: { type: "array", items: { type: "string" }, description: "Agent-facing: what the source does not settle. Never a plan fact." },
    candidate_questions: { type: "array", items: { type: "string" } },
  },
  required: ["slug", "question", "environment", "answer", "qualifiers", "notes", "candidate_questions"],
};

const SYSTEM = `You revise ONE knowledge-base card to address reviewer feedback, WITHOUT changing its
meaning or adding facts that aren't already present. Keep it grounded (no new figures), keep it PLAIN
TEXT (no markdown symbols — no #, **, *, backticks), keep the same voice.

The card has four parts and they stay four parts:
- QUESTION: what a member asks, in their words.
- ANSWER: the spoken answer to exactly that question. No conditions, no statements about what the
  document leaves out.
- QUALIFIERS: the conditions that change the answer, as when/then pairs.
- NOTES: agent-facing — what the SOURCE DOCUMENT does not settle, so the agent routes instead of
  guessing. Never a plan fact.

If the feedback says a claim isn't in the source, REMOVE the claim or soften it back to exactly what
the source supports — do not re-word it and keep the assertion. If the feedback says something is
left out, only add it if the feedback quotes it. Fix ONLY what the feedback calls out — do NOT
rewrite wholesale or drop detail. Return ONLY the structured tool.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const a = (req.body && req.body.article) || {};
    const body_md = String(a.body_md || "").trim();
    const environment = String(a.environment || "").trim();
    const sourceText = String(a.source_text || "").replace(/\r\n/g, "\n").trim();
    const issues = Array.isArray(a.issues) ? a.issues.filter(Boolean) : [];
    if (!body_md) return res.status(400).json({ error: "need article.body_md" });

    const user = `CURRENT CARD:
"""
${body_md}
"""

REVIEWER FEEDBACK to address:
- ${issues.length ? issues.join("\n- ") : "tighten and de-duplicate; keep every fact"}

Environment (use verbatim): ${environment}. Slug: ${a.slug || "article"}.
Return the revised card via the tool.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content.find((b) => b.type === "text");
    if (!text) throw new Error("refine returned no text block");
    const art = JSON.parse(text.text);
    art.environment = environment || art.environment;
    if (!art.slug) art.slug = a.slug || "article";

    const md = articleToMarkdown(art, { source: a.source || null });
    const findings = deterministicScan(md, art);

    // Only re-grade when there's a real source to grade against.
    let review = null;
    if (sourceText) {
      try { review = (await critique([{ slug: art.slug, md, article: parseArticle(md, art) }], sourceText))?.[0] || null; }
      catch (_) { /* the revision still returns; the card just stays unscored */ }
    }

    return res.status(200).json({
      ok: true, md, slug: art.slug, findings, review,
      question: art.question,
      candidate_questions: art.candidate_questions || [],
      notes: art.notes || [],
      graded_against_source: !!sourceText,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
