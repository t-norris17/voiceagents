// Calibration harness — answers "is the grader actually strict, or is it just being nice?"
//
// Feeds the live critic a synthetic source plus a set of articles with KNOWN, planted defects,
// and reports what it caught. A grader that scores the sabotaged articles 5/5 is broken; a
// grader that scores the clean one below 5 is over-tuned. Run it after any change to
// CRITIC_SYSTEM or the score weights.
//
//   ANTHROPIC_API_KEY=... node test/critic-calibration.mjs
//
// Not part of `node --test` — it costs money and needs a key. Everything here is invented:
// fictional plan, fictional recordkeeper, no real member data. Exit code 1 if any case misses.
import { critique } from "../lib/validate.js";

// ---- the synthetic ground truth every article is graded against ----
const SOURCE = `
MERIDIAN SAMPLE 401(k) PLAN — PARTICIPANT GUIDE (fictional, for testing)

LOANS
Participants may borrow from their vested account balance. The minimum loan is $1,000. The maximum
is the lesser of $50,000 or 50% of your vested balance. A $75 loan setup fee is deducted from the
loan proceeds. Only one loan may be outstanding at a time. Loans are repaid by payroll deduction.
If you leave the company with an outstanding loan, the remaining balance must be repaid within 90
days or it is treated as a taxable distribution.

ENROLLMENT
New employees are automatically enrolled at 4% of pay beginning with the first payroll after 30
days of service. The rate increases by 1% each January until it reaches 10%. You may opt out at any
time by contacting the recordkeeper at 800-555-0142.

EMPLOYER CONTRIBUTIONS
The company matches 50% of the first 6% of pay you contribute. Match contributions vest after two
years of service.
`.trim();

// ---- articles with planted defects. `expect` says what the grader MUST notice. ----
const CASES = [
  {
    name: "clean",
    plant: "nothing — this one is faithful",
    expect: { maxScore: 5, minScore: 4, mustFind: [] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars, and
the most you can borrow is fifty thousand dollars or half of your vested balance, whichever is less.
A seventy-five dollar setup fee comes out of the loan proceeds. You can only have one loan out at a
time, and you repay it through payroll deduction.

If you leave the company while you still owe on a loan, you have ninety days to repay the balance.
If you don't, the remaining amount is treated as a taxable distribution.`,
  },
  {
    name: "invented-figure",
    plant: "setup fee changed from $75 to $100 — contradicts the source",
    expect: { maxScore: 3, mustFind: ["contradicted"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars, and
the most you can borrow is fifty thousand dollars or half of your vested balance, whichever is less.
A one hundred dollar setup fee comes out of the loan proceeds. You can only have one loan out at a
time, and you repay it through payroll deduction.`,
  },
  {
    name: "unsupported-term",
    plant: "adds a five-year repayment term the source never states",
    expect: { maxScore: 4, mustFind: ["unsupported"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance, up to fifty thousand dollars or half your
vested balance, whichever is less. You repay it through payroll deduction over up to five years.
A seventy-five dollar setup fee comes out of the loan proceeds.`,
  },
  {
    name: "omission",
    plant: "drops the 90-day post-employment repayment rule — accurate but incomplete",
    expect: { maxScore: 4, mustFind: ["omission"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars and
the largest is fifty thousand dollars or half your vested balance, whichever is less. There's a
seventy-five dollar setup fee, you can only have one loan at a time, and you repay it by payroll
deduction.`,
  },
  {
    name: "hedged-rule",
    plant: "softens an absolute rule ('generally only one loan') — drift, not a hard error",
    expect: { maxScore: 4, mustFind: ["unsupported", "note"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can generally borrow from your vested account balance, and you can usually only have one
loan outstanding at a time. The minimum is one thousand dollars and the maximum is typically fifty
thousand dollars or half your vested balance. A seventy-five dollar setup fee applies.`,
  },
  {
    name: "unaskable-title",
    plant: "internal-jargon title instead of the participant's question",
    expect: { maxScore: 4, mustFind: ["title"] },
    md: `Loan Provisions — Section 4.2

Participants may borrow from the vested account balance. The minimum loan is one thousand dollars.
The maximum is fifty thousand dollars or fifty percent of the vested balance, whichever is less.
A seventy-five dollar setup fee applies and only one loan may be outstanding.`,
  },
  {
    name: "wrong-topic",
    plant: "title asks about the match; the body answers about enrollment",
    expect: { maxScore: 3, mustFind: ["answers_the_title"] },
    md: `Does my employer match what I contribute?

New employees are automatically enrolled at four percent of pay, starting with the first payroll
after thirty days of service. The rate goes up by one percent each January until it reaches ten
percent. You can opt out at any time by calling the recordkeeper at 800-555-0142.`,
  },
];

const found = (r) => ({
  contradicted: r.counts.contradicted > 0,
  unsupported: r.counts.unsupported > 0,
  omission: r.counts.omissions > 0,
  note: (r.notes || []).length > 0,
  title: r.title_is_askable === false,
  answers_the_title: r.answers_the_title === false,
});

const reviews = await critique(CASES.map((c, i) => ({ slug: String(i), md: c.md })), SOURCE);

let failures = 0;
console.log("\ncase                 score  claims  ✕contra  ○unsup  –omit  verdict");
console.log("─".repeat(78));
for (const [i, c] of CASES.entries()) {
  const r = reviews.find((v) => v.slug === String(i));
  if (!r) { console.log(`${c.name.padEnd(20)} —      (critic returned nothing)`); failures++; continue; }
  const f = found(r);
  const missed = (c.expect.mustFind || []).filter((k) => !f[k]);
  const tooHigh = r.score > (c.expect.maxScore ?? 5);
  const tooLow = c.expect.minScore != null && r.score < c.expect.minScore;
  const ok = !missed.length && !tooHigh && !tooLow;
  if (!ok) failures++;
  const n = r.counts;
  console.log(
    `${c.name.padEnd(20)} ${String(r.score).padStart(3)}/5 ${String(n.claims).padStart(6)} ` +
    `${String(n.contradicted).padStart(7)} ${String(n.unsupported).padStart(7)} ${String(n.omissions).padStart(6)}  ` +
    (ok ? "PASS" : `MISS — ${[
      tooHigh ? `scored ${r.score}, expected ≤${c.expect.maxScore}` : null,
      tooLow ? `scored ${r.score}, expected ≥${c.expect.minScore}` : null,
      missed.length ? `didn't flag ${missed.join("/")}` : null,
    ].filter(Boolean).join("; ")}`)
  );
  if (!ok || process.env.VERBOSE) {
    console.log(`  planted: ${c.plant}`);
    for (const line of r.issues) console.log(`  · ${line}`);
  }
}
console.log("─".repeat(78));
const avg = reviews.reduce((s, r) => s + r.score, 0) / (reviews.length || 1);
console.log(`${CASES.length - failures}/${CASES.length} cases behaved as expected · average score ${avg.toFixed(2)}/5`);
console.log(
  avg > 4.5
    ? "\n⚠ Average is still high across deliberately broken articles — the grader is being generous.\n"
    : "\n"
);
process.exit(failures ? 1 : 0);
