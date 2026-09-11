// GET /api/metrics -> aggregated, read-only dashboard data for the Robin experiment.
// The service-role key stays server-side (lib/supabase.js); the browser only sees these
// aggregates. Three dimensions: Security (auth + PII), Experience (quality + sentiment),
// Coverage (which of the 25 curated questions have been exercised across the 50 testers).
//
// Everything is computed live from four tables. When call_question_scores is still empty
// (grader hasn't run), the per-question grid degrades gracefully to "not graded yet" rather
// than inventing numbers.
import { sb } from "../lib/supabase.js";
import { surveyResponses, surveyCalls, score, wilson, respondentLabels } from "../lib/survey-data.js";

const q = (s) => encodeURIComponent(s);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// A short caller-facing label per question key, so the dashboard reads like plain English.
const LABEL = {
  eligibility_age: "When can I join the plan?", auto_enrollment: "Am I automatically enrolled?",
  opt_out: "How do I opt out?", change_contribution: "Change my contribution?",
  roth_option: "Can I make Roth contributions?", employer_match: "Does my employer match?",
  profit_sharing_3pct: "What's the 3% contribution?", vesting_schedule: "Am I vested?",
  loan_availability: "Can I take a loan?", loan_fee: "Is there a loan fee?",
  hardship_withdrawal: "Hardship withdrawal?", withdrawal_rules: "When can I withdraw?",
  inservice_distribution: "In-service distribution?", rollover_in: "Roll in an old 401(k)?",
  rollover_help: "Who helps with a rollover?", set_beneficiary: "Set my beneficiary?",
  spouse_beneficiary_rule: "Name someone besides my spouse?", first_time_login: "How do I sign in?",
  reset_password: "Reset my password", otp_pin: "I didn't get my PIN",
  support_hours: "When can I reach a person?", default_investment: "Default investment?",
  change_investments: "Change my investments?", investment_advice_boundary: "Which fund should I pick?",
  my_balance: "What's my balance?",
};
const CATLABEL = {
  enrollment: "Enrollment", contributions: "Contributions", match: "Match", vesting: "Vesting",
  loans: "Loans", withdrawals: "Withdrawals", rollovers: "Rollovers", beneficiaries: "Beneficiaries",
  account_access: "Account access", investments: "Investments", guardrail: "Guardrail", balance: "Balance",
};

const sentBucket = (s) => {
  const n = String(s ?? "").trim().toLowerCase();
  if (["positive", "pos"].includes(n)) return "positive";
  if (["negative", "neg"].includes(n)) return "negative";
  if (["mixed"].includes(n)) return "mixed";
  if (["neutral", "neu"].includes(n)) return "neutral";
  return null;
};

