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

// The critic returns evidence, never a number. Note there is no `score` property here — that is
// deliberate and is the whole anti-inflation mechanism.
const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      description: "Every checkable factual claim the article makes, each traced to the source.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string", description: "The claim, as the article states it." },
          source_quote: { type: "string", description: "Verbatim span from the raw source establishing it. Empty when unsupported." },
          verdict: { type: "string", enum: ["supported", "unsupported", "contradicted"] },
        },
        required: ["claim", "source_quote", "verdict"],
      },
    },
    omissions: {
      type: "array",
      description: "Facts in the source that belong in THIS article and are missing.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          missing: { type: "string", description: "What the article leaves out." },
          source_quote: { type: "string", description: "Verbatim span from the source that contains it." },
        },
        required: ["missing", "source_quote"],
      },
    },
    answers_the_title: { type: "boolean" },
    title_is_askable: { type: "boolean" },
    speakable: { type: "boolean" },
    coverage_complete: { type: "boolean" },
    bloat: { type: "boolean" },
    notes: { type: "array", items: { type: "string" }, description: "One short, specific line per real defect. Empty if clean." },
  },
  required: ["claims", "omissions", "answers_the_title", "title_is_askable", "speakable", "coverage_complete", "bloat", "notes"],
};

// The rubric, as arithmetic. Deducting from a perfect 5 makes every point lost traceable to a
// specific piece of evidence, so "5/5" now means "nothing was found against it" rather than
// "the model felt good about it". Weights reflect what actually harms a caller: being told
// something false is worse than being told it awkwardly.
export const SCORE_RULES = [
  { key: "contradicted", cost: 3, label: "contradicts the source" },
  { key: "unsupported", cost: 2, label: "claim the source doesn't establish" },
  { key: "omission", cost: 1, cap: 2, label: "fact from the source left out" },
  { key: "answers_the_title", cost: 2, label: "body doesn't answer its own title" },
  { key: "title_is_askable", cost: 1, label: "title isn't how a participant would ask" },
  { key: "speakable", cost: 1, label: "doesn't read cleanly aloud" },
  { key: "coverage_complete", cost: 1, label: "gaps not flagged for routing" },
  { key: "bloat", cost: 1, label: "padded beyond what the source supports" },
];

// Turn one critic result into { score, issues, counts }. Pure — unit-testable without an API key.
export function scoreReview(v) {
  const claims = Array.isArray(v?.claims) ? v.claims : [];
  const omissions = Array.isArray(v?.omissions) ? v.omissions : [];
  const contradicted = claims.filter((c) => c.verdict === "contradicted");
  const unsupported = claims.filter((c) => c.verdict === "unsupported");

  const deductions = [];
  const take = (n, cost, cap, label) => {
    if (!n) return;
    const counted = cap ? Math.min(n, cap) : n;
    deductions.push({ label, points: counted * cost });
  };
  take(contradicted.length, 3, null, "contradicts the source");
  take(unsupported.length, 2, null, "claim the source doesn't establish");
  take(omissions.length, 1, 2, "fact from the source left out");
  if (v?.answers_the_title === false) deductions.push({ label: "body doesn't answer its own title", points: 2 });
  if (v?.title_is_askable === false) deductions.push({ label: "title isn't how a participant would ask", points: 1 });
  if (v?.speakable === false) deductions.push({ label: "doesn't read cleanly aloud", points: 1 });
  if (v?.coverage_complete === false) deductions.push({ label: "gaps not flagged for routing", points: 1 });
  if (v?.bloat === true) deductions.push({ label: "padded beyond what the source supports", points: 1 });

  const lost = deductions.reduce((s, d) => s + d.points, 0);
  const score = Math.max(1, Math.min(5, 5 - lost));

  // Reviewer-facing lines: the model's own notes first (most specific), then the evidence that
  // cost points, so the card always explains its own score.
  const issues = [];
  for (const c of contradicted) issues.push(`Contradicts the source: ${c.claim}${c.source_quote ? ` — source says: “${trim(c.source_quote)}”` : ""}`);
  for (const c of unsupported) issues.push(`Not in the source: ${c.claim}`);
  for (const o of omissions) issues.push(`Left out: ${o.missing}`);
  for (const n of Array.isArray(v?.notes) ? v.notes : []) if (!issues.includes(n)) issues.push(n);

  return {
    score,
    issues,
    counts: {
      claims: claims.length,
      supported: claims.length - contradicted.length - unsupported.length,
      unsupported: unsupported.length,
      contradicted: contradicted.length,
      omissions: omissions.length,
    },
    deductions,
  };
}

const trim = (s) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > 140 ? t.slice(0, 137) + "…" : t; };

// One critic call for ONE article. The raw source is a cached system block, so fanning out over
// N articles re-sends the article only — grading each one alone stops the batch effect where a
// single call spreads its attention across ten articles and settles on one uniform verdict.
async function critiqueOne(r, rawText) {
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: CRITIC_SCHEMA } },
    system: [
      { type: "text", text: CRITIC_SYSTEM },
      { type: "text", text: `RAW SOURCE (ground truth):\n"""\n${rawText}\n"""`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `ARTICLE TO VERIFY (slug: ${r.slug}):\n"""\n${r.md}\n"""\n\nVerify it against the raw source per your instructions. Return ONLY the structured JSON.` }],
  }, { timeout: 120000 });
  const text = res.content.find((b) => b.type === "text");
  if (!text) throw new Error("critic returned no text block");
  const v = JSON.parse(text.text);
  return { slug: r.slug, ...v, ...scoreReview(v) };
}

// LLM critic, one call per article. `rendered` is [{slug, md}].
// The first article runs alone so it writes the source into the prompt cache; the rest fan out
// against a warm cache. A critic that fails is dropped, not fatal — the run still returns.
export async function critique(rendered, rawText) {
  if (!rendered.length) return [];
  const out = [];
  const first = await critiqueOne(rendered[0], rawText).catch(() => null);
  if (first) out.push(first);
  const rest = await Promise.allSettled(rendered.slice(1).map((r) => critiqueOne(r, rawText)));
  for (const s of rest) if (s.status === "fulfilled") out.push(s.value);
  return out;
}
