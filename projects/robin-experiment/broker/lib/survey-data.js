// Shared reads for the survey instrument. One definition of "the survey rows" so the page, the
// CSV, the themes and the Q&A can never quote different numbers from each other.
//
// TEMPORARY: delete with the instrument after the customer wave.
import { sb } from "./supabase.js";

// Respondent-level. THIS is what a decision is quoted from: one row per RESPONDENT, meaning one
// caller as one member, being their first surveyed call under that persona. See migration 011 for
// why a respondent is caller+persona rather than caller alone, and 009 for why first-response
// rather than an average.
export const PEOPLE_COLS =
  "person_key,caller_key,responses,repeat_caller,changed_mind,needs_review,first_at,last_at," +
  "conversation_id,started_at,duration_seconds,overall_sentiment,in_nps_era,topic,plan_topic," +
  "prefer_agent_raw,preference,nps_raw,nps_score,nps_band,voice_raw,voice_score," +
  "open_comments,comments_redacted," +
  // Retired v1 columns. Still selected because four respondents answered under the old
  // instrument and their answers are not being thrown away.
  "satisfaction_raw,satisfaction_score,would_recommend_raw,would_recommend";

// Call-level. Used for the operational numbers (did Robin ask when she should have?), for all free
// text, and for the call browser, where seeing a respondent's later calls is the point.
export const CALL_COLS =
  "conversation_id,started_at,duration_seconds,caller_key,person_key,response_seq,survey_offered," +
  "survey_consent,offer_context,survey_verdict,overall_sentiment,needs_review,in_nps_era," +
  "topic,plan_topic,prefer_agent_raw,preference,nps_raw,nps_score,nps_band," +
  "voice_raw,voice_score,open_comments,comments_redacted," +
  "satisfaction_raw,satisfaction_score,would_recommend_raw,would_recommend";

export async function surveyPeople() {
  return (await sb(`survey_people?select=${PEOPLE_COLS}&order=first_at.asc.nullslast`)) || [];
}

// Response-level opinions. During the TESTING wave one tester deliberately places several calls,
// each exercising a different scenario, and every one of those reactions is wanted — so the unit of
// opinion is the RESPONSE, not the person. Person-level dedup still ships alongside (surveyPeople)
// because "N people" is the number that has to survive a room, and the page shows both.
//
// Filtered to in_nps_era: the v1 instrument (1-5 satisfaction, yes/no recommend) asked different
// questions, and mixing the two eras produced a dashboard where a respondent's pre-NPS first call
// permanently masked the NPS they later gave. Clean start, v2 only. Nothing is deleted — the v1
// rows are still in survey_answers and still reachable through surveyPeople.
export async function surveyResponses() {
  return (
    (await sb(
      `survey_answers?in_survey_era=is.true&in_nps_era=is.true&survey_offered=is.true` +
        `&select=${CALL_COLS}&order=started_at.asc.nullslast`
    )) || []
  );
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

// Human-readable names for respondents.
//
// person_key is a salted hash — "P-1ea00145". That is the right thing to store and the wrong thing
// to put in front of a reader: an answer reading "P-1ea00145 answered on two calls" is correct and
// unreadable, and a director does not care that we hash caller IDs. Numbering people in the order
// they first responded gives "Respondent 3", which carries the same meaning and none of the noise.
//
// Derived from the calls, so the numbering is identical everywhere without a second query: a
// person's ordinal is fixed by their earliest surveyed call, independent of row order.
export function respondentLabels(calls) {
  const earliest = new Map();
  for (const c of calls) {
    if (!c.person_key || !c.started_at) continue;
    const seen = earliest.get(c.person_key);
    if (!seen || c.started_at < seen) earliest.set(c.person_key, c.started_at);
  }
  const ordered = [...earliest.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return new Map(ordered.map(([key], i) => [key, `Respondent ${i + 1}`]));
}

// Any person_key that slipped into prose becomes its label; any raw conversation id becomes plain
// words, since the ids an answer rests on are already rendered as clickable chips from `cited`.
//
// The prompt asks for this too, but a prompt is a request and this is a guarantee. The failure it
// prevents is silent and ugly: "P-1ea00145 answered on two calls (conv_7701m218tczhe5182r1hrnfz117r)"
// is a correct answer nobody can read.
export function readable(text, labels) {
  let out = String(text ?? "");
  for (const [key, name] of labels) out = out.split(key).join(name);
  out = out.replace(/\bP-[0-9a-f]{8}\b/g, "a respondent");
  // "(conv_abc)" and ", conv_abc" are citation noise; take the wrapper with them.
  out = out.replace(/\s*[([]\s*conv_[A-Za-z0-9]+\s*[)\]]/g, "");
  out = out.replace(/\s*,\s*conv_[A-Za-z0-9]+/g, "");
  out = out.replace(/\bconv_[A-Za-z0-9]+\b/g, "that call");
  return out.replace(/\s{2,}/g, " ").trim();
}
