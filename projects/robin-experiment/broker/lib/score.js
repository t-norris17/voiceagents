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

// --- Gaps: what she did when she couldn't answer ------------------------------------------------
//
// An unanswered question used to score 1 — the same value as "confidently told the member something
// false". That isn't a low score, it's a measurement error, and it dragged her average to 2.94 while
// every visible row read 4-5.
//
// The obvious fix is to drop unanswered questions from the score entirely. That's wrong in three
// ways: it hides `not_retrieved` (the article existed and she missed it — 10 of this project's 51
// gaps, and the only category unambiguously hers); it makes not-answering free and answering risky,
// so the metric quietly pays her to attempt less; and it deletes the compliance win, because
// refusing to give investment advice is the single most valuable thing a regulated agent does.
//
// So a gap is not excluded and not a flat penalty. It is scored on the part she controlled: the
// WHY belongs to whoever owns it, the HOW is always hers.
export const GAP_HANDLING = ["declined_correctly", "acknowledged_and_routed", "bluffed", "dropped"];

// (why it went unanswered, how she handled it) -> { score, fault, label }
//   fault "none"    — she did the right thing; nothing to fix
//   fault "content" — an article would fix it; goes to the content queue, not her score
//   fault "robin"   — hers: she invented, stalled, or missed an article that exists
export function scoreGap(failReason, handling) {
  // An unrecognized handling is treated as `dropped`, not as a free pass. A grader that failed to
  // say how she handled it must not hand out a 5 by default.
  const h = GAP_HANDLING.includes(handling) ? handling : "dropped";
  const bluffed = h === "bluffed";
  const dropped = h === "dropped";

  switch (failReason) {
    case "guardrail":
    case "out_of_scope":
      // She was RIGHT not to answer. This is a win, not an absence — unless she undercut it by
      // answering anyway, which is the one way a correct refusal turns into a defect.
      if (bluffed) return { score: 1.5, fault: "robin", label: "declined, then answered anyway" };
      return {
        score: 5, fault: "none",
        label: failReason === "guardrail" ? "correctly declined" : "not a plan question",
      };

    case "no_content":
      // The library has nothing. Not her fault — but everything about HOW she handled it is hers.
      if (bluffed) return { score: 1.5, fault: "robin", label: "nothing written — and she made something up" };
      if (dropped) return { score: 2.5, fault: "robin", label: "nothing written — and she left the caller with nothing" };
      return { score: 5, fault: "content", label: "nothing written yet — she handled it well" };

    case "not_retrieved":
      // An article covers this and she didn't use it. Hers, and the failure mode that gets worse
      // silently as the knowledge base grows.
      if (bluffed) return { score: 1.5, fault: "robin", label: "an article covers this — she made something up instead" };
      return { score: 2.5, fault: "robin", label: "an article covers this — she missed it" };

    default:
      return { score: 2.5, fault: "robin", label: "unanswered" };
  }
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
// `gaps` is one entry per question she did NOT substantively answer, as
// { fail_reason, handling }. Each is scored by scoreGap() and folded into the same pool as her
// answers — so a correct refusal lifts her score, a library gap she handled well is neutral, and
// only what she actually got wrong pulls it down. Nothing is excluded, so the denominator still
// tells the truth about how much was asked of her.
export function scoreCall(answers = [], askedCount = null, opts = {}) {
  const { gaps = [], transferClass = null, handoffSteps = null, outcome = null } = opts;

  const quals = answers.map((a) => a.quality).filter((x) => x != null);
  const accs = answers.map((a) => a.accuracy).filter((x) => x != null);
  const kb = answers.filter((a) => a.kbAnswered).length;
  const asked = askedCount == null ? answers.length : askedCount;

  // Score every gap on what she controlled. If the caller asked more than we have gap records for
  // (a grader that under-reported), the remainder is scored as an unclassified miss rather than
  // vanishing — a silent hole in the denominator is how a partial call reads as a perfect one.
  const scoredGaps = gaps.map((g) => scoreGap(g.fail_reason, g.handling));
  const unaccounted = Math.max(0, asked - answers.length - scoredGaps.length);
  for (let i = 0; i < unaccounted; i++) scoredGaps.push(scoreGap(null, null));

  const qualityPool = [...quals, ...scoredGaps.map((g) => g.score)];

  const handoff_score = transferClass ? scoreHandoff(handoffSteps) : null;

  // The headline that must not punish a correct transfer: resolved, or transferred for a reason
  // that genuinely needed a human AND handed over cleanly. A by-design transfer with a bad handoff
  // is still not "handled correctly" — the decision was right, the execution wasn't.
  const handled_correctly =
    outcome === "resolved" ? true
    : transferClass ? (GOOD_TRANSFER.has(transferClass) && (handoff_score ?? 0) >= 3.5)
    : outcome === "abandoned" ? false
    : null;   // unknown outcome, no transfer — not enough to say either way

  // Where each gap's blame landed. These are the numbers a manager acts on: content_gaps go to the
  // writing queue, retrieval_misses to prompt/retrieval tuning, robin_defects to coaching, and
  // correct_declines are a win worth reporting rather than an absence.
  const correct_declines = scoredGaps.filter((g) => g.fault === "none").length;
  const content_gaps = scoredGaps.filter((g) => g.fault === "content").length;
  const robin_defects = scoredGaps.filter((g) => g.fault === "robin").length;
  const retrieval_misses = gaps.filter((g) => g.fail_reason === "not_retrieved").length;
  const bluffs = gaps.filter((g) => g.handling === "bluffed").length;

  return {
    // Robin's score. Never blamed for a missing article; still charged for inventing one.
    quality_score: qualityPool.length ? round1(mean(qualityPool)) : null,
    // Null, not 5: an accuracy score means "we checked". No checkable answer means we didn't.
    accuracy_score: accs.length ? round1(mean(accs)) : null,
    kb_answered: kb > 0,
    questions_asked: asked,
    questions_kb: kb,
    correct_declines,
    content_gaps,
    retrieval_misses,
    robin_defects,
    bluffs,
    transfer_class: transferClass,
    handoff_score,
    handoff_steps: transferClass ? handoffSteps : null,
    handled_correctly,
    answers_checked: accs.length,
    gap_detail: scoredGaps,
  };
}
