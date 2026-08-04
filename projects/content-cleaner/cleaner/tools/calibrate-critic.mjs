// Calibration harness — answers "is the grader actually strict, or is it just being nice?" and,
// since the run that scored most real cards 2/5, the opposite question too: "is it punishing cards
// for things they got right?"
//
// Feeds the live critic a synthetic source plus a set of cards with KNOWN, planted defects, and
// reports what it caught. A grader that scores the sabotaged cards 5/5 is broken; a grader that
// marks the faithful ones down is over-tuned, and over-tuned is not the safe direction — a reviewer
// who stops believing the score stops reading it. Run this after any change to CRITIC_SYSTEM or the
// score weights.
//
//   ANTHROPIC_API_KEY=... npm run calibrate      (or: node tools/calibrate-critic.mjs)
//
// Lives outside test/ on purpose: `node --test` treats every file under test/ as a test,
// and this one costs money and needs a key. Everything here is invented:
// fictional plan, fictional recordkeeper, no real member data. Exit code 1 if any case misses.
import { critique } from "../lib/validate.js";

// ---- the synthetic ground truth every card is graded against ----
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

ELIGIBILITY
The plan may set an age and service condition before you become a participant, subject to legal
limits on how strict those conditions can be.
`.trim();

// ---- cards with planted defects. `expect` says what the grader MUST notice — and, for the
// faithful ones, what it MUST NOT invent. ----
const CASES = [
  {
    name: "clean",
    plant: "nothing — this one is faithful",
    expect: { maxScore: 5, minScore: 4.5, mustFind: [] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars, and
the most you can borrow is fifty thousand dollars or half of your vested balance, whichever is less.
A seventy-five dollar setup fee comes out of the loan proceeds. You repay it through payroll
deduction.

Qualifiers
- If you already have a loan outstanding, you can't take another one until it's paid off.
- If you leave the company while you still owe on a loan, you have ninety days to repay the balance, or the remaining amount is treated as a taxable distribution.`,
  },
  {
    // THE REGRESSION CASE. A card that honestly says what its source doesn't settle used to be
    // charged for it: the routing sentence sat in the body, the critic read it as a claim about
    // the plan, found no supporting quote, and took two points off — on every card carrying a
    // coverage flag. Notes are now a separate, explicitly un-fact-checked section. This card is
    // faithful AND honest about its gaps, and must score like it.
    name: "honest-gap",
    plant: "nothing — but it declares two gaps in Notes, which used to cost it points",
    expect: { maxScore: 5, minScore: 4.5, mustFind: [], mustNotFind: ["unsupported", "contradicted"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars, and
the most you can borrow is fifty thousand dollars or half of your vested balance, whichever is less.
A seventy-five dollar setup fee comes out of the loan proceeds, and you repay through payroll
deduction.

Qualifiers
- If you already have a loan outstanding, you can't take another one until it's paid off.

Notes
- The document doesn't state how long you have to repay a loan while you're still employed — route to a specialist.
- The document doesn't say whether a loan can be paid off early — route to a specialist.
- If a caller needs more than this card settles, offer to connect them with a specialist rather than guess.`,
  },
  {
    name: "invented-figure",
    plant: "setup fee changed from $75 to $100 — contradicts the source",
    expect: { maxScore: 4, mustFind: ["contradicted"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars, and
the most you can borrow is fifty thousand dollars or half of your vested balance, whichever is less.
A one hundred dollar setup fee comes out of the loan proceeds. You can only have one loan out at a
time, and you repay it through payroll deduction.`,
  },
  {
    name: "unsupported-term",
    plant: "adds a five-year repayment term the source never states",
    expect: { maxScore: 4.5, mustFind: ["unsupported"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance, up to fifty thousand dollars or half your
vested balance, whichever is less. You repay it through payroll deduction over up to five years.
A seventy-five dollar setup fee comes out of the loan proceeds.`,
  },
  {
    name: "omission",
    plant: "drops the 90-day post-employment repayment rule — accurate but incomplete",
    expect: { maxScore: 4.5, mustFind: ["omission"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can borrow from your vested account balance. The smallest loan is one thousand dollars and
the largest is fifty thousand dollars or half your vested balance, whichever is less. There's a
seventy-five dollar setup fee, you can only have one loan at a time, and you repay it by payroll
deduction.`,
  },
  {
    name: "hedged-rule",
    plant: "softens absolute rules ('generally', 'usually', 'typically') — drift, not a hard error",
    expect: { maxScore: 4.5, mustFind: ["unsupported", "note"] },
    md: `Can I take a loan from my 401(k)?

Yes. You can generally borrow from your vested account balance, and you can usually only have one
loan outstanding at a time. The minimum is one thousand dollars and the maximum is typically fifty
thousand dollars or half your vested balance. A seventy-five dollar setup fee applies.`,
  },
  {
    name: "unaskable-question",
    plant: "internal-jargon question line instead of what a member would ask",
    expect: { maxScore: 4.5, mustFind: ["askable"] },
    md: `Loan Provisions — Section 4.2

Participants may borrow from the vested account balance. The minimum loan is one thousand dollars.
The maximum is fifty thousand dollars or fifty percent of the vested balance, whichever is less.
A seventy-five dollar setup fee applies and only one loan may be outstanding.`,
  },
  {
    // A real one: a card scored 2/5 because its closing recap both padded the article and
    // sharpened "legal limits" into "federal limits". Two defects, one deletable paragraph.
    name: "closing-recap",
    plant: "adds a summary paragraph that restates the card and sharpens 'legal' into 'federal'",
    expect: { maxScore: 4.5, mustFind: ["unsupported", "bloat"] },
    md: `How old do I have to be and how long do I have to work before I can join the plan?

The plan can set an age requirement and a service requirement before you become a participant, but
there are legal limits on how strict those can be.

Your employer chooses the exact age and service conditions in its plan paperwork. To find out the
specific rules your employer selected, check with your plan administrator.

Federal rules set maximum limits on the age and service conditions a 401(k) plan may impose, while
employers select the specific conditions within those limits in their plan documents.`,
  },
  {
    name: "wrong-topic",
    plant: "question asks about the match; the answer is about enrollment",
    expect: { maxScore: 3.5, mustFind: ["answers_the_question"] },
    md: `Does my employer match what I contribute?

New employees are automatically enrolled at four percent of pay, starting with the first payroll
after thirty days of service. The rate goes up by one percent each January until it reaches ten
percent. You can opt out at any time by calling the recordkeeper at 800-555-0142.`,
  },
  {
    name: "fact-in-notes",
    plant: "a plan fact smuggled into Notes, where it escapes fact-checking",
    expect: { maxScore: 4.5, mustFind: ["notes_misused"] },
    md: `Does my employer match what I contribute?

Yes. The company matches fifty percent of the first six percent of pay you contribute.

Notes
- Match contributions vest immediately with no service requirement.
- If a caller needs more than this card settles, offer to connect them with a specialist rather than guess.`,
  },
];

// What the grader actually reported, keyed to the names used in `expect`.
const found = (r) => ({
  contradicted: r.counts.contradicted > 0,
  unsupported: r.counts.unsupported > 0,
  omission: r.counts.omissions > 0,
  note: (r.notes || []).length > 0,
  askable: r.question_is_askable === false,
  answers_the_question: r.answers_the_question === false,
  bloat: r.bloat === true,
  notes_misused: r.notes_misused === true,
});

const reviews = await critique(CASES.map((c, i) => ({ slug: String(i), md: c.md })), SOURCE);

let failures = 0;
console.log("\ncase                 score  claims  ✕contra  ○unsup  ?check  –omit  verdict");
console.log("─".repeat(88));
for (const [i, c] of CASES.entries()) {
  const r = reviews.find((v) => v.slug === String(i));
  if (!r) { console.log(`${c.name.padEnd(20)} —      (critic returned nothing)`); failures++; continue; }
  const f = found(r);
  const missed = (c.expect.mustFind || []).filter((k) => !f[k]);
  const invented = (c.expect.mustNotFind || []).filter((k) => f[k]);
  const tooHigh = r.score > (c.expect.maxScore ?? 5);
  const tooLow = c.expect.minScore != null && r.score < c.expect.minScore;
  const ok = !missed.length && !invented.length && !tooHigh && !tooLow;
  if (!ok) failures++;
  const n = r.counts;
  console.log(
    `${c.name.padEnd(20)} ${String(r.score).padStart(4)}/5 ${String(n.claims).padStart(6)} ` +
    `${String(n.contradicted).padStart(7)} ${String(n.unsupported).padStart(7)} ${String(n.unverified).padStart(6)} ` +
    `${String(n.omissions).padStart(6)}  ` +
    (ok ? "PASS" : `MISS — ${[
      tooHigh ? `scored ${r.score}, expected ≤${c.expect.maxScore}` : null,
      tooLow ? `scored ${r.score}, expected ≥${c.expect.minScore} — the grader is marking down a faithful card` : null,
      missed.length ? `didn't flag ${missed.join("/")}` : null,
      invented.length ? `invented a defect: ${invented.join("/")}` : null,
    ].filter(Boolean).join("; ")}`)
  );
  if (!ok || process.env.VERBOSE) {
    console.log(`  planted: ${c.plant}`);
    for (const line of r.issues) console.log(`  · ${line}`);
    for (const line of r.checks || []) console.log(`  ? ${line}`);
  }
}
console.log("─".repeat(88));

// Both tails matter. The faithful cards and the broken ones are reported separately, because one
// average hides the failure mode we actually hit: broken cards caught, faithful cards punished.
const scoreOf = (i) => reviews.find((v) => v.slug === String(i))?.score ?? 0;
const faithful = CASES.map((c, i) => [c, i]).filter(([c]) => !(c.expect.mustFind || []).length);
const broken = CASES.map((c, i) => [c, i]).filter(([c]) => (c.expect.mustFind || []).length);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const faithfulAvg = mean(faithful.map(([, i]) => scoreOf(i)));
const brokenAvg = mean(broken.map(([, i]) => scoreOf(i)));

console.log(`${CASES.length - failures}/${CASES.length} cases behaved as expected`);
console.log(`  faithful cards: ${faithfulAvg.toFixed(2)}/5 (want ≥ 4.50)   ·   sabotaged cards: ${brokenAvg.toFixed(2)}/5 (want ≤ 4.00)`);
const warn = [];
if (brokenAvg > 4.0) warn.push("⚠ Sabotaged cards are still scoring high — the grader is being generous.");
if (faithfulAvg < 4.5) warn.push("⚠ Faithful cards are being marked down — the grader is over-tuned, which is how a run ends up all 2s and 3s.");
console.log(warn.length ? "\n" + warn.join("\n") + "\n" : "\n");
process.exit(failures ? 1 : 0);
