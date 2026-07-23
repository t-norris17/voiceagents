// POST /api/clean  { text, env, slug?, source? }  ->  the cleaned articles + reviewer reports.
// The hosted "door" for the content cleaner: runs the SAME pipeline as the CLI
// (rewrite -> validate -> critic) in-memory and returns everything the review page needs.
// It PROPOSES; a human approves on the page before anything is used. Needs ANTHROPIC_API_KEY
// (set on the Vercel project). maxDuration is raised in vercel.json — the rewrite is a big call.
import { rewrite } from "../lib/rewrite.js";
import { deterministicScan, critique } from "../lib/validate.js";
import { renderArticles, dropReport, coverageMap, candidateQuestions } from "../lib/render.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { text, env, slug, source } = req.body || {};
    const raw = String(text || "").replace(/\r\n/g, "\n").trim();
    const environment = String(env || "").trim();
    if (!raw) return res.status(400).json({ error: "no text" });
    if (!environment) return res.status(400).json({ error: "environment (plan name) is required" });
    if (raw.length > 200000) return res.status(413).json({ error: "text too large (>200k chars) — split it" });

    const meta = { slug: (slug || "cleaned").trim(), environment, source: (source || "").trim() || null };

    const result = await rewrite(raw, environment);
    const rendered = renderArticles(result, meta);

    // deterministic guards
    const findingsBySlug = {};
    let fatal = 0, warns = 0;
    for (const r of rendered) {
      const article = result.articles.find((a) => a.slug === r.slug);
      const findings = deterministicScan(r.md, article);
      findingsBySlug[r.slug] = findings;
      fatal += findings.filter((f) => f.severity === "fatal").length;
      warns += findings.filter((f) => f.severity === "warn").length;
    }

    // LLM critic (best-effort — the docs + reports still return if it fails)
    let reviews = [];
    try { reviews = await critique(rendered, raw); } catch (_) { reviews = []; }

    const articles = rendered.map((r) => {
      const a = result.articles.find((x) => x.slug === r.slug) || {};
      return {
        slug: r.slug,
        title: a.title || r.slug,
        md: r.md,
        findings: findingsBySlug[r.slug] || [],
        review: reviews.find((v) => v.slug === r.slug) || null,
        candidate_questions: a.candidate_questions || [],
      };
    });

    const criticAvg = reviews.length ? reviews.reduce((s, v) => s + v.score, 0) / reviews.length : null;

    return res.status(200).json({
      ok: true,
      meta,
      articles,
      dropped: result.dropped,
      coverage_gaps: result.coverage_gaps,
      terminology_notes: result.terminology_notes,
      reports: {
        drop: dropReport(result, findingsBySlug),
        coverage: coverageMap(result, reviews),
        questions: candidateQuestions(result),
      },
      summary: { articles: articles.length, fatal, warns, criticAvg },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
