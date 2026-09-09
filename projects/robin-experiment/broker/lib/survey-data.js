// Shared reads for the survey instrument. One definition of "the survey rows" so the page, the
// CSV, the themes and the Q&A can never quote different numbers from each other.
//
// TEMPORARY: delete with the instrument after the customer wave.
import { sb } from "./supabase.js";

// Person-level. THIS is what a decision is quoted from: one row per tester, their first surveyed
// call. See migration 009 for why first-response rather than an average across a person's calls.
export const PEOPLE_COLS =
  "person_key,responses,repeat_caller,changed_mind,first_at,last_at,conversation_id,started_at," +
  "duration_seconds,topic,plan_topic,satisfaction_raw,satisfaction_score,prefer_agent_raw," +
  "preference,would_recommend_raw,would_recommend,open_comments,comments_redacted";

// Call-level. Used for the operational numbers (did Robin ask when she should have?) and for the
// call browser, where seeing a person's second and third calls is the point.
export const CALL_COLS =
  "conversation_id,started_at,duration_seconds,person_key,response_seq,survey_offered," +
  "survey_consent,offer_context,survey_verdict,topic,plan_topic,satisfaction_raw," +
  "satisfaction_score,prefer_agent_raw,preference,would_recommend_raw,would_recommend," +
  "open_comments,comments_redacted";

export async function surveyPeople() {
  return (await sb(`survey_people?select=${PEOPLE_COLS}&order=first_at.asc.nullslast`)) || [];
}

export async function surveyCalls() {
  return (await sb(`survey_answers?in_survey_era=is.true&select=${CALL_COLS}&order=started_at.desc.nullslast`)) || [];
}

// Number(null) is 0, not NaN — a plain Number().filter(isFinite) silently averages every
// unanswered call in as a zero and craters the mean. Reject null/""/undefined explicitly.
export const score = (v) =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

// Wilson score interval at 95%, as whole percentage points.
//
// Not the textbook Wald interval (p +/- 1.96*sqrt(p(1-p)/n)): Wald misbehaves at exactly the shape
// this wave has — small n with a lopsided split. At 18 of 20 preferring Robin it reports 90% +/- 13,
// an upper bound of 103%, and at 20 of 20 it reports a margin of ZERO, which would put "100%, no
// uncertainty" on a slide off twenty calls. Wilson stays inside 0-100 and keeps a real interval at
// the extremes, so the page cannot claim more certainty than it has.
export function wilson(hits, n) {
  if (!n) return null;
  const z = 1.96, p = hits / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    pct: Math.round(p * 100),
    lo: Math.max(0, Math.round((centre - half) * 100)),
    hi: Math.min(100, Math.round((centre + half) * 100)),
    // Half-width of the interval, for "62% +/- 14 points" phrasing. Asymmetric near the extremes,
    // so this is the wider side — never the flattering one.
    margin: Math.round(Math.max(centre + half - p, p - (centre - half)) * 100),
  };
}
