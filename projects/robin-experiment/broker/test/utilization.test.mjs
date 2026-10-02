// Utilization: sections come from the attached documents' H2 headings, "used" means a graded answer
// cited a verbatim span inside the section. The fixtures are condensed copies of Robin's real Loans and
// Rolling documents and real quotes from graded calls, so the matching is tested on the shapes that
// actually occur: markdown with ** emphasis, an HTML-extracted document, a quote with an ellipsis, a
// quote that appears in no document. Nothing here touches the network.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText } from "../lib/kb-text.js";
import { norm, splitSections, fragmentsOf, compute, previewOf, retrievalByDocument } from "../lib/utilization.js";

const LOANS_MD = `# Vertex Manufacturing 401(k) — Loans From Your Account

Preamble that is not a topic.

## Can I take a loan against my 401(k)?

**Yes — the Vertex plan allows participant loans.** You borrow from your own vested balance and pay yourself back, with interest, through payroll deductions.

## How much you can borrow

**Minimum:** $1,000.

**Maximum:** the **lesser of $50,000 or 50% of your vested account balance**

## Terms and cost

**Repayment term:** up to **5 years** (up to **15 years** if the loan is to buy your primary residence).

**Fees:** a **$75 origination fee** and a **$25/year maintenance fee**, deducted from your account.

## Paying a loan off early

**You can repay a loan early at any time, in full, with no prepayment penalty.**

## How to request a loan

Model and request a loan on the portal at **nesteggu.com** (Loans → Request a Loan), or ask an agent to transfer you to a specialist. You'll see the amount available to you, the payment schedule, and the rate before you confirm.

## Common questions

*Can I have two loans?* No — one at a time on this plan.
`;

const ROLLING_HTML = `<html><body><h1>Rolling Money Into the Plan</h1><p><i>Knowledge-base article.</i></p>
<h2>What the plan accepts</h2><p><b>Prior employer plans:</b> 401(k), 403(b), and governmental 457(b).</p><p><b>Traditional IRAs</b> (pre-tax).</p>
<h2>Good to know</h2><p>Rolled-in money is <b>always 100% yours</b> (roll-in balances are fully vested).</p>
<h2>Common questions</h2><p><i>How long does it take?</i> Usually 1–3 weeks, depending on your old provider.</p></body></html>`;

const DOCS = [
  { id: "loans", name: "Vertex 401(k) — Loans", usage_mode: "auto", body: LOANS_MD },
  { id: "roll", name: "Vertex 401(k) — Rolling", usage_mode: "auto", body: htmlToText(ROLLING_HTML, { headings: true }) },
  { id: "portal", name: "Online Portal", usage_mode: "prompt", body: "## Portal\nAlways in the prompt." },
];

test("sections are the H2 headings; the title and preamble are not topics", () => {
  const s = splitSections(LOANS_MD);
  assert.deepEqual(s.map((x) => x.title), ["Can I take a loan against my 401(k)?", "How much you can borrow", "Terms and cost", "Paying a loan off early", "How to request a loan", "Common questions"]);
});

test("headings survive text extraction from an HTML document only when asked", () => {
  assert.deepEqual(splitSections(htmlToText(ROLLING_HTML, { headings: true })).map((x) => x.title), ["What the plan accepts", "Good to know", "Common questions"]);
  assert.equal(splitSections(htmlToText(ROLLING_HTML)).length, 0, "plain extraction is unchanged");
});

test("a verbatim quote lands in its section, through markdown emphasis and spacing", () => {
  const r = compute({ docs: DOCS, interactions: 10, graded: 4, days: 30, quotes: [
    "Maximum: the lesser of $50,000 or 50% of your vested account balance",           // emphasis stripped by the grader
    "Repayment term: up to 5 years (up to 15 years if the loan is to buy your primary residence).",
    "Rolled-in money is always 100% yours (roll-in balances are fully vested).",
  ] });
  const loans = r.documents.find((d) => d.id === "loans");
  assert.deepEqual(loans.sections.filter((s) => s.used).map((s) => s.title), ["How much you can borrow", "Terms and cost"]);
  assert.equal(r.documents.find((d) => d.id === "roll").sections.find((s) => s.title === "Good to know").used, true);
});

test("a quote with an ellipsis is matched fragment by fragment", () => {
  const r = compute({ docs: DOCS, interactions: 1, graded: 1, quotes: [
    "Model and request a loan on the portal at nesteggu.com (Loans → Request a Loan)... You'll see the amount available to you, the payment schedule, and the rate before you confirm.",
  ] });
  assert.equal(r.documents[0].sections.find((s) => s.title === "How to request a loan").used, true);
});

test("a quote found in no document is counted as unmatched, not guessed into a section", () => {
  const r = compute({ docs: DOCS, interactions: 1, graded: 1, quotes: ["A sentence that no attached document contains at all."] });
  assert.equal(r.used, 0); assert.equal(r.unmatched_quotes, 1);
});

test("a very short fragment cannot match by accident", () => {
  assert.deepEqual(fragmentsOf("$1,000."), []);
  const r = compute({ docs: DOCS, interactions: 1, graded: 1, quotes: ["$1,000."] });
  assert.equal(r.used, 0);
});

test("documents that live in her prompt are not retrieved topics and stay out of the denominator", () => {
  const r = compute({ docs: DOCS, interactions: 1, graded: 1, quotes: [] });
  assert.deepEqual(r.documents.map((d) => d.id), ["loans", "roll"]);
  assert.equal(r.total, 6 + 3);
});

