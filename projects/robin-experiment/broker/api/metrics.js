// GET /api/metrics -> aggregated, read-only dashboard data for the Robin experiment.
// The service-role key stays server-side (lib/supabase.js); the browser only sees these
// aggregates. Three dimensions: Security (auth + PII), Experience (quality + sentiment),
// Coverage (which of the 25 curated questions have been exercised across the 50 testers).
//
// Everything is computed live from four tables. When call_question_scores is still empty
// (grader hasn't run), the per-question grid degrades gracefully to "not graded yet" rather
// than inventing numbers.
import { sb } from "../lib/supabase.js";
import { computePipeline, sortByArrival, callState, arrivedAt } from "../lib/pipeline.js";

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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const [events, questions, scores, memberAgg, asked, gapStatus, noTranscript, ingest] = await Promise.all([
      // created_at and scored_at ride along so a call's position in the pipeline is answerable.
      // `started_at` is provider-reported and can be null; ordering on it alone buried those calls
      // at the end of the list, where the 20-row "recent calls" slice never reached them — a call
      // genuinely arrived, and genuinely didn't show up.
      sb(`ai_call_events?provider=eq.elevenlabs&select=conversation_id,started_at,created_at,scored_at,duration_seconds,topic,outcome,transfer_reason,auth_outcome,subject_ref,overall_sentiment,security_flag,security_detail&order=created_at.desc`),
      sb(`curated_questions?active=eq.true&select=question_key,category,question_text,sort_order&order=sort_order.asc`),
      sb(`call_question_scores?select=conversation_id,question_key,question_text,asked,answer_text,quality_score,quality_rating,grounding,unsupported_claims,contradicted_claims,graded_against,sentiment,reviewed,reviewer_note`),
      sb(`members?select=consented`),
      sb(`call_questions?select=conversation_id,canonical_key,canonical_question,category,asked_text,answered,fail_reason,matched_question_key`),
      sb(`gap_requests?select=canonical_key,status,note,resolved_slug`),
      // Calls with no transcript can never be graded, so they'd sit "pending" forever without
      // anything saying why. Cheap id-only query — the transcripts themselves are large.
      sb(`ai_call_events?provider=eq.elevenlabs&transcript=is.null&select=conversation_id,created_at&order=created_at.desc`),
      // Rejected webhooks. Optional: this table arrives with a migration, and the dashboard has to
      // keep working on a deployment that hasn't run it yet — so a miss degrades to "unknown",
      // never to a broken page.
      sb(`webhook_ingest_log?select=received_at,accepted,reason,detail,conversation_id,event_type,had_transcript&order=received_at.desc&limit=50`).catch(() => null),
    ]);

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

    // ---- Pipeline: where every call actually is, and what to do about the ones that are stuck ----
    const pipeline = computePipeline({ events, noTranscript, ingest });
    const noTranscriptIds = new Set((noTranscript || []).map((e) => e.conversation_id));

    // Newest first by ARRIVAL, not by the provider's start time, so a call with a missing or odd
    // start time still appears at the top instead of sinking below the 20-row cut.
    const recent = sortByArrival(events).slice(0, 20).map((e) => ({
      conversation_id: e.conversation_id,
      started_at: e.started_at,
      arrived_at: arrivedAt(e),
      duration_seconds: e.duration_seconds,
      topic: e.topic,
      outcome: e.outcome,
      auth_outcome: e.auth_outcome,
      sentiment: sentBucket(e.overall_sentiment),
      subject_ref: e.subject_ref,
      state: callState(e, noTranscriptIds), // what this call is waiting on
    }));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      window: { members: totalTesters, consented, calls: events.length },
      security, experience, coverage, utilization, pipeline,
      gaps,
      questions: qRows,
      recent_calls: recent,
      review_queue: review,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
