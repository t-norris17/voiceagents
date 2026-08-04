// Stage 3 — validate. Deterministic guards run FIRST so a bad rewrite can't slip PII or
// un-speakable artifacts through on model judgment alone (PII is a HARD FAIL). Then an LLM
// critic judges what code can't: grounding, requestor's-words, coverage completeness, "just
// enough". Mirrors the grader's split (deterministic security scan + LLM judge).
import Anthropic from "@anthropic-ai/sdk";
import { CRITIC_SYSTEM, articleForCritic, parseArticle } from "./kcs.js";
import { verifyClaims, verifyOmissions } from "./verify.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

// --- deterministic patterns ---
const SSN_RE = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/;          // SSN-shaped 9-digit number (HARD FAIL)
const SSN_WORDS = /\bsocial security number\b/i;
const CROSSREF_RE = /\b(see|refer to|as (noted|mentioned|shown|described))\b[^.]*\b(above|below|section|table|chart|page|earlier|previous)\b/i;
const GESTURE_RE = /\b(click|tap|press)\b[^.]*\b(icon|button|gear|dropdown|drop-down|menu|link)\b/i;
const TABLEROW_RE = /^\s*\|.*\|\s*$/m;                        // markdown table row
const BARE_PHONE_RE = /\b\d{10}\b/;                          // 10 digits with no separators (hard to speak)
const ANSWER_MAX = 2600;                                      // "just enough" soft ceiling (chars) — a rich, multi-section answer is fine; this only flags a runaway

// Scan one rendered card. Returns findings [{severity,kind,detail}]. severity: "fatal" | "warn".
export function deterministicScan(md, article) {
  const findings = [];
  const a = article && article.question !== undefined ? article : parseArticle(md, article || {});
  if (SSN_RE.test(md)) findings.push({ severity: "fatal", kind: "pii-ssn", detail: "An SSN-shaped 9-digit number is present." });
  if (SSN_WORDS.test(md) && /\d/.test(md)) findings.push({ severity: "fatal", kind: "pii-ssn-words", detail: "References an SSN alongside digits." });
  if (CROSSREF_RE.test(md)) findings.push({ severity: "warn", kind: "cross-reference", detail: "Contains a cross-reference (see above/below/section) — must be self-contained for voice." });
  if (GESTURE_RE.test(md)) findings.push({ severity: "warn", kind: "ui-gesture", detail: "Contains a UI gesture (click/tap an icon/button) that doesn't read aloud." });
  if (TABLEROW_RE.test(md)) findings.push({ severity: "warn", kind: "table", detail: "Contains a markdown table — doesn't speak; convert to prose." });
  if (BARE_PHONE_RE.test(md)) findings.push({ severity: "warn", kind: "bare-phone", detail: "A 10-digit run with no separators is hard for TTS to speak clearly." });
  if (a.answer && a.answer.length > ANSWER_MAX)
    findings.push({ severity: "warn", kind: "length", detail: `The answer is ${a.answer.length} chars (> ${ANSWER_MAX}) — trim to "just enough", or split it into two cards.` });
  if (!a.question) findings.push({ severity: "warn", kind: "structure", detail: "No question line — the card needs a question a member would actually ask." });
  if (!a.answer) findings.push({ severity: "warn", kind: "structure", detail: "No answer — the card has a question with nothing under it." });
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
      description: "Every checkable factual claim the ANSWER and QUALIFIERS make, each traced to the source. Never a note.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string", description: "The claim, as the card states it." },
          source_quote: { type: "string", description: "Verbatim span from the raw source establishing it — about a sentence. Empty when unsupported." },
          verdict: { type: "string", enum: ["supported", "unsupported", "contradicted"] },
          material: { type: "boolean", description: "True when getting this wrong changes what a participant DOES (a figure, deadline, rule, limit, contact)." },
        },
        required: ["claim", "source_quote", "verdict", "material"],
      },
    },
    omissions: {
      type: "array",
      description: "Facts in the source that belong in THIS card and are missing.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          missing: { type: "string", description: "What the card leaves out." },
          source_quote: { type: "string", description: "Verbatim span from the source that contains it." },
        },
        required: ["missing", "source_quote"],
      },
    },
    answers_the_question: { type: "boolean" },
    question_is_askable: { type: "boolean" },
    speakable: { type: "boolean" },
    gaps_flagged: { type: "boolean" },
    bloat: { type: "boolean" },
    notes_misused: { type: "boolean", description: "A note asserts a plan fact instead of describing what the document leaves open." },
    notes: { type: "array", items: { type: "string" }, description: "One short, specific line per real defect. Empty if clean." },
  },
  required: ["claims", "omissions", "answers_the_question", "question_is_askable", "speakable", "gaps_flagged", "bloat", "notes_misused", "notes"],
};

