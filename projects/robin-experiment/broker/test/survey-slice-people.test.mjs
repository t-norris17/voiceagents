import { test } from "node:test";
import assert from "node:assert/strict";
import { peopleFromCalls } from "../lib/survey-data.js";
import { summariseSurvey } from "../api/metrics.js";

const call = (o) => ({ survey_offered: true, in_nps_era: true, prefer_agent_raw: "with you", preference: "agent", nps_raw: "8", nps_score: 8, nps_band: "passive", ...o });

test("peopleFromCalls: one row per person, first call in the slice, counts over their calls", () => {
  const calls = [
    call({ conversation_id: "c3", person_key: "P-a", started_at: "2026-09-23T10:00:00Z", respondent_name: "Kristen Johnson", nps_score: 5, nps_band: "detractor", needs_review: true }),
    call({ conversation_id: "c1", person_key: "P-a", started_at: "2026-09-23T08:00:00Z", respondent_name: "Kristen Johnson", nps_score: 9, nps_band: "promoter" }),
    call({ conversation_id: "c2", person_key: "P-a", started_at: "2026-09-23T09:00:00Z", respondent_name: "Kristen Johnson", nps_score: 10, nps_band: "promoter", preference: "person" }),
    call({ conversation_id: "c4", person_key: "P-b", started_at: "2026-09-22T09:00:00Z", respondent_name: "Tanner Norris", is_staff: true }),
    call({ conversation_id: "c5", person_key: "P-c", started_at: "2026-09-22T09:30:00Z", respondent_name: null, caller_name: null }),
    { conversation_id: "c6", person_key: "P-d", started_at: "2026-09-22T09:40:00Z", survey_offered: false, outcome: "transferred" },
  ];
  const people = peopleFromCalls(calls);
  assert.deepEqual(people.map((p) => p.person_key), ["P-b", "P-c", "P-a"], "ordered by first call; the transferred call is nobody's response");
  const k = people.find((p) => p.person_key === "P-a");
  assert.equal(k.conversation_id, "c1", "the row IS the first call in the slice");
  assert.equal(k.nps_score, 9);
  assert.equal(k.responses, 3);
  assert.equal(k.repeat_caller, true);
  assert.equal(k.changed_mind, true, "agent then person");
  assert.equal(k.needs_review, true, "any of their calls");
  assert.equal(k.first_at, "2026-09-23T08:00:00Z"); assert.equal(k.last_at, "2026-09-23T10:00:00Z");
  assert.equal(k.caller_name, "Kristen Johnson");
  assert.equal(people.find((p) => p.person_key === "P-b").is_staff, true);
  assert.equal(people.find((p) => p.person_key === "P-c").caller_name, "Respondent 2", "no name falls back to the number");
});

test("summariseSurvey: opinions exclude staff while the funnel and adherence count everyone", () => {
  const everyone = [
    call({ conversation_id: "s1", person_key: "P-staff", started_at: "2026-09-23T10:00:00Z", is_staff: true, survey_verdict: "success", nps_score: 10, nps_band: "promoter" }),
    call({ conversation_id: "t1", person_key: "P-t", started_at: "2026-09-23T09:00:00Z", survey_verdict: "success", nps_score: 3, nps_band: "detractor", preference: "person" }),
    { conversation_id: "x1", person_key: "P-x", started_at: "2026-09-23T08:00:00Z", survey_offered: false, survey_verdict: "unknown", outcome: "transferred" },
    { conversation_id: "x2", person_key: "P-y", started_at: "2026-09-23T07:00:00Z", survey_offered: false, survey_verdict: "failure", outcome: "abandoned" },
    { conversation_id: "x3", person_key: "P-z", started_at: "2026-09-23T06:00:00Z", survey_offered: false, survey_verdict: "unknown", outcome: "resolved" },
  ];
  const calls = everyone.filter((c) => !c.is_staff);
  const opinions = calls.filter((c) => c.survey_offered).slice().reverse();
  const s = summariseSurvey(opinions, calls, everyone);
  assert.equal(s.people, 1, "the staff caller is not an opinion");
  assert.equal(s.nps.score, -100);
  assert.equal(s.surveyed, 1);
  const { excluded, ...counts } = s.funnel;
  assert.deepEqual(counts, { in_range: 5, surveyed: 2, answered: 2, not_surveyed: 3, transferred: 1, abandoned: 1, other: 1, staff_included: true });
  assert.deepEqual(excluded.map((x) => x.outcome), ["transferred", "abandoned", "resolved"], "the excluded calls are listed, newest first");
  assert.equal(excluded[0].respondent, null, "a caller who never reached the survey gets no respondent number");
  assert.deepEqual(s.adherence.misses.map((m) => m.conversation_id), ["x2"], "the miss is listed");
  assert.equal(s.adherence.eligible, 3, "success, success and failure; unknown is ineligible");
  assert.equal(s.adherence.asked_when_eligible, 2, "the staff call counts: Robin asked");
  // Without the third argument nothing changes for existing callers.
  const same = summariseSurvey(opinions, calls);
  assert.equal(same.funnel.in_range, 4);
  assert.equal(same.adherence.eligible, 2);
});
