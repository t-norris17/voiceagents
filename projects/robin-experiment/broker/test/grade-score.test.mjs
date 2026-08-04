// Tests for the grader's arithmetic — the layer that decides what a finding COSTS, and what
// counts as "the knowledge base answered it". The LLM supplies evidence; this file proves the
// evidence turns into the right numbers. Pure, no API key. Run: `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAnswer, scoreCall, scoreGap, scoreHandoff, missedHandoffSteps, GAP_HANDLING, TRANSFER_CLASSES, GOOD_TRANSFER } from "../lib/score.js";

const clean = {
  claims: [
    { claim: "The plan allows loans.", source_quote: "Participants may borrow from their vested balance.", verdict: "supported" },
    { claim: "There's a $75 origination fee.", source_quote: "a $75 origination fee", verdict: "supported" },
  ],
  answered_the_question: true, complete: true, appropriately_routed: true, note: "",
};
const withClaims = (verdict, n = 1) => ({
  ...clean,
  claims: [...clean.claims, ...Array.from({ length: n }, (_, i) => ({ claim: `c${i}`, source_quote: "", verdict }))],
});

test("a fully grounded answer scores 5 on both axes and reads as grounded", () => {
  const s = scoreAnswer(clean, true);
  assert.equal(s.score, 5);
  assert.equal(s.quality, 5);
  assert.equal(s.accuracy, 5);
  assert.equal(s.grounding, "grounded");
  assert.equal(s.rating, "good");
  assert.equal(s.kbAnswered, true);
  assert.deepEqual(s.deductions, []);
});

test("quality and accuracy move independently — that's the whole point of two numbers", () => {
  // A fluent, complete, confident answer containing a figure the documents never state. Perfect
  // quality, bad accuracy. One blended number would hide exactly this call.
  const confidentlyWrong = scoreAnswer(withClaims("contradicted"), true);
  assert.equal(confidentlyWrong.quality, 5);
  assert.equal(confidentlyWrong.accuracy, 3.5);

  // The mirror: everything she said was true, but she ducked the question.
  const trueButUseless = scoreAnswer({ ...clean, answered_the_question: false }, true);
  assert.equal(trueButUseless.accuracy, 5);
  assert.equal(trueButUseless.quality, 3);
});

test("the stored score takes the worse axis — being wrong beats being clumsy", () => {
  assert.equal(scoreAnswer(withClaims("contradicted"), true).score, 3.5);
  assert.equal(scoreAnswer({ ...clean, answered_the_question: false }, true).score, 3);
});

test("an invented claim costs 1 on accuracy, and the penalty is capped", () => {
  assert.equal(scoreAnswer(withClaims("unsupported"), true).accuracy, 4);
  assert.equal(scoreAnswer(withClaims("unsupported", 2), true).accuracy, 3);
  assert.equal(scoreAnswer(withClaims("unsupported", 9), true).accuracy, 2.5); // capped at 2.5
  assert.equal(scoreAnswer(withClaims("unsupported"), true).grounding, "unsupported");
});

test("a contradiction costs more than an invented claim, caps, and wins the grounding label", () => {
  assert.ok(scoreAnswer(withClaims("contradicted"), true).accuracy < scoreAnswer(withClaims("unsupported"), true).accuracy);
  assert.equal(scoreAnswer(withClaims("contradicted", 9), true).accuracy, 2); // 5 - 3 (capped)
  const both = scoreAnswer({ ...clean, claims: [
    { claim: "a", source_quote: "", verdict: "unsupported" },
    { claim: "b", source_quote: "x", verdict: "contradicted" },
  ] }, true);
  assert.equal(both.grounding, "contradicted");
});

test("both axes floor at 1 and ceiling at 5", () => {
  const wrecked = scoreAnswer({ ...withClaims("contradicted", 9), answered_the_question: false, complete: false, appropriately_routed: false }, true);
  assert.equal(wrecked.quality, 1);
  assert.equal(wrecked.score, 1);
  assert.ok(wrecked.accuracy >= 1);
});

test("judgment failures cost quality, not accuracy", () => {
  assert.equal(scoreAnswer({ ...clean, complete: false }, true).quality, 4);
  assert.equal(scoreAnswer({ ...clean, appropriately_routed: false }, true).quality, 4);
  assert.equal(scoreAnswer({ ...clean, complete: false }, true).accuracy, 5);
});

// --- the regression: unchecked answers reporting as good ones ---

