// Pure scoring for the call grader. No SDK, no network, no env — so the weights can be
// unit-tested without an API key, and so the arithmetic is reviewable on its own.
// The grader supplies evidence; this file decides what the evidence costs.

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// One answer -> two scores, deliberately not averaged together.
//
//   accuracy = was what she SAID supported by the documents she actually retrieved?
//   quality  = did she answer what was asked, completely, and hand off when she should have?
//
// They're separate because they fail separately, and the dangerous case is exactly where they
// diverge: a fluent, complete, confident answer containing a figure the plan documents never
// state scores well on quality and badly on accuracy. One blended number hides that call.
//
// `hasSource` false means we could not read any document she retrieved. Accuracy is then null —
// UNKNOWN, not good. Returning 5 there is how 100 unchecked answers averaged 4.24/5 and got
// reported as "and got it right".
export function scoreAnswer(a, hasSource) {
  const claims = Array.isArray(a?.claims) ? a.claims : [];
  const contradicted = claims.filter((c) => c.verdict === "contradicted").length;
  const unsupported = claims.filter((c) => c.verdict === "unsupported").length;
  const supported = claims.filter((c) => c.verdict === "supported").length;

  // --- accuracy: grounding only ---
  let accuracy = null;
  const accuracyDeductions = [];
  if (hasSource && claims.length) {
    accuracy = 5;
    const take = (n, cost, cap, label) => {
      if (!n) return;
      const points = Math.min(n * cost, cap);
      accuracyDeductions.push({ label, points: round1(points) });
      accuracy -= points;
    };
    // Capped, for the same reason the Knowledge Factory's weights are capped: uncapped per-claim
    // penalties punish a detailed answer for being detailed, and floor every long answer at 1.
    take(contradicted, 1.5, 3, "contradicts the source");
    take(unsupported, 1, 2.5, "claim the source doesn't establish");
    accuracy = round1(Math.max(1, Math.min(5, accuracy)));
  }

  // --- quality: did the answer do its job ---
  let quality = 5;
  const qualityDeductions = [];
  const q = (cond, points, label) => { if (cond) { qualityDeductions.push({ label, points }); quality -= points; } };
  q(a?.answered_the_question === false, 2, "didn't answer what was asked");
  q(a?.complete === false, 1, "left out something material");
  q(a?.appropriately_routed === false, 1, "thin answer where the source had more");
  quality = round1(Math.max(1, Math.min(5, quality)));

  const grounding = !hasSource ? "no_source"
    : contradicted ? "contradicted"
    : unsupported ? "unsupported"
    : claims.length ? "grounded"
    : "no_claims";

  // The utilization test. NOT "did she say something" — that counts an answer she invented, or
  // read off a tool, or recited from the system prompt. This is: a document she retrieved from the
  // knowledge base actually backed something she said.
  const kbAnswered = !!(hasSource && supported > 0);

  // The stored score stays a single number for the existing dashboard column and its check
  // constraint. Where accuracy is known it dominates, because being wrong is worse than being
  // clumsy; where it isn't, quality stands alone and `grounding: no_source` says why.
  const score = accuracy == null ? quality : round1(Math.min(accuracy, quality));
  const rating = score >= 4.5 ? "good" : score >= 3 ? "partial" : "wrong";

  return {
    score, rating, grounding,
    quality, accuracy,
    supported, unsupported, contradicted,
    kbAnswered,
    deductions: [...accuracyDeductions, ...qualityDeductions],
  };
}

// --- Transfers ---------------------------------------------------------------------------------
//
// A transfer is not one thing. Counting them all as failures punishes the agent for correctly
// refusing to move someone's money; counting them all as successes buries the ones that shouldn't
// have happened. These five classes each imply a different fix — or none.
export const TRANSFER_CLASSES = ["by_design", "caller_request", "knowledge_gap", "tool_gap", "breakdown"];

// The two that are not defects. A transfer in either class is a correct outcome, and the call is
// judged on how well it was handed over rather than on the fact that it was.
export const GOOD_TRANSFER = new Set(["by_design", "caller_request"]);