// ---------------------------------------------------------------------------------------------
// SURVEY (temporary — remove with the instrument after the customer wave)
//
// Two numbers matter and they answer different questions:
//   adherence  — did Robin ASK when she was supposed to? An operational number. If this is low the
//                instrument is broken and every number below it is drawn from a biased sample, so
//                it is reported first and never buried.
//   preference — would callers rather use Robin or hold for a person? The actual experiment.
//
// Adherence uses the agent's own evaluation criterion (success / failure / unknown), not a rule
// re-derived here. `unknown` means the criterion ruled the call ineligible — transferred, failed
// verification, no substantive exchange — so it is excluded from the denominator rather than
// counted as a miss. A transferred call is not a failure; the survey is built to stay silent there.
// ---------------------------------------------------------------------------------------------
export function summariseSurvey(opinions, calls) {
  // "P-1ea00145" is the right thing to store and the wrong thing to show a reader. Everything the
  // page renders carries "Respondent 3" instead; the hash never leaves the server.
  const names = respondentLabels(calls);
  const who = (r) => names.get(r.person_key) || null;
  if (!Array.isArray(calls) || calls.length === 0) return { calls: 0, people: 0, responses: 0, awaiting_first_call: true };

  // ---- Operational: did she ASK when she should have? Correctly a CALL-level question. ----
  const judged = calls.filter((r) => r.survey_verdict === "success" || r.survey_verdict === "failure");
  const offered = calls.filter((r) => r.survey_offered === true);
  // Any answer to any question, under either instrument. prefer_agent_raw is listed first
  // because under v2 it is question one and the only one guaranteed to survive a short call.
  const answeredCalls = calls.filter(
    (r) => r.prefer_agent_raw || r.nps_raw || r.voice_raw || r.satisfaction_raw
  );

  // ---- Everything below is RESPONSE-level: one row per answered call. ----
  //
  // Deliberate change for the testing wave. A tester places several calls, each exercising a
  // different scenario, and their reaction to EACH is a real data point — a caller who prefers Robin
  // for a balance lookup and a person for a loan rollover is telling us two different things. The
  // person-level count is still computed, right here, and shipped beside every response figure so
  // "N responses" can never be mistaken for "N people".
  const personCount = new Set(opinions.map((r) => r.person_key).filter(Boolean)).size;
  const perPerson = new Map();
  for (const r of opinions) {
    if (!r.person_key) continue;
    if (!perPerson.has(r.person_key)) perPerson.set(r.person_key, []);
    perPerson.get(r.person_key).push(r);
  }
  // Both are person facts, so both are counted over PEOPLE — not over rows, which would tally a
  // two-call tester twice and quietly reintroduce the overcount this file exists to prevent.
  const repeatCallers = [...perPerson.values()].filter((rs) => rs.length > 1).length;
  const changedMind = [...perPerson.values()].filter(
    (rs) => new Set(rs.map((r) => r.preference).filter((v) => v === "agent" || v === "person")).size > 1
  ).length;

  const scores = opinions.map((r) => score(r.satisfaction_score)).filter((n) => n !== null);
  const npsScores = opinions.map((r) => score(r.nps_score)).filter((n) => n !== null);
  const voiceScores = opinions.map((r) => score(r.voice_score)).filter((n) => n !== null);
  const band = (b) => opinions.filter((r) => r.nps_band === b).length;
  // Respondents split by which instrument they answered, so v1 and v2 are never averaged
  // together and neither silently vanishes from a count.
  const v2 = opinions.filter((r) => r.in_nps_era).length;
  const v1 = opinions.length - v2;
  const tally = (key, vals) => Object.fromEntries(vals.map((v) => [v, opinions.filter((r) => r[key] === v).length]));

  // NPS over an arbitrary slice of responses. Same formula as the headline: promoters minus
  // detractors over everyone who gave a number, as a signed index.
  const npsOf = (rows) => {
    const scored = rows.filter((r) => score(r.nps_score) !== null);
    if (!scored.length) return null;
    const b = (name) => scored.filter((r) => r.nps_band === name).length;
    return {
      n: scored.length, promoters: b("promoter"), passives: b("passive"), detractors: b("detractor"),
      score: Math.round((b("promoter") / scored.length) * 100) - Math.round((b("detractor") / scored.length) * 100),
    };
  };

  // THE SLICE THAT TELLS YOU WHAT TO DO ON MONDAY. An aggregate NPS says how it went; this says
  // WHERE it went badly, which is the difference between a number and a work item. "+40 on balances,
  // -20 on rollovers" names the next KB article. Topics with one or two responses are kept rather
  // than hidden — the page shows n beside every score so a thin slice reads as thin.
  const topics = [...new Set(opinions.map((r) => r.plan_topic).filter(Boolean))];
  const by_topic = topics
    .map((topic) => {
      const rows = opinions.filter((r) => r.plan_topic === topic);
      return {
        topic,
        responses: rows.length,
        agent: rows.filter((r) => r.preference === "agent").length,
        person: rows.filter((r) => r.preference === "person").length,
        decided: rows.filter((r) => r.preference === "agent" || r.preference === "person").length,
        nps: npsOf(rows),
      };
    })
    .sort((a, b) => b.responses - a.responses || a.topic.localeCompare(b.topic));

  const prefs = tally("preference", ["agent", "person", "no_preference", "unclassified"]);
  const decided = prefs.agent + prefs.person + prefs.no_preference;

  // The cross-tab. A leader's first real question is not "what was the average" but "did anyone
  // rate this highly and STILL want a human?" — the cell that decides whether a good satisfaction
  // score actually supports rolling this out. A bar chart cannot show it; this grid is the answer.
  // The cross-tab. A leader's first real question is not "what was the average" but "did anyone
  // rate this highly and STILL want a human?" — the cell that decides whether a good score actually
  // supports rolling this out. On a 0-10 scale the five rows would have become eleven, which is
  // unreadable; the standard NPS bands collapse it to three and read better than the original.
  const MATRIX_BANDS = ["promoter", "passive", "detractor"];
  const matrix = MATRIX_BANDS.map((b) => ({
    band: b,
    range: b === "promoter" ? "9-10" : b === "passive" ? "7-8" : "0-6",
    agent: opinions.filter((r) => r.nps_band === b && r.preference === "agent").length,
    person: opinions.filter((r) => r.nps_band === b && r.preference === "person").length,
    no_preference: opinions.filter((r) => r.nps_band === b && r.preference === "no_preference").length,
    unclassified: opinions.filter((r) => r.nps_band === b && (r.preference === "unclassified" || r.preference === null)).length,
  }));
  // Respondents the cross-tab cannot place, because they answered the retired 1-5 instrument. Shipped
  // beside the grid so a reader can see the grid does not cover everyone, rather than assuming it does.
  const matrix_excluded_v1 = opinions.filter((r) => !r.in_nps_era && r.preference).length;
  // Named because it is the finding, not a cell reference: opinions who would recommend this warmly
  // and still want a person next time. If this is non-zero the headline is softer than it looks.
  const promoter_but_prefers_person = opinions.filter(
    (r) => r.nps_band === "promoter" && r.preference === "person"
  ).length;

  // Cumulative, in the order opinions first responded. Not a day-over-day trend — with a two-week
  // wave that is noise you get asked to explain. This answers the question that actually governs
  // the wave: has the interval narrowed enough to stop collecting?
  const cumulative = [];
  let cAgent = 0, cPerson = 0, cNo = 0;
  for (const p of opinions) {
    if (p.preference === "agent") cAgent++;
    else if (p.preference === "person") cPerson++;
    else if (p.preference === "no_preference") cNo++;
    else continue; // unclassified moves no line; it would flatten the interval without informing it
    const n = cAgent + cPerson + cNo;
    const w = wilson(cAgent, n);
    cumulative.push({ n, at: p.first_at, agent: cAgent, person: cPerson, no_preference: cNo, pct: w.pct, lo: w.lo, hi: w.hi });
  }

  const recommendCounts = (() => {
    const t = (v) => opinions.filter((r) => r.would_recommend === v).length;
    const yes = t("yes"), no = t("no"), unclear = t("unclear");
    return { yes, no, unclear, answered: yes + no + unclear, ci: (yes + no) ? wilson(yes, yes + no) : null };
  })();

  return {
    calls: calls.length,
    people: personCount,
    responses: opinions.length,
    // Distinct handsets behind those respondents. A respondent is one caller AS ONE MEMBER, so a
    // tester exercising several personas is several respondents on purpose (migration 011). Both
    // figures ship together so neither has to stand in for the other.
    callers: new Set(opinions.map((r) => r.caller_key).filter(Boolean)).size,
    // Stated plainly so nobody has to infer it: this is why the two counts differ.
    repeat_callers: repeatCallers,
    // The one fact a call-level average would have buried entirely.
    changed_mind: changedMind,

    adherence: {
      eligible: judged.length,
      asked_when_eligible: judged.filter((r) => r.survey_verdict === "success").length,
      pct: judged.length ? Math.round((judged.filter((r) => r.survey_verdict === "success").length / judged.length) * 100) : null,
      ineligible: calls.length - judged.length,
      note: "ineligible = transferred, failed verification, or no substantive exchange",
    },
    response: {
      offered: offered.length,
      accepted: calls.filter((r) => r.survey_consent === "accepted").length,
      declined: calls.filter((r) => r.survey_consent === "declined").length,
      answered: answeredCalls.length,
      rate_pct: offered.length ? Math.round((answeredCalls.length / offered.length) * 100) : null,
    },

    preference: {
      ...prefs,
      decided,
      ci: decided ? wilson(prefs.agent, decided) : null,
      person_pct: decided ? Math.round((prefs.person / decided) * 100) : null,
      no_preference_pct: decided ? Math.round((prefs.no_preference / decided) * 100) : null,
    },
    satisfaction: {
      n: scores.length,
      mean: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
      four_or_five: scores.filter((s) => s >= 4).length,
      // Answers given in words we could not score ("pretty good"). Kept visible rather than dropped:
      // a rising count means the mean covers a shrinking slice of what was actually said.
      unparsed: opinions.filter((r) => r.satisfaction_raw && score(r.satisfaction_score) === null).length,
      // No `distribution` array: it was computed here and rendered nowhere. The cross-tab's rows
      // already ARE the distribution, broken down by preference, which is strictly more useful.
    },
    // v2. The 0-10 likelihood-to-recommend question that replaced the 1-5 rating.
    nps: {
      n: npsScores.length,
      promoters: band("promoter"),
      passives: band("passive"),
      detractors: band("detractor"),
      // The NPS proper: promoters minus detractors, as a percentage of those who gave a number.
      // Ranges -100 to +100 and is NOT a percentage of anything, which is why it ships beside the
      // three raw counts rather than alone.
      score: npsScores.length
        ? Math.round(((band("promoter") - band("detractor")) / npsScores.length) * 100)
        : null,
      mean: npsScores.length ? Number((npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(2)) : null,
      unparsed: opinions.filter((r) => r.nps_raw && score(r.nps_score) === null).length,
    },
    // v2. How natural Robin's voice sounded, 0-10. Deliberately separate from nps: they are two
    // different questions and merging them would hide whichever one is the problem.
    voice: {
      n: voiceScores.length,
      mean: voiceScores.length ? Number((voiceScores.reduce((a, b) => a + b, 0) / voiceScores.length).toFixed(2)) : null,
      unparsed: opinions.filter((r) => r.voice_raw && score(r.voice_score) === null).length,
    },
    instrument: { v1, v2 },
    recommend: { ...recommendCounts, yes_pct: recommendCounts.ci ? recommendCounts.ci.pct : null },
    matrix,
    matrix_excluded_v1,
    promoter_but_prefers_person,
    // The mirror of the line above, and the stronger argument of the two. Someone who scores Robin
    // a 6 or below and would STILL rather use her than hold for a person is saying the thing no
    // satisfaction number can: even when it disappoints me, I choose it. That is the deployment case.
    detractor_but_prefers_agent: opinions.filter(
      (r) => r.nps_band === "detractor" && r.preference === "agent"
    ).length,
    by_topic,
    // One entry per respondent, in the order they first answered. The page draws a dot per entry:
    // four respondents is four dots, sixty is sixty. Sample size becomes something you SEE rather
    // than something you compute off a confidence band, which is what the band was for and what
    // nobody read it as.
    dots: opinions.map((r, i) => ({ n: i + 1, preference: r.preference || "unclassified", respondent: who(r) })),
    cumulative,

    // FREE TEXT IS CALL-LEVEL, DELIBERATELY, and this is the one place the person-level rule must
    // NOT apply. That rule exists so one tester's three calls count as one OPINION; it was never
    // meant to throw away their WORDS. survey_people keeps only a person's first surveyed call, so
    // reading comments from it silently discards anything said on a later call.
    //
    // That is not hypothetical. On the data as it stands, the only real comment we have was left on
    // Marcus's SECOND surveyed call — so the person-level read showed 0 comments while 1 existed,
    // and the themes engine had nothing to cluster.
    //
    // `given` counts comments, not opinions, because that is what the number means. `people_who_commented`
    // is reported alongside it so a handful of chatty repeat callers cannot look like broad feedback.
    comments: (() => {
      const withText = calls.filter((r) => r.survey_offered && (r.open_comments || r.comments_redacted));
      const said = calls.filter((r) => r.survey_offered && r.open_comments);
      return {
        given: withText.length,
        people_who_commented: new Set(withText.map((r) => r.person_key).filter(Boolean)).size,
        redacted: withText.filter((r) => r.comments_redacted).length,
        // `calls` arrives newest-first, so this is already in the right order.
        recent: said.slice(0, 40).map((r) => ({
          conversation_id: r.conversation_id, started_at: r.started_at,
          respondent: who(r), response_seq: r.response_seq, text: r.open_comments,
        })),
      };
    })(),
    // Should always be 0. The prompt forbids surveying on a transfer, so anything here means the
    // gate leaked and the pre-transfer failure mode is back. Surfaced as an alarm, not a statistic.
    leaked_pre_transfer: calls.filter((r) => r.offer_context === "pre_transfer").length,

    // Calls a human should listen to. The survey already captured the Dana call correctly - a 3, a
    // negative sentiment read, and a comment about Robin remarking on the member's age - and the
    // page showed none of it, because nothing here ever read the sentiment column. A rating alone
    // would have missed it: 3 out of 5 is not a bad score, and the complaint was about tone.
    review: (() => {
      const flagged = calls.filter((r) => r.survey_offered && r.needs_review);
      return {
        n: flagged.length,
        calls: flagged.slice(0, 25).map((r) => ({
          conversation_id: r.conversation_id, started_at: r.started_at,
          respondent: who(r), topic: r.topic || r.plan_topic,
          satisfaction_score: r.satisfaction_score, sentiment: r.overall_sentiment,
          nps_score: r.nps_score, nps_band: r.nps_band, voice_score: r.voice_score,
          preference: r.preference, comment: r.open_comments,
        })),
      };
    })(),

    // Every answered CALL, newest first — repeats included on purpose. The page's call browser
    // reads this, and a person's later calls are exactly what makes changed_mind auditable.
    verbatims: calls
      .filter((r) => r.prefer_agent_raw || r.nps_raw || r.voice_raw || r.satisfaction_raw)
      .slice(0, 300)
      .map((r) => ({
        conversation_id: r.conversation_id,
        started_at: r.started_at,
        respondent: who(r),
        response_seq: r.response_seq,
        duration_seconds: r.duration_seconds,
        topic: r.topic || r.plan_topic,
        satisfaction: r.satisfaction_raw,
        satisfaction_score: r.satisfaction_score,
        nps: r.nps_raw,
        nps_score: r.nps_score,
        nps_band: r.nps_band,
        voice: r.voice_raw,
        voice_score: r.voice_score,
        sentiment: r.overall_sentiment,
        needs_review: r.needs_review === true,
        prefer_agent: r.prefer_agent_raw,
        preference: r.preference,
        would_recommend: r.would_recommend,
        would_recommend_raw: r.would_recommend_raw,
        open_comments: r.open_comments,
        comments_redacted: r.comments_redacted,
      })),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const [events, questions, scores, memberAgg, asked, gapStatus] = await Promise.all([
      sb(`ai_call_events?provider=eq.elevenlabs&select=conversation_id,started_at,duration_seconds,topic,outcome,transfer_reason,auth_outcome,subject_ref,overall_sentiment,security_flag,security_detail&order=started_at.desc.nullslast`),
      sb(`curated_questions?active=eq.true&select=question_key,category,question_text,sort_order&order=sort_order.asc`),
      sb(`call_question_scores?select=conversation_id,question_key,question_text,asked,answer_text,quality_score,quality_rating,grounding,unsupported_claims,contradicted_claims,graded_against,sentiment,reviewed,reviewer_note`),
      sb(`members?select=consented`),
      sb(`call_questions?select=conversation_id,canonical_key,canonical_question,category,asked_text,answered,fail_reason,matched_question_key`),
      sb(`gap_requests?select=canonical_key,status,note,resolved_slug`),
    ]);

    // The survey is a TEMPORARY testing instrument, not part of the permanent quality picture — the
    // grader is that. It reads survey_people (one row per tester, for every
    // number a decision is quoted from) and survey_answers (one row per call, for adherence and
    // the call browser). Both exclude pre-survey calls on their own — see migration 009. Deliberately
    // self-contained so it can be deleted in one block when the customer wave closes.
    // Failing soft: a survey outage must never take the rest of the dashboard down with it.
    let survey = null;
    try {
      const [responseRows, callRows] = await Promise.all([surveyResponses(), surveyCalls()]);
      survey = summariseSurvey(responseRows, callRows);
    } catch (e) {
      console.error("survey block failed (dashboard continues without it):", String(e.message || e));
    }

    const totalTesters = memberAgg.length;
    const consented = memberAgg.filter((m) => m.consented).length;

    // ---- Security: authentication outcomes + any PII/credential flag ----
    const auth = { verified: 0, failed: 0, not_attempted: 0 };
    for (const e of events) if (auth[e.auth_outcome] != null) auth[e.auth_outcome]++;
    const totalAuth = auth.verified + auth.failed + auth.not_attempted;
    const flags = events.filter((e) => e.security_flag);
    const security = {
      verdict: flags.length === 0 ? "Pass" : "Review",
      verified: auth.verified, failed: auth.failed, not_attempted: auth.not_attempted,
      total_auth: totalAuth,
      verified_pct: totalAuth ? Math.round((auth.verified / totalAuth) * 100) : null,
      flags: flags.length,
      flag_detail: flags.map((f) => ({ ref: f.subject_ref || f.conversation_id, detail: f.security_detail || "flagged" })),
    };

    // ---- Per-question aggregation from the grader's scores ----
    const scored = scores.filter((s) => s.asked !== false);
    const byKey = new Map();
    for (const s of scored) {
      if (!byKey.has(s.question_key)) byKey.set(s.question_key, []);
      byKey.get(s.question_key).push(s);
    }

    // The grid is built from what callers ACTUALLY ASKED, not from a fixed checklist. The old
    // version mapped over curated_questions, so the moment the grader stopped keying on curated ids
    // — which is exactly what made it tenant-agnostic — every row would have read zero. Observed
    // questions are the union of graded answers and the demand record, newest evidence wins for the
    // label; curated_questions now only supplies a nicer label when it happens to know one.
    const observed = new Map(); // key -> { label, category }
    for (const a of asked) {
      if (!a.canonical_key) continue;
      if (!observed.has(a.canonical_key))
        observed.set(a.canonical_key, { label: a.canonical_question || a.canonical_key, category: a.category || null });
    }
    for (const s2 of scored) {
      if (!s2.question_key || observed.has(s2.question_key)) continue;
      observed.set(s2.question_key, { label: s2.question_text || s2.question_key, category: null });
    }
    // Curated entries that were never asked still show up, so "not asked" stays meaningful.
    for (const qq of questions) {
      if (!observed.has(qq.question_key))
        observed.set(qq.question_key, { label: LABEL[qq.question_key] || qq.question_text, category: qq.category });
    }

    // How often each question was asked overall, and how often it went unanswered.
    const demand = new Map();
    for (const a of asked) {
      if (!a.canonical_key) continue;
      const d = demand.get(a.canonical_key) || { asked: 0, unanswered: 0 };
      d.asked += 1;
      if (!a.answered) d.unanswered += 1;
      demand.set(a.canonical_key, d);
    }

    const qRows = [...observed.entries()].map(([key, meta]) => {
      const qq = { question_key: key, category: meta.category, question_text: meta.label };
      const rows = byKey.get(key) || [];
      const dem = demand.get(key) || { asked: 0, unanswered: 0 };
      const quals = rows.map((r) => num(r.quality_score)).filter((x) => x != null);
      const sents = rows.map((r) => sentBucket(r.sentiment)).filter(Boolean);
      const pos = sents.filter((x) => x === "positive").length;
      const neg = sents.filter((x) => x === "negative").length;
      const net = sents.length ? Math.round(((pos - neg) / sents.length) * 100) : null;
      const grounds = rows.map((r) => r.grounding).filter(Boolean);
      return {
        key: qq.question_key,
        category: qq.category,
        cat_label: CATLABEL[qq.category] || qq.category || "Uncategorised",
        label: LABEL[qq.question_key] || qq.question_text,
        // asked = how many times a caller raised it; scored = how many of those got graded.
        asked: Math.max(dem.asked, rows.length),
        unanswered: dem.unanswered,
        scored: rows.length,
        ungrounded: grounds.filter((g) => g === "unsupported" || g === "contradicted").length,
        no_source: grounds.filter((g) => g === "no_source").length,
        quality: quals.length ? Number(avg(quals).toFixed(1)) : null,
        net_sentiment: net,
        neg_pct: sents.length ? Math.round((neg / sents.length) * 100) : null,
        answers: rows.map((r) => ({
          text: r.answer_text || "",
          quality: num(r.quality_score),
          grounding: r.grounding || null,
          graded_against: Array.isArray(r.graded_against) ? r.graded_against : [],
          sentiment: sentBucket(r.sentiment),
          note: r.reviewer_note || null,
        })),
      };
    });

    qRows.sort((a, b) => (b.asked - a.asked) || ((a.quality ?? 9) - (b.quality ?? 9)));

    // ---- Experience: quality + sentiment across everything graded ----
    const allQuals = scored.map((s) => num(s.quality_score)).filter((x) => x != null);
    const callSents = events.map((e) => sentBucket(e.overall_sentiment)).filter(Boolean);
    const sPos = callSents.filter((x) => x === "positive").length;
    const sNeg = callSents.filter((x) => x === "negative").length;
    const experience = {
      avg_quality: allQuals.length ? Number(avg(allQuals).toFixed(1)) : null,
      scored_count: scored.length,
      graded: allQuals.length > 0,
      sentiment: {
        positive: sPos,
        neutral: callSents.filter((x) => x === "neutral").length,
        negative: sNeg,
        mixed: callSents.filter((x) => x === "mixed").length,
      },
      net_sentiment: callSents.length ? Math.round(((sPos - sNeg) / callSents.length) * 100) : null,
    };

    // ---- Coverage: which questions exercised, how many testers took part ----
    const askedKeys = new Set(qRows.filter((r) => r.asked > 0).map((r) => r.key));
    const testers = new Set(events.map((e) => e.subject_ref).filter(Boolean));
    const coverage = {
      asked_questions: askedKeys.size,
      total_questions: questions.length,
      testers_participated: testers.size,
      total_testers: totalTesters,
      consented,
    };

    // ---- Review queue: security flags + weak answers + verification failures ----
    const review = [];
    for (const f of flags)
      review.push({ topic: "Security flag", ref: f.subject_ref || f.conversation_id, reason: f.security_detail || "PII/credential concern", meta: `${f.outcome || "?"} · ${sentBucket(f.overall_sentiment) || "?"}` });
    for (const e of events.filter((e) => e.auth_outcome === "failed"))
      review.push({ topic: "Verification failed", ref: e.subject_ref || e.conversation_id, reason: "Caller could not be verified", meta: `${e.outcome || "?"} · ${sentBucket(e.overall_sentiment) || "?"}` });
    for (const s of scored.filter((s) => num(s.quality_score) != null && num(s.quality_score) < 3.0))
      review.push({ topic: LABEL[s.question_key] || s.question_key, ref: s.conversation_id, reason: s.reviewer_note || "Weak answer (quality < 3.0)", meta: `quality ${num(s.quality_score).toFixed(1)}` });

    // ---- Utilization: of every question callers actually asked Robin, how many did she answer? ----
    // Robin is the front door, so this is a top-of-funnel read — but the denominator is only the calls
    // ROUTED to her, which the dashboard states explicitly so the number is never over-claimed.
    const totalAsked = asked.length;
    const answeredCount = asked.filter((a) => a.answered).length;
    const byReason = {};
    for (const a of asked) if (!a.answered) byReason[a.fail_reason || "no_content"] = (byReason[a.fail_reason || "no_content"] || 0) + 1;

    // Unanswered questions grouped into a demand-ranked content queue.
    const statusBy = new Map(gapStatus.map((g) => [g.canonical_key, g]));
    const gapMap = new Map();
    for (const a of asked) {
      if (a.answered) continue;
      const g = gapMap.get(a.canonical_key) || {
        canonical_key: a.canonical_key,
        question: a.canonical_question,
        category: a.category,
        count: 0,
        reasons: {},
        samples: [],
        calls: [],
      };
      g.count++;
      const r = a.fail_reason || "no_content";
      g.reasons[r] = (g.reasons[r] || 0) + 1;
      if (a.asked_text && g.samples.length < 3) g.samples.push(a.asked_text);
      if (a.conversation_id) g.calls.push(a.conversation_id);
      gapMap.set(a.canonical_key, g);
    }
    const gaps = [...gapMap.values()]
      .map((g) => {
        const st = statusBy.get(g.canonical_key);
        // The dominant reason drives what a human should DO about it.
        const top = Object.entries(g.reasons).sort((a, b) => b[1] - a[1])[0];
        return {
          ...g,
          top_reason: top ? top[0] : "no_content",
          status: st?.status || "new",
          note: st?.note || null,
          resolved_slug: st?.resolved_slug || null,
        };
      })
      // "Write an article" gaps first — guardrail/out-of-scope aren't content problems.
      .sort((a, b) => {
        const actionable = (x) => (x.top_reason === "no_content" || x.top_reason === "not_retrieved" ? 0 : 1);
        return actionable(a) - actionable(b) || b.count - a.count;
      });

    const utilization = {
      total_asked: totalAsked,
      answered: answeredCount,
      pct: totalAsked ? Math.round((answeredCount / totalAsked) * 100) : null,
      by_reason: byReason,
      // Content-addressable share: excludes guardrail declines and out-of-scope, which no article fixes.
      addressable_gap: (byReason.no_content || 0) + (byReason.not_retrieved || 0),
      denominator_note: "questions asked on calls routed to Robin",
    };

    const recent = events.slice(0, 20).map((e) => ({
      conversation_id: e.conversation_id,
      started_at: e.started_at,
      duration_seconds: e.duration_seconds,
      topic: e.topic,
      outcome: e.outcome,
      auth_outcome: e.auth_outcome,
      sentiment: sentBucket(e.overall_sentiment),
      subject_ref: e.subject_ref,
    }));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      window: { members: totalTesters, consented, calls: events.length },
      security, experience, coverage, utilization,
      survey,
      gaps,
      questions: qRows,
      recent_calls: recent,
      review_queue: review,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
