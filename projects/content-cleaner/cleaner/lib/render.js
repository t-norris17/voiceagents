// Stage 4 — render. Article objects -> Robin-ready markdown files, plus the reviewer
// reports (_drop-report, _coverage-map, _candidate-questions) and _run.json (audit).
// Writes nothing to the ElevenLabs KB — a human approves these first.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { articleToMarkdown, normalizeArticle } from "./kcs.js";

export function dropReport(result, findingsBySlug) {
  const L = ["# Drop report", "", "_What the cleaner cut from the source, and why. Confirm nothing important was lost._", ""];
  if (result.dropped?.length) {
    L.push("| Cut | Reason |", "|---|---|");
    for (const d of result.dropped) L.push(`| ${esc(d.content)} | ${esc(d.reason)} |`);
  } else L.push("_Nothing dropped._");
  L.push("", "## Validation flags (per article)", "");
  let any = false;
  for (const [slug, findings] of Object.entries(findingsBySlug)) {
    if (!findings.length) continue;
    any = true;
    L.push(`### ${slug}`);
    for (const f of findings) L.push(`- **${f.severity.toUpperCase()}** \`${f.kind}\` — ${f.detail}`);
    L.push("");
  }
  if (!any) L.push("_No deterministic flags._", "");
  if (result.terminology_notes?.length) {
    L.push("## Terminology normalized", "", "| From | To |", "|---|---|");
    for (const t of result.terminology_notes) L.push(`| ${esc(t.from)} | ${esc(t.to)} |`);
    L.push("");
  }
  return L.join("\n").trim() + "\n";
}

export function coverageMap(result, reviews) {
  const L = ["# Coverage map", "", "_Questions answered, plus each card's notes — what its source does not settle (Robin routes those to a specialist)._", ""];
  L.push("## Questions answered", "");
  for (const raw of result.articles) {
    const a = normalizeArticle(raw);
    const r = reviews.find((x) => x.slug === a.slug);
    const score = r ? ` · critic ${r.score}/5` : "";
    L.push(`- **${a.question}** \`${a.slug}\`${score}`);
    for (const q of a.qualifiers) L.push(`  - qualifier: ${q}`);
    for (const n of a.notes) L.push(`  - note: ${n}`);
  }
  L.push("", "## Source-level gaps", "");
  if (result.coverage_gaps?.length) for (const g of result.coverage_gaps) L.push(`- ${g}`);
  else L.push("_None flagged._");
  return L.join("\n").trim() + "\n";
}

export function candidateQuestions(result) {
  const L = ["# Candidate questions", "", "_Pulled from the cleaned cards — seed for this plan's eval set (the curated-questions pattern)._", ""];
  for (const raw of result.articles) {
    const a = normalizeArticle(raw);
    if (!a.candidate_questions.length) continue;
    L.push(`## ${a.question}  \`${a.slug}\``);
    for (const q of a.candidate_questions) L.push(`- ${q}`);
    L.push("");
  }
  return L.join("\n").trim() + "\n";
}

const esc = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");

// Write everything under outDir. Returns the list of written files.
export function render(outDir, { result, findingsBySlug, reviews, rendered, meta }) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const r of rendered) {
    const p = join(outDir, `${r.slug}.md`);
    writeFileSync(p, r.md);
    written.push(p);
  }
  const files = {
    "_drop-report.md": dropReport(result, findingsBySlug),
    "_coverage-map.md": coverageMap(result, reviews),
    "_candidate-questions.md": candidateQuestions(result),
    "_run.json": JSON.stringify({ meta, result, findingsBySlug, reviews }, null, 2) + "\n",
  };
  for (const [name, body] of Object.entries(files)) {
    const p = join(outDir, name);
    writeFileSync(p, body);
    written.push(p);
  }
  return written;
}

// Render articles to {slug, md, article} using the KCS formatter (shared source of shape).
// The normalized article rides along so the critic and the deterministic guards read the same
// four sections the renderer wrote, instead of re-deriving them from the text.
export function renderArticles(result, meta) {
  return result.articles.map((a) => {
    const article = normalizeArticle(a);
    return { slug: article.slug || a.slug, md: articleToMarkdown(article, meta), article };
  });
}
