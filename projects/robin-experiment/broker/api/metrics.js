// GET /api/metrics -> aggregated, read-only dashboard data for the Robin experiment.
// The service-role key stays server-side (lib/supabase.js); the browser only sees these
// aggregates. Three dimensions: Security (auth + PII), Experience (quality + sentiment),
// Coverage (which of the 25 curated questions have been exercised across the 50 testers).
//
// Everything is computed live from four tables. When call_question_scores is still empty
// (grader hasn't run), the per-question grid degrades gracefully to "not graded yet" rather
// than inventing numbers.
import { sb } from "../lib/supabase.js";

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
    const [events, questions, scores, memberAgg] = await Promise.all([
      sb(`ai_call_events?provider=eq.elevenlabs&select=conversation_id,started_at,duration_seconds,topic,outcome,transfer_reason,auth_outcome,subject_ref,overall_sentiment,security_flag,security_detail&order=started_at.desc.nullslast`),
      sb(`curated_questions?active=eq.true&select=question_key,category,question_text,sort_order&order=sort_order.asc`),
      sb(`call_question_scores?select=conversation_id,question_key,asked,answer_text,quality_score,quality_rating,sentiment,reviewed,reviewer_note`),
      sb(`members?select=consented`),
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

    const qRows = questions.map((qq) => {
      const rows = byKey.get(qq.question_key) || [];
      const quals = rows.map((r) => num(r.quality_score)).filter((x) => x != null);
      const sents = rows.map((r) => sentBucket(r.sentiment)).filter(Boolean);
      const pos = sents.filter((x) => x === "positive").length;
      const neg = sents.filter((x) => x === "negative").length;
      const net = sents.length ? Math.round(((pos - neg) / sents.length) * 100) : null;
      return {
        key: qq.question_key,
        category: qq.category,
        cat_label: CATLABEL[qq.category] || qq.category,
        label: LABEL[qq.question_key] || qq.question_text,
        asked: rows.length,
        quality: quals.length ? Number(avg(quals).toFixed(1)) : null,
        net_sentiment: net,
        neg_pct: sents.length ? Math.round((neg / sents.length) * 100) : null,
        answers: rows.map((r) => ({
          text: r.answer_text || "",
          quality: num(r.quality_score),
          sentiment: sentBucket(r.sentiment),
          note: r.reviewer_note || null,
        })),
      };
    });

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
      security, experience, coverage,
      questions: qRows,
      recent_calls: recent,
      review_queue: review,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
