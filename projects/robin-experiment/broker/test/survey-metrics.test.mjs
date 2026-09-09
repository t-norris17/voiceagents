// What summariseSurvey must and must not count.
//
// Every case here is a bug that was actually in this file, not a hypothetical. The function has one
// job that is easy to get wrong: some numbers are per PERSON (proportions, so one tester's three
// calls are one opinion) and some are per CALL (adherence, and free text). Picking the wrong source
// produces a plausible-looking number, which is the worst kind.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test";
const { summariseSurvey } = await import("../api/metrics.js");

const person = (o) => ({
  person_key: "P-1", responses: 1, repeat_caller: false, changed_mind: false,
  first_at: "2026-09-01", conversation_id: "c1", ...o,
});
const call = (o) => ({
  conversation_id: "c1", survey_offered: true, survey_verdict: "success", person_key: "P-1",
  response_seq: 1, ...o,
});

test("an unanswered call is not averaged in as a zero", () => {
  // Number(null) is 0, not NaN. A plain Number().filter(isFinite) craters the mean silently.
  const r = summariseSurvey(
    [person({ person_key: "P-1", satisfaction_score: 5, satisfaction_raw: "five" }),
     person({ person_key: "P-2", satisfaction_score: 4, satisfaction_raw: "four" }),
     person({ person_key: "P-3", satisfaction_score: null, satisfaction_raw: null })],
    [call({}), call({}), call({})]
  );
  assert.equal(r.satisfaction.mean, 4.5);
  assert.equal(r.satisfaction.n, 2);
});

test("an answer we could not score is counted, never averaged", () => {
  const r = summariseSurvey(
    [person({ satisfaction_score: null, satisfaction_raw: "pretty good" })], [call({})]
  );
  assert.equal(r.satisfaction.unparsed, 1);
  assert.equal(r.satisfaction.mean, null);
});

test("proportions count people, not calls", () => {
  const r = summariseSurvey(
    [person({ responses: 3, repeat_caller: true, preference: "agent", satisfaction_score: 5 })],
    [call({ response_seq: 1 }), call({ response_seq: 2 }), call({ response_seq: 3 })]
  );
  assert.equal(r.people, 1, "one tester is one opinion");
  assert.equal(r.calls, 3);
  assert.equal(r.preference.decided, 1, "three calls must not read as three votes");
  assert.equal(r.repeat_callers, 1);
});

// THE REGRESSION THAT WAS LIVE. Comments were read from the person-level rows, which hold only a
// person's FIRST surveyed call — so anything said on a later call vanished from the page and from
// the themes engine. On the real data at the time, that was 1 of 1 comments: the page showed none
// while one existed.
test("free text is read from calls, so a repeat caller's later comment survives", () => {
  const r = summariseSurvey(
    [person({ person_key: "P-1", responses: 2, repeat_caller: true, open_comments: null })],
    [call({ conversation_id: "c2", response_seq: 2, open_comments: "it went well" }),
     call({ conversation_id: "c1", response_seq: 1, open_comments: null })]
  );
  assert.equal(r.comments.given, 1, "a comment on call 2 must still be a comment");
  assert.equal(r.comments.recent.length, 1);
  assert.equal(r.comments.recent[0].text, "it went well");
  assert.equal(r.comments.people_who_commented, 1, "but it is still only one person");
});

test("two comments from one person are two comments and one person", () => {
  const r = summariseSurvey(
    [person({ person_key: "P-1", responses: 2, repeat_caller: true })],
    [call({ conversation_id: "c1", open_comments: "first" }),
     call({ conversation_id: "c2", open_comments: "second" })]
  );
  assert.equal(r.comments.given, 2);
  assert.equal(r.comments.people_who_commented, 1, "chatty repeats must not look like breadth");
});

test("redacted comments keep their count without their words", () => {
  const r = summariseSurvey(
    [person({})],
    [call({ open_comments: null, comments_redacted: true })]
  );
  assert.equal(r.comments.given, 1);
  assert.equal(r.comments.redacted, 1);
  assert.equal(r.comments.recent.length, 0, "the rate is kept, the words are not");
});

test("the cross-tab surfaces people who liked it and still want a human", () => {
  const r = summariseSurvey(
    [person({ person_key: "P-1", satisfaction_score: 5, preference: "person" }),
     person({ person_key: "P-2", satisfaction_score: 5, preference: "agent" }),
     person({ person_key: "P-3", satisfaction_score: 2, preference: "person" })],
    [call({}), call({}), call({})]
  );
  assert.equal(r.happy_but_prefers_person, 1, "a 2/person is dissatisfaction; a 5/person is not");
  assert.deepEqual(r.matrix[0], { score: 5, agent: 1, person: 1, no_preference: 0, unclassified: 0 });
});

test("unparsed preferences are kept in the matrix rather than dropped", () => {
  const r = summariseSurvey(
    [person({ satisfaction_score: 4, preference: "unclassified" })], [call({})]
  );
  assert.equal(r.matrix.find((m) => m.score === 4).unclassified, 1);
  assert.equal(r.preference.decided, 0, "but it is not a vote");
});

test("the interval never claims more certainty than the sample supports", () => {
  const all = (n) => Array.from({ length: n }, (_, i) => person({ person_key: `P-${i}`, preference: "agent" }));
  const r = summariseSurvey(all(20), Array.from({ length: 20 }, () => call({})));
  assert.equal(r.preference.ci.pct, 100);
  assert.ok(r.preference.ci.margin > 0, "20 of 20 must not report a margin of zero");
  assert.ok(r.preference.ci.lo < 100 && r.preference.ci.hi <= 100, "and must stay inside 0-100");
});

test("adherence is a call-level question and stays one", () => {
  const r = summariseSurvey(
    [person({ preference: "agent" })],
    [call({ survey_verdict: "success" }), call({ survey_verdict: "failure" }),
     call({ survey_verdict: "unknown" })]
  );
  assert.equal(r.adherence.eligible, 2, "unknown = ineligible, excluded from the denominator");
  assert.equal(r.adherence.pct, 50);
  assert.equal(r.adherence.ineligible, 1);
});

test("no rows is an empty state, not a crash or a zero", () => {
  assert.deepEqual(summariseSurvey([], []), { calls: 0, people: 0, awaiting_first_call: true });
});