test("with no readable source, accuracy is UNKNOWN — never 5", () => {
  // This is the bug in one test. 100 of 108 answers in the real project graded `no_source` and
  // still averaged 4.24/5, because an answer with no source has no claims and so takes no
  // grounding deductions. Accuracy is now null, and null cannot be averaged into a good number.
  const s = scoreAnswer({ ...clean, claims: [] }, false);
  assert.equal(s.grounding, "no_source");
  assert.equal(s.accuracy, null);
  assert.equal(s.kbAnswered, false, "nothing was read, so the knowledge base did not answer it");
});

test("a source we could read, with nothing checkable said, is no_claims — not 'grounded'", () => {
  // Her figure came from get_balance, or she correctly routed to a person. Calling that "grounded"
  // asserts a verification that never happened.
  const s = scoreAnswer({ ...clean, claims: [] }, true);
  assert.equal(s.grounding, "no_claims");
  assert.equal(s.accuracy, null);
  assert.equal(s.kbAnswered, false);
});

test("kbAnswered needs a supported claim, not merely a non-empty answer", () => {
  assert.equal(scoreAnswer(clean, true).kbAnswered, true);
  // She spoke, at length, and none of it was in the documents. That is not the KB answering.
  const invented = scoreAnswer({ ...clean, claims: [{ claim: "x", source_quote: "", verdict: "unsupported" }] }, true);
  assert.equal(invented.kbAnswered, false);
});

test("rating bands line up with the DB's vocabulary", () => {
  assert.equal(scoreAnswer(clean, true).rating, "good");
  assert.equal(scoreAnswer({ ...clean, complete: false }, true).rating, "partial");
  assert.equal(scoreAnswer(withClaims("contradicted", 9), true).rating, "wrong");
});

test("grounding only ever emits values the DB's check constraint accepts", () => {
  const allowed = new Set(["grounded", "unsupported", "contradicted", "no_source", "no_claims"]);
  const cases = [
    scoreAnswer(clean, true), scoreAnswer(clean, false), scoreAnswer({ ...clean, claims: [] }, true),
    scoreAnswer(withClaims("unsupported"), true), scoreAnswer(withClaims("contradicted"), true),
    scoreAnswer({}, false), scoreAnswer(null, true), scoreAnswer(undefined, false),
  ];
  for (const c of cases) assert.ok(allowed.has(c.grounding), `unexpected grounding: ${c.grounding}`);
});

test("a malformed result can't crash a run or silently score 5 as verified", () => {
  assert.equal(scoreAnswer({}, false).grounding, "no_source");
  assert.equal(scoreAnswer(null, false).accuracy, null);
  assert.equal(scoreAnswer(undefined, true).grounding, "no_claims");
});

// --- the call-level roll-up ---

test("a call's scores are the mean of its answers", () => {
  const a1 = scoreAnswer(clean, true);                       // q5 a5
  const a2 = scoreAnswer({ ...clean, complete: false }, true); // q4 a5
  const c = scoreCall([a1, a2], 2);
  assert.equal(c.quality_score, 4.5);
  assert.equal(c.accuracy_score, 5);
  assert.equal(c.kb_answered, true);
  assert.equal(c.questions_kb, 2);
});

test("questions she never answered still weigh on the call", () => {
  // Four questions asked, one answered well. Scoring only the answer she gave would report 5/5 on
  // a call that ducked three quarters of it. With no gap records to explain them, the three are
  // scored as unclassified misses (2.5) rather than the old flat 1 — which was the same value as
  // "confidently told the member something false", and is why her average sat at 2.94.
  const c = scoreCall([scoreAnswer(clean, true)], 4);
  assert.equal(c.questions_asked, 4);
  assert.equal(c.quality_score, 3.1);   // (5 + 2.5 + 2.5 + 2.5) / 4
  assert.ok(c.quality_score < 5, "a call that answered one of four is not a perfect call");
  assert.equal(c.kb_answered, true, "one KB-grounded answer still counts for utilization");
  assert.equal(c.questions_kb, 1);
});

test("a call with nothing checkable has NO accuracy score, rather than a flattering one", () => {
  const c = scoreCall([scoreAnswer({ ...clean, claims: [] }, false)], 1);
  assert.equal(c.accuracy_score, null);
  assert.equal(c.answers_checked, 0);
  assert.equal(c.kb_answered, false);
});

