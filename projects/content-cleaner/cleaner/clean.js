#!/usr/bin/env node
// Content Cleaner CLI — raw source text -> KCS-gold, Robin-ready KB articles + reviewer report.
// It PROPOSES; a human approves before anything reaches the ElevenLabs KB.
//
// Usage:
//   node clean.js <input.txt|.md> --slug <plan-slug> --env "<Environment>" [--source "<citation>"] [--out <dir>]
//
// Example:
//   node clean.js intrust-raw.txt --slug intrust --env "INTRUST 401(k) Plan" \
//     --source "2025 INTRUST Enrollment Packet"
//
// Needs ANTHROPIC_API_KEY. Exit code 1 on a FATAL finding (e.g. PII in output).
import { join, resolve } from "node:path";
import { extract } from "./lib/extract.js";
import { rewrite } from "./lib/rewrite.js";
import { deterministicScan, critique } from "./lib/validate.js";
import { render, renderArticles } from "./lib/render.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args._[0];
  if (!input || !args.slug || !args.env) {
    console.error('Usage: node clean.js <input.txt|.md> --slug <plan-slug> --env "<Environment>" [--source "<citation>"] [--out <dir>]');
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set.");
    process.exit(2);
  }
  const outDir = resolve(args.out || join("out", args.slug));
  const meta = { slug: args.slug, environment: args.env, source: args.source || null };

  console.error(`• extract  ${input}`);
  const { text, stats } = extract(resolve(input));
  console.error(`  ${stats.words} words, ${stats.lines} lines`);

  console.error(`• rewrite  (Opus, structured) …`);
  const result = await rewrite(text, args.env);
  console.error(`  ${result.articles.length} articles, ${result.dropped.length} drops, ${result.coverage_gaps.length} gaps`);

  const rendered = renderArticles(result, meta);

  console.error(`• validate (deterministic guards) …`);
  const findingsBySlug = {};
  let fatal = 0;
  for (const r of rendered) {
    const article = result.articles.find((a) => a.slug === r.slug);
    const findings = deterministicScan(r.md, article);
    findingsBySlug[r.slug] = findings;
    fatal += findings.filter((f) => f.severity === "fatal").length;
  }

  console.error(`• critique (Opus, structured) …`);
  let reviews = [];
  try {
    reviews = await critique(rendered, text);
  } catch (e) {
    console.error(`  critic skipped: ${e.message}`);
  }

  const written = render(outDir, { result, findingsBySlug, reviews, rendered, meta: { ...meta, stats } });

  // Summary
  const warnCount = Object.values(findingsBySlug).flat().filter((f) => f.severity === "warn").length;
  const lowScores = reviews.filter((r) => r.score <= 3);
  console.error("");
  console.error(`✔ wrote ${written.length} files to ${outDir}`);
  console.error(`  articles: ${result.articles.length} · deterministic warns: ${warnCount} · fatal: ${fatal}`);
  if (reviews.length) console.error(`  critic avg: ${(reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(1)}/5` + (lowScores.length ? ` · ${lowScores.length} article(s) ≤3 — review` : ""));
  console.error(`  review: ${join(outDir, "_drop-report.md")} , _coverage-map.md , _candidate-questions.md`);

  if (fatal > 0) {
    console.error("");
    console.error(`✖ FATAL: ${fatal} PII finding(s) in output — NOT safe to import. See _drop-report.md.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
