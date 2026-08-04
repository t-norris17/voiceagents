// Tests for the deterministic safety guards and the card formatter — the layers that must NOT
// depend on model judgment. Run: `node --test`. No API key needed (the LLM critic isn't exercised).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deterministicScan } from "../lib/validate.js";
import { articleToMarkdown, parseArticle, articleForCritic, normalizeArticle } from "../lib/kcs.js";

const kinds = (findings) => findings.map((f) => f.kind);
const hasFatal = (findings) => findings.some((f) => f.severity === "fatal");

// A minimal well-formed card, rendered. The guards read the four sections back out of this text,
// so tests that aren't about structure start from something structurally valid.
const card = (answer, { qualifiers = [], notes = [] } = {}) =>
  articleToMarkdown({ slug: "t", question: "Can I take a loan from my 401(k)?", answer, qualifiers, notes, environment: "Test Plan" });

// --- PII: the hard-fail red line ---
test("SSN-shaped number is a FATAL finding (hyphenated)", () => {
  const f = deterministicScan(card("Your number on file is 123-45-6789."), null);
  assert.ok(hasFatal(f), "expected a fatal finding");
  assert.ok(kinds(f).includes("pii-ssn"));
});

test("SSN-shaped number is FATAL with spaces and with no separators", () => {
  assert.ok(hasFatal(deterministicScan(card("It is 123 45 6789."), null)));
  assert.ok(hasFatal(deterministicScan(card("SSN 123456789 here."), null)));
});

test("'social security number' next to digits is FATAL", () => {
  const f = deterministicScan(card("Enter your social security number, then press 1."), null);
  assert.ok(hasFatal(f));
  assert.ok(kinds(f).includes("pii-ssn-words"));
});

test("clean plan phone number (866-412-9026) is NOT flagged as PII", () => {
  const f = deterministicScan(card("Call 866-412-9026 for help."), null);
  assert.equal(hasFatal(f), false, "a hyphenated phone number must not read as an SSN");
});

// --- voice-RAG warnings (review, not fail) ---
test("cross-reference is a warn", () => {
  const f = deterministicScan(card("As noted in the section above, you can defer 6%."), null);
  assert.ok(kinds(f).includes("cross-reference"));
  assert.equal(hasFatal(f), false);
});

test("UI gesture (click the gear icon) is a warn", () => {
  assert.ok(kinds(deterministicScan(card("To update, click the gear icon and choose Beneficiaries."), null)).includes("ui-gesture"));
});

test("markdown table is a warn", () => {
  assert.ok(kinds(deterministicScan(card("Fees:\n\n| Fund | ER |\n|---|---|\n| A | 0.04% |"), null)).includes("table"));
});

test("bare 10-digit phone run is a warn", () => {
  assert.ok(kinds(deterministicScan(card("Call 8664129026 now."), null)).includes("bare-phone"));
});

test("an over-long answer is a warn (just-enough)", () => {
  assert.ok(kinds(deterministicScan(card("a".repeat(2700)), null)).includes("length"));
});

test("a card with no answer under its question is a structural warn", () => {
  assert.ok(kinds(deterministicScan("Can I take a loan?\n", null)).includes("structure"));
});

test("a card with nothing in Notes is NOT a finding — some sources settle the question", () => {
  // Deliberate change: an empty Notes section used to warn. But a card whose source genuinely
  // answers the question end to end has nothing to note, and warning on it trained the reviewer
  // to ignore the warning. Whether a real gap went unflagged is the critic's judgment, not code's.
  const f = deterministicScan(card("Yes, the plan allows loans. Want me to walk you through how it works?"), null);
  assert.equal(f.length, 0, `expected no findings, got: ${JSON.stringify(f)}`);
});

test("a clean, self-contained card produces NO findings", () => {
  const md = card("Yes, the plan allows loans. Want me to walk you through how it works?", {
    qualifiers: [{ when: "you already have a loan outstanding", then: "you can't take another one" }],
    notes: ["The document doesn't state the repayment term — route to a specialist."],
  });
  assert.equal(deterministicScan(md, null).length, 0, `expected no findings, got: ${JSON.stringify(deterministicScan(md, null))}`);
});