test("accuracy averages only the answers that were actually checked", () => {
  const checked = scoreAnswer(withClaims("unsupported"), true);   // accuracy 4
  const unchecked = scoreAnswer({ ...clean, claims: [] }, false); // accuracy null
  const c = scoreCall([checked, unchecked], 2);
  assert.equal(c.accuracy_score, 4, "the unchecked answer neither helps nor hurts");
  assert.equal(c.answers_checked, 1);
});

test("a call where she answered nothing at all", () => {
  const c = scoreCall([], 3);
  assert.equal(c.quality_score, 2.5);  // unclassified misses; a gap record would say whose fault
  assert.equal(c.accuracy_score, null);
  assert.equal(c.kb_answered, false);
  assert.equal(c.questions_asked, 3);
});

// --- transfers: five things, not one -------------------------------------------------------

test("a handoff is scored on what she completed, weighted toward answering first", () => {
  const perfect = { caller_verified: true, answered_what_it_could: true, collected_context: true, explained_next_step: true, warm_handoff: true };
  const nothing = { caller_verified: false, answered_what_it_could: false, collected_context: false, explained_next_step: false, warm_handoff: false };
  assert.equal(scoreHandoff(perfect), 5);
  assert.equal(scoreHandoff(nothing), 1);
  // Answering what she could outweighs the mechanics of the transfer itself.
  assert.ok(scoreHandoff({ ...nothing, answered_what_it_could: true }) > scoreHandoff({ ...nothing, warm_handoff: true }));
  assert.deepEqual(missedHandoffSteps(perfect), []);
  assert.equal(missedHandoffSteps(nothing).length, 5);
});

test("a transfer that needed a human, handed over well, is HANDLED CORRECTLY", () => {
  // The whole point: routing work that belongs to a person is not a failure.
  const steps = { caller_verified: true, answered_what_it_could: true, collected_context: true, explained_next_step: true, warm_handoff: true };
  const c = scoreCall([scoreAnswer(clean, true)], 1, { transferClass: "by_design", handoffSteps: steps, outcome: "transferred" });
  assert.equal(c.handled_correctly, true);
  assert.equal(c.handoff_score, 5);
});

test("a transfer that needed a human but was dumped cold is NOT handled correctly", () => {
  // The decision was right, the execution wasn't. That distinction is the coaching signal.
  const steps = { caller_verified: false, answered_what_it_could: false, collected_context: false, explained_next_step: false, warm_handoff: false };
  const c = scoreCall([], 1, { transferClass: "by_design", handoffSteps: steps, outcome: "transferred" });
  assert.equal(c.handled_correctly, false);
});

test("a transfer she should have handled is never 'handled correctly', however smooth", () => {
  const perfect = { caller_verified: true, answered_what_it_could: true, collected_context: true, explained_next_step: true, warm_handoff: true };
  for (const cls of ["knowledge_gap", "tool_gap", "breakdown"]) {
    const c = scoreCall([], 1, { transferClass: cls, handoffSteps: perfect, outcome: "transferred" });
    assert.equal(c.handled_correctly, false, `${cls} must not count as handled correctly`);
    assert.equal(c.handoff_score, 5, "the handoff can still be graded well — it just doesn't excuse the transfer");
  }
});

test("a resolved call is handled correctly without needing a handoff score", () => {
  const c = scoreCall([scoreAnswer(clean, true)], 1, { outcome: "resolved" });
  assert.equal(c.handled_correctly, true);
  assert.equal(c.handoff_score, null);
  assert.equal(c.transfer_class, null);
});

test("a correct refusal is a WIN, not an absence", () => {
  // Four questions: one answered, three she was right to decline. This is the whole fix. Under the
  // old flat penalty it scored 2.0 — the agent marked down for refusing to give investment advice,
  // which in a regulated product is the most valuable thing she does.
  const gaps = [
    { fail_reason: "guardrail", handling: "declined_correctly" },
    { fail_reason: "guardrail", handling: "declined_correctly" },
    { fail_reason: "out_of_scope", handling: "declined_correctly" },
  ];
  const c = scoreCall([scoreAnswer(clean, true)], 4, { gaps });
  assert.equal(c.quality_score, 5);
  assert.equal(c.correct_declines, 3);
  assert.equal(c.robin_defects, 0);
  assert.equal(c.content_gaps, 0);
});

