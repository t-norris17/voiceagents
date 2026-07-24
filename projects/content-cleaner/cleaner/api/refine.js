// POST /api/refine  { article: { slug, title, environment, body_md, source?, issues[] } }
//   -> { ok, md, slug, findings, review, candidate_questions }
// Revise ONE article to address reviewer feedback (e.g. "slight redundancy"), WITHOUT adding facts
// or changing meaning — then re-validate (deterministic guards + critic) so you see the new score.
// Runs on Sonnet: this is a small, targeted edit, not full generation.
import Anthropic from "@anthropic-ai/sdk";
import { articleToMarkdown } from "../lib/kcs.js";
import { deterministicScan, critique } from "../lib/validate.js";

const client = new Anthropic();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    issue: { type: "string" },
    environment: { type: "string" },
    resolution: { type: "string", description: "The revised article body — plain text, no markdown symbols." },
    cause: { type: "string" },
    coverage_flags: { type: "array", items: { type: "string" } },
    candidate_questions: { type: "array", items: { type: "string" } },
  },
  required: ["slug", "title", "issue", "environment", "resolution", "cause", "coverage_flags", "candidate_questions"],
};

const SYSTEM = `You revise ONE knowledge-base article to address reviewer feedback, WITHOUT changing its
meaning or adding facts that aren't already present. Keep it grounded (no new figures), keep it PLAIN
TEXT (no markdown symbols — no #, **, *, backticks), keep the same shape and voice. Fix ONLY what the
feedback calls out (e.g. remove a redundancy, tighten wording) — do NOT rewrite wholesale or drop
detail. Return ONLY the structured tool.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const a = (req.body && req.body.article) || {};
    const body_md = String(a.body_md || "").trim();
    const environment = String(a.environment || "").trim();
    const issues = Array.isArray(a.issues) ? a.issues.filter(Boolean) : [];
    if (!body_md) return res.status(400).json({ error: "need article.body_md" });

    const user = `CURRENT ARTICLE:
"""
${body_md}
"""

REVIEWER FEEDBACK to address:
- ${issues.length ? issues.join("\n- ") : "tighten and de-duplicate; keep every fact"}

Environment (use verbatim): ${environment}. Slug: ${a.slug || "article"}.
Return the revised article via the tool.`;

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

    const md = articleToMarkdown(art, { source: a.source || null });
    const findings = deterministicScan(md, art);
    let review = null;
    try { review = (await critique([{ slug: art.slug, md }], body_md))?.[0] || null; } catch (_) {}

    return res.status(200).json({ ok: true, md, slug: art.slug, findings, review, candidate_questions: art.candidate_questions || [] });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