// --- formatter: card -> Robin-ready plain text ---
test("articleToMarkdown renders the four sections, and omits the empty ones", () => {
  const md = articleToMarkdown({
    environment: "INTRUST 401(k) Plan",
    question: "Can I take a loan from my 401(k)?",
    answer: "Yes, the plan allows loans.",
    qualifiers: [{ when: "you're no longer employed here", then: "the balance is due within 90 days" }],
    notes: ["The source doesn't give a specific limit."],
  }, { source: "2025 INTRUST Enrollment Packet" });
  assert.match(md, /^Can I take a loan from my 401\(k\)\?/m, "leads with the question, no plan prefix");
  assert.match(md, /Yes, the plan allows loans\./);
  assert.match(md, /^Qualifiers$/m);
  assert.match(md, /If you're no longer employed here, the balance is due within 90 days\./);
  assert.match(md, /^Notes$/m);
  assert.match(md, /The source doesn't give a specific limit\./);
  assert.match(md, /connect them with a specialist/i, "notes carry the standing routing line");
  assert.doesNotMatch(md, /^Plan:/m, "no metadata/plan line in the body");
  assert.doesNotMatch(md, /[#*`]/, "plain text only — no markdown symbols");

  const bare = articleToMarkdown({ question: "How do I sign in?", answer: "Go to the website and choose Register.", qualifiers: [], notes: [] });
  assert.doesNotMatch(bare, /Qualifiers/, "an unconditional answer has no Qualifiers section");
  assert.doesNotMatch(bare, /Notes/, "a fully-covered question has no Notes section");
});

test("the pre-Q/A/Q/N shape still renders, so older rows and cached runs survive", () => {
  const md = articleToMarkdown({
    title: "Can I take a loan from my 401(k)?",
    issue: "Wondering if I can borrow.",
    resolution: "Yes, the plan allows loans.",
    cause: "Loans are a plan feature.",
    coverage_flags: ["No specific limit in the source."],
  }, {});
  assert.match(md, /^Can I take a loan from my 401\(k\)\?/m);
  assert.match(md, /Yes, the plan allows loans\./);
  assert.match(md, /Loans are a plan feature\./, "the legacy 'cause' folds into the answer");
  assert.match(md, /^Notes$/m, "legacy coverage_flags become notes");
});

test("stripMd removes markdown the model may slip in", () => {
  const md = articleToMarkdown({
    question: "How does it work?",
    answer: "# Heading\n\n**Bold answer** with *emphasis* and `code`.\n\n## Next steps\nDo the thing.",
    qualifiers: [], notes: [],
  }, {});
  assert.doesNotMatch(md, /[#*`]/, "no markdown symbols survive");
  assert.match(md, /Bold answer with emphasis and code\./);
  assert.match(md, /^Heading$/m);
  assert.match(md, /^Next steps$/m);
});

// --- the round trip: rendered text -> sections, because the reviewer edits the text ---
test("parseArticle reads the four sections back out of a rendered card", () => {
  const original = { slug: "loans", question: "Can I take a loan?", answer: "Yes.\n\nHow it works\nYou repay by payroll deduction.",
    qualifiers: [{ when: "you already have one out", then: "you have to pay it off first" }],
    notes: ["The document doesn't state the repayment term."] };
  const back = parseArticle(articleToMarkdown(original), { slug: "loans" });
  assert.equal(back.question, "Can I take a loan?");
  assert.match(back.answer, /^Yes\./);
  assert.match(back.answer, /You repay by payroll deduction\./);
  assert.equal(back.qualifiers.length, 1);
  assert.equal(back.notes.length, 1, "the standing routing line is boilerplate, not a note");
  assert.match(back.notes[0], /repayment term/);
});

test("text before any heading is the answer — stray lines never become notes", () => {
  const back = parseArticle("Can I take a loan?\n\nYes, you can.\nHere is how.\n");
  assert.equal(back.answer, "Yes, you can.\nHere is how.");
  assert.deepEqual(back.notes, []);
  assert.deepEqual(back.qualifiers, []);
});

test("the critic's view labels every section and marks notes off-limits", () => {
  const view = articleForCritic(normalizeArticle({
    question: "Can I take a loan?", answer: "Yes.", qualifiers: [], notes: ["The document doesn't state the term."],
  }));
  assert.match(view, /^QUESTION: Can I take a loan\?/m);
  assert.match(view, /^ANSWER:$/m);
  assert.match(view, /^QUALIFIERS:$/m);
  assert.match(view, /\(none\)/, "an empty section says so rather than disappearing");
  assert.match(view, /NOTES \(agent-facing — do NOT fact-check these\):/);
});