test("an abandoned call is not handled correctly; an unknown outcome stays unknown", () => {
  assert.equal(scoreCall([], 1, { outcome: "abandoned" }).handled_correctly, false);
  assert.equal(scoreCall([], 1, { outcome: "unknown" }).handled_correctly, null);
});

test("transfer classes stay in the set the DB constraint accepts", () => {
  assert.deepEqual([...GOOD_TRANSFER], ["by_design", "caller_request"]);
  for (const c of GOOD_TRANSFER) assert.ok(TRANSFER_CLASSES.includes(c));
  assert.equal(TRANSFER_CLASSES.length, 5);
});

// --- gaps: scored on what she controlled, never excluded --------------------------------------

test("a missing article is not her fault — but how she handles it is", () => {
  const handled  = scoreGap("no_content", "acknowledged_and_routed");
  const bluffed  = scoreGap("no_content", "bluffed");
  const dropped  = scoreGap("no_content", "dropped");
  assert.equal(handled.score, 5);
  assert.equal(handled.fault, "content", "the gap goes to the writing queue, not against her");
  assert.equal(bluffed.fault, "robin");
  assert.ok(bluffed.score < dropped.score, "inventing an answer is worse than saying nothing");
  assert.ok(dropped.score < handled.score);
});

test("an article that exists and she missed is HERS, however gracefully she routed", () => {
  // The category blanket-exclusion would have hidden: 10 of this project's 51 gaps.
  const missed = scoreGap("not_retrieved", "acknowledged_and_routed");
  assert.equal(missed.fault, "robin");
  assert.ok(missed.score < 3);
});

test("a correct refusal undone by answering anyway is a defect, not a win", () => {
  assert.equal(scoreGap("guardrail", "declined_correctly").fault, "none");
  assert.equal(scoreGap("guardrail", "declined_correctly").score, 5);
  const undone = scoreGap("guardrail", "bluffed");
  assert.equal(undone.fault, "robin");
  assert.equal(undone.score, 1.5);
});

test("an unreported handling is treated as dropped, never as a free 5", () => {
  // A grader that failed to say how she handled it must not hand out a pass by default.
  assert.ok(scoreGap("no_content", "").score < 5);
  assert.ok(scoreGap("no_content", undefined).score < 5);
  assert.ok(scoreGap("no_content", "something_invented").score < 5);
});

test("gaps land in the same pool as answers — the denominator still tells the truth", () => {
  // One good answer, one article she missed. Neither excluded, neither flat-penalised.
  const c = scoreCall([scoreAnswer(clean, true)], 2, {
    gaps: [{ fail_reason: "not_retrieved", handling: "acknowledged_and_routed" }],
  });
  assert.equal(c.questions_asked, 2);
  assert.equal(c.quality_score, 3.8);   // (5 + 2.5) / 2, rounded to one decimal
  assert.equal(c.retrieval_misses, 1);
  assert.equal(c.robin_defects, 1);
});

test("a bluff is the worst thing on the call and shows up as its own count", () => {
  const c = scoreCall([], 2, {
    gaps: [
      { fail_reason: "no_content", handling: "bluffed" },
      { fail_reason: "no_content", handling: "acknowledged_and_routed" },
    ],
  });
  assert.equal(c.bluffs, 1);
  assert.equal(c.content_gaps, 1, "only the well-handled one is the library's problem");
  assert.equal(c.robin_defects, 1, "the bluff is hers");
  assert.equal(c.quality_score, 3.3);  // (1.5 + 5) / 2, rounded
});

test("questions the grader failed to report are counted, not silently dropped", () => {
  // 4 asked, 1 answered, only 1 gap reported. The 2 unaccounted must not vanish — a hole in the
  // denominator is how a partial call reads as a perfect one.
  const c = scoreCall([scoreAnswer(clean, true)], 4, {
    gaps: [{ fail_reason: "guardrail", handling: "declined_correctly" }],
  });
  assert.equal(c.questions_asked, 4);
  assert.ok(c.quality_score < 5, "the two unreported questions still weigh on the score");
});

test("every gap label is a sentence a manager can act on", () => {
  for (const reason of ["guardrail", "out_of_scope", "no_content", "not_retrieved"])
    for (const h of GAP_HANDLING) {
      const g = scoreGap(reason, h);
      assert.ok(g.label && g.label.length > 5, `${reason}/${h} needs a label`);
      assert.ok(["none", "content", "robin"].includes(g.fault));
      assert.ok(g.score >= 1 && g.score <= 5);
    }
});