test("the number, the coverage and the never-used list agree with each other", () => {
  const r = compute({ docs: DOCS, interactions: 170, graded: 41, days: 30, quotes: [
    "the lesser of $50,000 or 50% of your vested account balance", "Prior employer plans: 401(k), 403(b), and governmental 457(b).",
  ] });
  assert.equal(r.used, 2); assert.equal(r.total, 9);
  assert.equal(r.never_used.length, r.total - r.used);
  assert.ok(Math.abs(r.pct - 2 / 9) < 1e-9);
  assert.ok(Math.abs(r.coverage - 41 / 170) < 1e-9, "coverage is graded over all interactions in the window");
  assert.ok(r.never_used.every((n) => n.document && n.title));
});

test("questions nothing answered are grouped by topic and ranked", () => {
  const unmet = [
    { canonical_key: "loan-on-leave", canonical_question: "How is a loan repaid on unpaid leave?", fail_reason: "no_content" },
    { canonical_key: "loan-on-leave", canonical_question: "How is a loan repaid on unpaid leave?", fail_reason: "no_content" },
    { canonical_key: "roth-loan", canonical_question: "Can I borrow against Roth money?", fail_reason: "no_content" },
  ];
  const r = compute({ docs: DOCS, interactions: 1, graded: 1, quotes: [], unmet });
  assert.deepEqual(r.unmet.map((u) => [u.question, u.count]), [["How is a loan repaid on unpaid leave?", 2], ["Can I borrow against Roth money?", 1]]);
});

test("norm treats markdown and case as noise but keeps the document's own dashes", () => {
  assert.equal(norm("**Yes — the Vertex plan** allows loans"), "yes — the vertex plan allows loans");
});

// ---- detail, honest coverage, and retrieval records ------------------------------------------------------
test("a section carries a preview and the questions whose answers cited it", () => {
  const docs = [{ id: "d1", name: "Loans", usage_mode: "auto", body: LOANS_MD }];
  const r = compute({
    docs, interactions: 10, graded: 4, measured: 2, unmeasurable: 2,
    quotes: [
      { quote: "the lesser of $50,000 or 50% of your vested account balance", question: "How much can I borrow?" },
      { quote: "lesser of $50,000 or 50% of your vested account balance", question: "How much can I borrow?" },
      { quote: "the lesser of $50,000 or 50% of your vested account balance", question: "Can I borrow half my balance?" },
    ],
  });
  const s = r.documents[0].sections.find((x) => x.title === "How much you can borrow");
  assert.equal(s.count, 3);
  assert.deepEqual(s.questions, ["How much can I borrow?", "Can I borrow half my balance?"], "each question once");
  assert.match(s.preview, /^Minimum: \$1,000\./);
  const unused = r.documents[0].sections.find((x) => !x.used);
  assert.ok(unused.preview.length > 0 && unused.questions.length === 0);
});

test("coverage counts interactions measured against a source, not interactions merely stamped graded", () => {
  const docs = [{ id: "d1", name: "Loans", usage_mode: "auto", body: LOANS_MD }];
  const r = compute({ docs, quotes: [], interactions: 100, graded: 80, measured: 15, unmeasurable: 65 });
  assert.equal(r.graded, 80); assert.equal(r.measured, 15); assert.equal(r.unmeasurable, 65);
  assert.equal(r.coverage, 0.15);
  // a caller that passes only `graded` (the old shape) is unchanged
  assert.equal(compute({ docs, quotes: [], interactions: 100, graded: 40 }).coverage, 0.4);
});

test("previewOf strips markup, collapses spacing and trims on a word", () => {
  assert.equal(previewOf("**Bold** and <b>html</b>\n\nline"), "Bold and html line");
  const long = previewOf("word ".repeat(100), 30);
  assert.ok(long.endsWith("…") && long.length <= 31 && !/\swo…$/.test(long));
});

test("read-in and used-in count interactions once per document, with used resolved through the chunk", () => {
  const turn = (chunks, used = []) => ({ rag_retrieval_info: { chunks: chunks.map(([c, d]) => ({ chunk_id: c, document_id: d })), used_chunk_ids: used } });
  const t1 = [turn([["c1", "A"], ["c2", "B"]], ["c1"]), turn([["c3", "A"]], [])]; // A read twice but one interaction
  const t2 = [turn([["c4", "B"]], ["c4"])];
  const t3 = [{ role: "user", message: "hi" }, { rag_retrieval_info: null }];
  const m = retrievalByDocument([t1, t2, t3, null]);
  assert.deepEqual(m.get("A"), { read_in: 1, used_in: 1 });
  assert.deepEqual(m.get("B"), { read_in: 2, used_in: 1 });
  assert.equal(m.get("C"), undefined);
});

test("compute attaches read_in and used_in to each document, zero when there are no records", () => {
  const docs = [{ id: "A", name: "Loans", usage_mode: "auto", body: LOANS_MD }, { id: "B", name: "Other", usage_mode: "auto", body: "# T\n\n## S\n\ntext here" }];
  const r = compute({ docs, quotes: [], interactions: 2, graded: 0, retrieval: new Map([["A", { read_in: 5, used_in: 2 }]]) });
  assert.deepEqual([r.documents[0].read_in, r.documents[0].used_in, r.documents[1].read_in, r.documents[1].used_in], [5, 2, 0, 0]);
});
