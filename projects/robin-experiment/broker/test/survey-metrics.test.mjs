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

test("the cross-tab surfaces promoters who still want a human", () => {
  const r = summariseSurvey(
    [person({ person_key: "P-1", in_nps_era: true, nps_score: 10, nps_band: "promoter", preference: "person" }),
     person({ person_key: "P-2", in_nps_era: true, nps_score: 9,  nps_band: "promoter", preference: "agent" }),
     person({ person_key: "P-3", in_nps_era: true, nps_score: 3,  nps_band: "detractor", preference: "person" })],
    [call({}), call({}), call({})]
  );
  assert.equal(r.promoter_but_prefers_person, 1,
    "a detractor wanting a person is dissatisfaction; a promoter wanting one is the finding");
  assert.deepEqual(r.matrix[0],
    { band: "promoter", range: "9-10", agent: 1, person: 1, no_preference: 0, unclassified: 0 });
});

test("unparsed preferences are kept in the matrix rather than dropped", () => {
  const r = summariseSurvey(
    [person({ in_nps_era: true, nps_score: 8, nps_band: "passive", preference: "unclassified" })], [call({})]
  );
  assert.equal(r.matrix.find((m) => m.band === "passive").unclassified, 1);
  assert.equal(r.preference.decided, 0, "but it is not a vote");
});

test("respondents on the retired 1-5 instrument are reported, not silently dropped", () => {
  const r = summariseSurvey(
    [person({ person_key: "P-1", in_nps_era: false, satisfaction_score: 5, preference: "agent" }),
     person({ person_key: "P-2", in_nps_era: true, nps_score: 9, nps_band: "promoter", preference: "agent" })],
    [call({}), call({})]
  );
  assert.equal(r.matrix_excluded_v1, 1, "the v1 respondent cannot be placed in an NPS band");
  assert.equal(r.instrument.v1, 1);
  assert.equal(r.instrument.v2, 1);
  assert.equal(r.nps.n, 1, "and their 5/5 must never be averaged into the NPS");
});

test("NPS is promoters minus detractors, not an average and not a percentage", () => {
  const p = (i, sc, b) => person({ person_key: `P-${i}`, in_nps_era: true, nps_score: sc, nps_band: b, preference: "agent" });
  const r = summariseSurvey(
    [p(1, 10, "promoter"), p(2, 9, "promoter"), p(3, 8, "passive"), p(4, 3, "detractor")],
    [call({}), call({}), call({}), call({})]
  );
  assert.equal(r.nps.promoters, 2);
  assert.equal(r.nps.passives, 1);
  assert.equal(r.nps.detractors, 1);
  assert.equal(r.nps.score, 25, "(2 - 1) / 4 = +25, and passives count in the denominator");
  assert.equal(r.nps.mean, 7.5, "the mean is a different number and both are published");
});

test("the dot grid has exactly one dot per respondent, in order", () => {
  const r = summariseSurvey(
    [person({ person_key: "P-1", preference: "agent" }),
     person({ person_key: "P-2", preference: "person" }),
     person({ person_key: "P-3", preference: "unclassified" })],
    [call({}), call({}), call({})]
  );
  assert.equal(r.dots.length, 3, "sample size is the thing the grid must show honestly");
  assert.deepEqual(r.dots.map((d) => d.preference), ["agent", "person", "unclassified"]);
  assert.deepEqual(r.dots.map((d) => d.n), [1, 2, 3]);
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

// The answer a reader actually got, before this existed:
//   "No. The only respondent, P-1ea00145, has changed_mind = false. They answered on two calls —
//    2026-09-08 (conv_7701m218tczhe5182r1hrnfz117r) and 2026-09-09 (conv_0701m236q3cve3...)."
// Correct, and unreadable by the person it was written for. The prompt now asks for prose; this
// makes it deterministic, because a prompt is a request and this is a guarantee.
test("hashes and raw ids never reach the reader", async () => {
  const { readable } = await import("../lib/survey-data.js");
  const labels = new Map([["P-1ea00145", "Respondent 1"]]);

  const out = readable(
    "The only respondent, P-1ea00145, answered on two calls — 8 September " +
      "(conv_7701m218tczhe5182r1hrnfz117r) and 9 September (conv_0701m236q3cve3hr1rkftmamfkmz).",
    labels
  );
  assert.match(out, /Respondent 1/);
  assert.doesNotMatch(out, /P-[0-9a-f]{8}/, "no person_key hash in the prose");
  assert.doesNotMatch(out, /conv_/, "no raw conversation id in the prose");
  assert.match(out, /8 September/, "the substance survives the scrub");

  assert.doesNotMatch(readable("P-deadbeef rated it 5.", labels), /P-deadbeef/,
    "an unlabelled hash still must not reach the page");
  assert.equal(readable("Nobody changed their mind.", labels), "Nobody changed their mind.",
    "text with nothing to rewrite comes back untouched");
  assert.equal(readable(null, labels), "");
});

test("respondent numbering is stable regardless of row order", async () => {
  const { respondentLabels } = await import("../lib/survey-data.js");
  const rows = [
    { person_key: "P-bbb", started_at: "2026-09-09T13:00" },
    { person_key: "P-aaa", started_at: "2026-09-08T19:44" },
    { person_key: "P-bbb", started_at: "2026-09-08T20:00" },
    { person_key: null, started_at: "2026-09-01" },
  ];
  const m = respondentLabels(rows);
  assert.equal(m.get("P-aaa"), "Respondent 1", "numbered by who responded first");
  assert.equal(m.get("P-bbb"), "Respondent 2");
  assert.equal(m.size, 2, "rows without a person are not respondents");
  assert.equal(respondentLabels([...rows].reverse()).get("P-aaa"), "Respondent 1", "order-independent");
});

// I have twice broken a SYSTEM prompt by typing a backtick inside its template literal while
// editing the prose. `node --check` catches it only if someone runs it; this makes the suite catch
// it, and pins the rules that keep answers readable.
test("LLM system prompts are intact and still forbid raw ids in prose", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));

  for (const f of ["survey-ask.js", "survey-themes.js"]) {
    const src = readFileSync(join(here, "..", "api", f), "utf8");
    const start = src.indexOf("const SYSTEM = `");
    assert.ok(start > -1, `${f} should define a SYSTEM prompt`);
    const body = src.slice(start + "const SYSTEM = `".length, src.indexOf("`;", start));
    assert.equal(body.includes("`"), false, `${f}: a backtick inside the SYSTEM literal breaks it`);
    assert.ok(body.length > 200, `${f}: SYSTEM prompt looks truncated`);
  }
  const ask = readFileSync(join(here, "..", "api", "survey-ask.js"), "utf8");
  assert.match(ask, /NEVER print a person_key hash/);
  assert.match(ask, /NEVER print a raw conversation id/);
});