// The handoff checklist. For an agent whose job legitimately ends at a human, this IS the job:
// arrive at that human with the work done. A caller who has been verified, had every answerable
// question answered, and knows what happens next is a 5/5 call that happens to end in a transfer.
export const HANDOFF_STEPS = [
  { key: "caller_verified", weight: 1, label: "verified the caller before handing over" },
  { key: "answered_what_it_could", weight: 1.5, label: "answered everything she legitimately could first" },
  { key: "collected_context", weight: 1, label: "collected what the human needs to act" },
  { key: "explained_next_step", weight: 1, label: "told the caller what would happen next" },
  { key: "warm_handoff", weight: 0.5, label: "handed over with context, not a cold drop" },
];

// Checklist -> 1-5. Weighted, because arriving with the question already answered matters more
// than the transfer's mechanics.
export function scoreHandoff(steps) {
  if (!steps || typeof steps !== "object") return null;
  const total = HANDOFF_STEPS.reduce((s, x) => s + x.weight, 0);
  const got = HANDOFF_STEPS.reduce((s, x) => s + (steps[x.key] === true ? x.weight : 0), 0);
  return round1(Math.max(1, Math.min(5, 1 + (got / total) * 4)));
}

export const missedHandoffSteps = (steps) =>
  !steps ? [] : HANDOFF_STEPS.filter((x) => steps[x.key] !== true).map((x) => x.label);

// Roll the per-answer scores up into a score for the CALL.
//
// `answers` are scoreAnswer() results; `askedCount` is every plan question the caller raised,
// including ones she couldn't answer at all — those have no answer row, and leaving them out of
// the denominator is how a call that ducked three of four questions scores 5/5.
//
// `excusedCount` is the questions no article and no tool could ever have answered: out of scope, or
// correctly declined. Those are removed from the denominator. Without that, a call is marked down
// for refusing to do the thing it is supposed to refuse to do — which is how transfers ended up
// averaging 2.84 against 4.07 for resolved calls, and why the number felt wrong.
export function scoreCall(answers = [], askedCount = null, opts = {}) {
  const { excusedCount = 0, transferClass = null, handoffSteps = null, outcome = null } = opts;

  const quals = answers.map((a) => a.quality).filter((x) => x != null);
  const accs = answers.map((a) => a.accuracy).filter((x) => x != null);
  const kb = answers.filter((a) => a.kbAnswered).length;
  const asked = askedCount == null ? answers.length : askedCount;

  // An unanswered question is a quality failure — unless nobody could have answered it.
  const unanswered = Math.max(0, asked - answers.length);
  const excused = Math.max(0, Math.min(excusedCount, unanswered));
  const penalized = unanswered - excused;
  const qualityPool = [...quals, ...Array.from({ length: penalized }, () => 1)];

  const handoff_score = transferClass ? scoreHandoff(handoffSteps) : null;

  // The headline that must not punish a correct transfer: resolved, or transferred for a reason
  // that genuinely needed a human AND handed over cleanly. A by-design transfer with a bad handoff
  // is still not "handled correctly" — the decision was right, the execution wasn't.
  const handled_correctly =
    outcome === "resolved" ? true
    : transferClass ? (GOOD_TRANSFER.has(transferClass) && (handoff_score ?? 0) >= 3.5)
    : outcome === "abandoned" ? false
    : null;   // unknown outcome, no transfer — not enough to say either way

  return {
    quality_score: qualityPool.length ? round1(mean(qualityPool)) : null,
    // Null, not 5: an accuracy score means "we checked". No checkable answer means we didn't.
    accuracy_score: accs.length ? round1(mean(accs)) : null,
    kb_answered: kb > 0,
    questions_asked: asked,
    questions_kb: kb,
    excused_questions: excused,
    transfer_class: transferClass,
    handoff_score,
    handoff_steps: transferClass ? handoffSteps : null,
    handled_correctly,
    answers_checked: accs.length,
  };
}
