// Shared reads for the survey instrument. One definition of "the survey rows" so the page, the
// CSV, the themes and the Q&A can never quote different numbers from each other.
//
// TEMPORARY: delete with the instrument after the customer wave.
import { sb } from "./supabase.js";
import { parseSlice, applySlice, describeSlice } from "./survey-slice.js";

// Respondent-level. THIS is what a decision is quoted from: one row per RESPONDENT, meaning one
// caller as one member, being their first surveyed call under that persona. See migration 011 for
// why a respondent is caller+persona rather than caller alone, and 009 for why first-response
// rather than an average.
export const PEOPLE_COLS =
  "person_key,caller_key,responses,repeat_caller,changed_mind,needs_review,first_at,last_at," +
  "conversation_id,started_at,duration_seconds,overall_sentiment,in_nps_era,topic,plan_topic," +
  "prefer_agent_raw,preference,nps_raw,nps_score,nps_band,voice_raw,voice_score," +
  "open_comments,comments_redacted,caller_name,is_staff,wave," +
  // Retired v1 columns. Still selected because four respondents answered under the old
  // instrument and their answers are not being thrown away.
  "satisfaction_raw,satisfaction_score,would_recommend_raw,would_recommend";

// Call-level. Used for the operational numbers (did Robin ask when she should have?), for all free
// text, and for the call browser, where seeing a respondent's later calls is the point.
export const CALL_COLS =
  "conversation_id,started_at,duration_seconds,caller_key,person_key,response_seq,survey_offered," +
  "survey_consent,offer_context,survey_verdict,overall_sentiment,needs_review,in_nps_era,outcome," +
  "topic,plan_topic,prefer_agent_raw,preference,nps_raw,nps_score,nps_band," +
  "voice_raw,voice_score,open_comments,comments_redacted,caller_name,respondent_name,wave,is_staff," +
  "satisfaction_raw,satisfaction_score,would_recommend_raw,would_recommend";

export async function surveyPeople() {
  return (await sb(`survey_people?select=${PEOPLE_COLS}&order=first_at.asc.nullslast`)) || [];
}

// ---- THE SLICE ---------------------------------------------------------------------------------
// Which calls the page is looking at: a wave, this week, a custom range (lib/survey-slice.js). One
// fetch of every call that carries the survey instrument, one filter in memory, and every endpoint
// reads the result, so the tiles, the themes, the Ask box and the CSV agree with each other.
//
// "Carries the instrument" is wider than in_survey_era: the internal-testing wave sits before the
// era on purpose (migration 017) and is only ever shown when a viewer asks for it by name.
export async function surveyWaves() {
  return (await sb(`experiment_waves?select=wave,label,internal,started_at,ended_at,note&order=started_at.asc`)) || [];
}
async function surveyRows() {
  return (await sb(`survey_answers?or=(in_survey_era.is.true,wave.not.is.null)&select=${CALL_COLS}&order=started_at.desc.nullslast`)) || [];
}