// A tester exercising several personas from one handset is several respondents, by design: they had
// several distinct experiences. This was live and wrong — one handset, three personas, and the
// headline read only the first, so a "prefer a person" answer on the RMD call never reached it.
test("responses and callers are both reported, and neither hides the other", async () => {
  const { summariseSurvey } = await import("../api/metrics.js");
  const p = (o) => ({ responses: 1, repeat_caller: false, changed_mind: false,
                      first_at: "2026-09-01", conversation_id: "c", ...o });
  const c = (o) => ({ conversation_id: "c", survey_offered: true, survey_verdict: "success", ...o });

  const r = summariseSurvey(
    [p({ person_key: "P-a", caller_key: "C-1", preference: "agent", satisfaction_score: 5 }),
     p({ person_key: "P-b", caller_key: "C-1", preference: "agent", satisfaction_score: 5 }),
     p({ person_key: "P-c", caller_key: "C-1", preference: "person", satisfaction_score: 3 })],
    [c({}), c({}), c({})]
  );
  assert.equal(r.people, 3, "three personas from one handset are three responses");
  assert.equal(r.callers, 1, "and the single caller is still reported");
  assert.equal(r.preference.person, 1, "the 'prefer a person' answer must reach the headline");
  assert.equal(r.preference.decided, 3);
});

// The Dana call: rated 3, sentiment negative, and a complaint about Robin remarking on the member's
// age. A rating threshold alone misses it — 3 of 5 is not a bad score, and the objection was tone.
test("a call flagged by sentiment reaches the review queue even with a middling rating", async () => {
  const { summariseSurvey } = await import("../api/metrics.js");
  const p = (o) => ({ responses: 1, first_at: "2026-09-01", conversation_id: "c", ...o });
  const r = summariseSurvey(
    [p({ person_key: "P-a", caller_key: "C-1", preference: "person", satisfaction_score: 3 })],
    [{ conversation_id: "c9", survey_offered: true, survey_verdict: "success", person_key: "P-a",
       satisfaction_raw: "A three.", satisfaction_score: 3, prefer_agent_raw: "I'll wait for a person",
       overall_sentiment: "negative", needs_review: true,
       topic: "RMDs", open_comments: "that was a little disrespectful" }]
  );
  assert.equal(r.review.n, 1);
  assert.equal(r.review.calls[0].sentiment, "negative");
  assert.match(r.review.calls[0].comment, /disrespectful/);
  assert.equal(r.verbatims[0].needs_review, true, "and the call list shows the same flag");
});

test("a clean call is not flagged", async () => {
  const { summariseSurvey } = await import("../api/metrics.js");
  const r = summariseSurvey(
    [{ person_key: "P-a", caller_key: "C-1", responses: 1, first_at: "d", conversation_id: "c",
       preference: "agent", satisfaction_score: 5 }],
    [{ conversation_id: "c", survey_offered: true, survey_verdict: "success", person_key: "P-a",
       satisfaction_raw: "five", satisfaction_score: 5, prefer_agent_raw: "with you",
       overall_sentiment: "positive", needs_review: false }]
  );
  assert.equal(r.review.n, 0);
  assert.equal(r.verbatims[0].needs_review, false);
});
