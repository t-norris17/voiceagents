// The survey answers come from an LLM reading a transcript, so every value is free text.
// These tests pin the coercions — and, more importantly, pin the cases where the honest answer
// is "we don't know", because a survey that guesses is worse than no survey.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boolish, ratingFrom, consentState, parseSurvey } from "../lib/survey.js";

const pickFrom = (o) => (k) => (k in o ? o[k] : null);

test("yes and no survive however the model phrases them", () => {
  for (const v of ["Yes", "yeah", "yep", "true", "Y", "sure", "Absolutely"]) assert.equal(boolish(v), true, v);
  for (const v of ["No", "nope", "false", "declined", "Nah"]) assert.equal(boolish(v), false, v);
});

test("'not offered' and 'no, that's ok' read as NO, not yes", () => {
  // Both embed a yes-token; a naive scan gets these backwards.
  assert.equal(boolish("not offered"), false);
  assert.equal(boolish("no, that's ok"), false);
  assert.equal(boolish("didn't answer"), false);
});

test("unknown stays unknown — never defaults to false", () => {
  // A caller who was never asked has not declined. Collapsing the two would invent refusals.
  for (const v of ["", null, undefined, "maybe", "unclear"]) assert.equal(boolish(v), null, String(v));
});

test("ratings parse from digits and words", () => {
  assert.equal(ratingFrom("5"), 5);
  assert.equal(ratingFrom("five"), 5);
  assert.equal(ratingFrom("4 out of 5"), 4);
  assert.equal(ratingFrom("I'd say a three"), 3);
});

test("an out-of-range rating is discarded, not clamped", () => {
  // A 7 means the question was misheard. Clamping it to 5 silently inflates satisfaction.
  assert.equal(ratingFrom("7"), null);
  assert.equal(ratingFrom("10 out of 10"), null);
  assert.equal(ratingFrom("zero"), null);
});

test("no survey on the call writes no row", () => {
  assert.equal(parseSurvey(pickFrom({}), { conversation_id: "c1" }), null);
  assert.equal(parseSurvey(pickFrom({ survey_offered: "no" }), { conversation_id: "c1" }), null);
});

test("offered and declined IS recorded — it's the denominator", () => {
  const r = parseSurvey(pickFrom({ survey_offered: "yes", survey_consent: "declined" }), { conversation_id: "c1" });
  assert.equal(r.survey_consent, "declined");
  assert.equal(r.survey_offered, true);
  assert.equal(r.csat, null);
});

test("a full response maps across", () => {
  const r = parseSurvey(
    pickFrom({ survey_offered: "yes", survey_consent: "accepted", csat: "five",
               resolved_fcr: "yes", callback_consent: "yes", callback_window: "weekday mornings" }),
    { conversation_id: "c1", subject_ref: "s1" }
  );
  assert.deepEqual(r, {
    conversation_id: "c1", subject_ref: "s1", survey_offered: true, survey_consent: "accepted",
    csat: 5, fcr: true, callback_consent: true, callback_window: "weekday mornings",
  });
});

test("a callback window is dropped unless consent was actually given", () => {
  // The dialer reads this table. A window sitting next to a refusal would look like permission.
  const r = parseSurvey(
    pickFrom({ csat: "4", callback_consent: "no", callback_window: "next week" }),
    { conversation_id: "c1" }
  );
  assert.equal(r.callback_consent, false);
  assert.equal(r.callback_window, null);
});

test("answering implies it was offered, even if the field says otherwise", () => {
  const r = parseSurvey(pickFrom({ csat: "5", resolved_fcr: "yes" }), { conversation_id: "c1" });
  assert.equal(r.survey_offered, true);
  assert.equal(r.survey_consent, "accepted");
});

test("consent state normalises the model's wording", () => {
  assert.equal(consentState("Accepted", true), "accepted");
  assert.equal(consentState("they declined", true), "declined");
  assert.equal(consentState("not offered", false), "not_offered");
  assert.equal(consentState("", false), "not_offered");
});

test("a malformed field set can't throw", () => {
  assert.doesNotThrow(() => parseSurvey(pickFrom({ csat: {}, resolved_fcr: [], callback_consent: 7 }), { conversation_id: "c" }));
});