// The rubric, as arithmetic. Deducting from a perfect 5 makes every point lost traceable to a
// specific piece of evidence, so a 5 means "nothing was found against it" rather than "the model
// felt good about it".
//
// Every deduction is CAPPED. That is the fix for the run where most cards landed at 2/5 and lower:
// unsupported claims cost 2 points each with no ceiling, so a rich card making fifteen accurate
// statements plus two the critic couldn't cite scored the same as a card that was simply wrong.
// A long, detailed card was structurally penalized for being long and detailed. Now the ceiling on
// each defect class means a card's score reflects the WORST thing found in it, not the length of
// the list, and a claim's price depends on whether a caller could act on it.
export const WEIGHTS = {
  contradicted: { each: 1.5, cap: 3, label: "contradicts the source" },
  unsupported_material: { each: 1, cap: 2.5, label: "a figure or rule your document doesn't state" },
  unsupported_soft: { each: 0.5, cap: 1, label: "wording your document doesn't support" },
  omission: { each: 0.5, cap: 1.5, label: "fact from the source left out" },
  answers_the_question: { flat: 2, label: "the answer doesn't answer the question" },
  question_is_askable: { flat: 0.5, label: "the question isn't how a member would ask it" },
  speakable: { flat: 0.5, label: "doesn't read cleanly aloud" },
  gaps_flagged: { flat: 0.5, label: "a gap in the source isn't noted for routing" },
  bloat: { flat: 0.5, label: "padded beyond what the source supports" },
  notes_misused: { flat: 0.5, label: "a note states a plan fact instead of a gap" },
};

// Above this, a card needs no edit before it goes to Robin. Below it, a human looks.
export const CLEAN_MIN = 4.5;

const round1 = (n) => Math.round(n * 10) / 10;
const trim = (s) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > 140 ? t.slice(0, 137) + "…" : t; };