// Staff are the build team calling to check things (experiment_staff). Their OPINIONS are hidden
// unless asked; every operational number (did Robin ask, how many calls came in) still counts them,
// because Robin's behaviour on a staff call is as real as on any other. So two call lists come back.
export async function surveySlice(query = {}) {
  const [waves, rows] = await Promise.all([surveyWaves(), surveyRows()]);
  const slice = parseSlice(query, { waves });
  const everyone = applySlice(rows, { ...slice, staff: "shown" });   // desc, all callers
  const calls = slice.staff === "shown" ? everyone : applySlice(rows, slice); // desc, staff rule applied
  const responses = calls.filter((r) => r.in_nps_era && r.survey_offered).slice().reverse(); // asc

  // The rail: every wave with what it holds under the current staff rule.
  const waveList = waves.map((w) => {
    const in_w = applySlice(rows, { kind: "wave", from: w.started_at ? new Date(w.started_at).toISOString() : null, to: w.ended_at ? new Date(w.ended_at).toISOString() : null, staff: slice.staff });
    const surveyed = in_w.filter((r) => r.survey_offered);
    return {
      key: w.wave, label: w.label || w.wave, internal: !!w.internal,
      from: w.started_at ? new Date(w.started_at).toISOString() : null,
      to: w.ended_at ? new Date(w.ended_at).toISOString() : null,
      calls: in_w.length, surveyed: surveyed.length,
      people: new Set(surveyed.map((r) => r.person_key).filter(Boolean)).size,
    };
  });
  const staffCalls = everyone.filter((r) => r.is_staff && r.survey_offered);
  const info = {
    ...describeSlice(slice),
    kind: slice.kind, key: slice.key, valid: slice.valid !== false, error: slice.error || null, defaulted: !!slice.defaulted,
    waves: waveList,
    staff_calls: staffCalls.length,
    staff_people: new Set(staffCalls.map((r) => r.person_key).filter(Boolean)).size,
  };
  return { slice, info, waves, rows, everyone, calls, responses };
}

// One row per respondent INSIDE a slice: their first surveyed call in it, with the counts survey_people
// carries. Derived here rather than read from the view because "first call" is relative to the slice
// (a tester whose first call was in wave one must still be a wave-two respondent).
export function peopleFromCalls(calls) {
  const by = new Map();
  for (const c of calls) {
    if (!c.person_key || !c.survey_offered) continue;
    if (!by.has(c.person_key)) by.set(c.person_key, []);
    by.get(c.person_key).push(c);
  }
  const labels = respondentLabels(calls);
  const out = [];
  for (const [key, rs] of by) {
    rs.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
    const first = rs[0];
    const prefs = new Set(rs.map((r) => r.preference).filter((p) => ["agent", "person", "no_preference"].includes(p)));
    out.push({
      ...first,
      responses: rs.length,
      repeat_caller: rs.length > 1,
      changed_mind: prefs.size > 1,
      needs_review: rs.some((r) => r.needs_review === true),
      first_at: first.started_at,
      last_at: rs[rs.length - 1].started_at,
      caller_name: labels.get(key) || first.respondent_name || first.caller_name || null,
      is_staff: rs.some((r) => r.is_staff === true),
    });
  }
  return out.sort((a, b) => String(a.first_at).localeCompare(String(b.first_at)));
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
// A respondent's label is the name they gave Robin, and "Respondent N" in order of first call when
// no name was captured. Names started being captured with the customer wave; every testing-wave
// call stays a numbered respondent.
//
// Which name: respondent_name from the view (migration 016: respondent_aliases applied, so "Katie
// Rubless" reads "Adie Robles"), and among a person's calls the FULLEST one, earliest on a tie.
// The same rule survey_people uses, so the page, the CSV and the Ask box agree on a person's name.
// Fullest rather than latest because the transcriber mishears differently call to call ("Nick",
// "Nick Maziaski", "Nick Mazioski") and the fuller spelling is the better guess; a wrong guess is
// corrected with a respondent_aliases row, not here. caller_name is the fallback for a call row
// that predates the column.
export function respondentLabels(calls) {
  const earliest = new Map(), fullest = new Map();
  for (const c of calls) {
    if (!c.person_key || !c.started_at) continue;
    const seen = earliest.get(c.person_key);
    if (!seen || c.started_at < seen) earliest.set(c.person_key, c.started_at);
    const name = String(c.respondent_name || c.caller_name || "").trim();
    if (name) {
      const prev = fullest.get(c.person_key);
      if (!prev || name.length > prev.name.length || (name.length === prev.name.length && c.started_at < prev.at))
        fullest.set(c.person_key, { at: c.started_at, name });
    }
  }
  const ordered = [...earliest.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return new Map(ordered.map(([key], i) => [key, fullest.get(key)?.name || `Respondent ${i + 1}`]));
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