// Turn one critic result into { score, issues, counts, deductions, claims, omissions }.
// Pure and unit-testable. Pass `rawText` to verify the critic's quotes against the real source —
// without it the model's verdicts are taken at face value, which is only right in tests.
export function scoreReview(v, rawText = null) {
  const claims = verifyClaims(v?.claims, rawText);
  const omissions = verifyOmissions(v?.omissions, rawText);

  const contradicted = claims.filter((c) => c.resolved === "contradicted");
  const unsupported = claims.filter((c) => c.resolved === "unsupported");
  const unverified = claims.filter((c) => c.resolved === "unverified");
  const supported = claims.filter((c) => c.resolved === "supported");
  const hardMissing = omissions.filter((o) => o.counts);

  // A claim with no explicit materiality is treated as material — the safe default when the
  // grader didn't say, since the expensive mistake is waving through a wrong figure.
  const material = (c) => c.material !== false;
  const unsupportedMaterial = unsupported.filter(material);
  const unsupportedSoft = unsupported.filter((c) => !material(c));

  const deductions = [];
  const take = (n, w) => {
    if (!n) return;
    const points = Math.min(n * w.each, w.cap);
    deductions.push({ label: w.label, count: n, points: round1(points), capped: n * w.each > w.cap });
  };
  take(contradicted.length, WEIGHTS.contradicted);
  take(unsupportedMaterial.length, WEIGHTS.unsupported_material);
  take(unsupportedSoft.length, WEIGHTS.unsupported_soft);
  take(hardMissing.length, WEIGHTS.omission);

  // Booleans. Read both the current names and the pre-Q/A/Q/N ones so an older cached run scores.
  const style = [];
  const deduct = (w) => { deductions.push({ label: w.label, count: 1, points: w.flat }); style.push(w.label); };
  const failed = (val, w) => { if (val === false) deduct(w); };   // "did it pass?" booleans
  const tripped = (val, w) => { if (val === true) deduct(w); };   // "did it go wrong?" booleans
  failed(v?.answers_the_question ?? v?.answers_the_title, WEIGHTS.answers_the_question);
  failed(v?.question_is_askable ?? v?.title_is_askable, WEIGHTS.question_is_askable);
  failed(v?.speakable, WEIGHTS.speakable);
  failed(v?.gaps_flagged ?? v?.coverage_complete, WEIGHTS.gaps_flagged);
  tripped(v?.bloat, WEIGHTS.bloat);
  tripped(v?.notes_misused, WEIGHTS.notes_misused);

  const lost = deductions.reduce((s, d) => s + d.points, 0);
  const score = round1(Math.max(1, Math.min(5, 5 - lost)));

  // Reviewer-facing lines. Everything that cost a point appears here, evidence first, so a card
  // can never sit at a high score with an unexplained deduction hiding behind it — the triage
  // buckets key on this list being empty.
  const issues = [];
  for (const c of contradicted) issues.push(`Contradicts the source: ${c.claim}${c.source_quote ? ` — source says: “${trim(c.source_quote)}”` : ""}`);
  for (const c of unsupportedMaterial) issues.push(`Not in the source: ${c.claim}`);
  for (const c of unsupportedSoft) issues.push(`Wording the source doesn't support: ${c.claim}`);
  for (const o of hardMissing) issues.push(`Left out: ${o.missing}`);
  for (const s of style) issues.push(s.charAt(0).toUpperCase() + s.slice(1));
  const checks = unverified.map((c) => `Check by hand: ${c.claim} — ${c.verify_note}`);
  for (const n of Array.isArray(v?.notes) ? v.notes : []) if (!issues.includes(n)) issues.push(n);

  return {
    score,
    issues,
    checks,
    claims,
    omissions,
    counts: {
      claims: claims.length,
      supported: supported.length,
      unsupported: unsupported.length,
      unverified: unverified.length,
      contradicted: contradicted.length,
      omissions: hardMissing.length,
      omissions_unverified: omissions.length - hardMissing.length,
    },
    deductions,
  };
}

// One critic call for ONE card. The raw source is a cached system block, so fanning out over
// N cards re-sends the card only — grading each one alone stops the batch effect where a single
// call spreads its attention across ten cards and settles on one uniform verdict.
async function critiqueOne(r, rawText) {
  // Grade the RENDERED text, parsed back into sections. The reviewer edits that text, so it's the
  // thing that has to be true — and the section labels are what let the critic leave notes alone.
  const sectioned = articleForCritic(parseArticle(r.md, r.article || { slug: r.slug }));
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: CRITIC_SCHEMA } },
    system: [
      { type: "text", text: CRITIC_SYSTEM },
      { type: "text", text: `RAW SOURCE (ground truth):\n"""\n${rawText}\n"""`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `CARD TO VERIFY (slug: ${r.slug}):\n"""\n${sectioned}\n"""\n\nVerify it against the raw source per your instructions. Return ONLY the structured JSON.` }],
  }, { timeout: 120000 });
  const text = res.content.find((b) => b.type === "text");
  if (!text) throw new Error("critic returned no text block");
  const v = JSON.parse(text.text);
  return { slug: r.slug, ...v, ...scoreReview(v, rawText) };
}

// LLM critic, one call per card. `rendered` is [{slug, md}].
// The first card runs alone so it writes the source into the prompt cache; the rest fan out
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
