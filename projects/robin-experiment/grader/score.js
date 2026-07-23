#!/usr/bin/env node
// Score calls for the Robin experiment.
//
//   node score.js                 # grade every ungraded call in ai_call_events
//   node score.js <conversation>  # grade one call by conversation_id
//
// For each call: run the deterministic security scan, then the LLM judge, then
// write per-question rows to call_question_scores and update the call's overall
// sentiment + security verdict on ai_call_events.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.  Node 18+.
import { sb } from "./lib/supabase.js";
import { scanSecurity } from "./lib/security.js";
import { judgeCall } from "./lib/judge.js";

async function loadQuestions() {
  return sb("curated_questions?active=eq.true&select=question_key,category,question_text,ideal_answer&order=sort_order");
}

// Calls that have a transcript but no scores yet (left join via a marker column).
async function loadUngraded(convId) {
  if (convId) {
    return sb(`ai_call_events?conversation_id=eq.${encodeURIComponent(convId)}&select=id,conversation_id,transcript`);
  }
  // graded=false is our own bookkeeping flag (see markGraded); fall back to all.
  return sb("ai_call_events?transcript=not.is.null&select=id,conversation_id,transcript,scored_at&order=started_at.desc");
}

async function scoreOne(row, questions) {
  const { conversation_id, transcript } = row;

  // 1. Deterministic security scan (never depends on the model).
  const det = scanSecurity(transcript);

  // 2. LLM judge.
  const graded = await judgeCall(transcript, questions);

  // 3. Merge security: deterministic OR judge.
  const secFlag = det.flag || graded.security.answered_before_verification || graded.security.social_engineering_complied;
  const secDetail = det.detail || graded.security.detail || null;

  // 4. Write per-question score rows.
  const rows = (graded.items || []).map((it) => ({
    conversation_id,
    question_key: it.question_key === "out_of_scope" ? null : it.question_key,
    question_text: it.question_text || null,
    asked: true,
    answer_text: it.answer_text || null,
    quality_rating: it.quality_rating || "unrated",
    quality_score: clamp(it.quality_score, 1, 5),
    sentiment: it.sentiment || null,
    sentiment_score: it.sentiment_score ?? null,
    graded_by: "llm",
  }));
  if (rows.length) {
    await sb("call_question_scores", { method: "POST", prefer: "return=minimal", body: rows });
  }

  // 5. Update the call-level verdict.
  await sb(`ai_call_events?conversation_id=eq.${encodeURIComponent(conversation_id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: {
      overall_sentiment: graded.overall_sentiment,
      security_flag: secFlag,
      security_detail: secDetail,
      scored_at: new Date().toISOString(),
    },
  });

  return { conversation_id, items: rows.length, security_flag: secFlag };
}

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

async function main() {
  const convId = process.argv[2] || null;
  const questions = await loadQuestions();
  if (!questions.length) throw new Error("no curated_questions found — seed them first");

  const calls = await loadUngraded(convId);
  const todo = calls.filter((c) => convId || !c.scored_at); // scored_at gates re-runs when present
  console.log(`Grading ${todo.length} call(s) against ${questions.length} questions...`);

  let ok = 0, failed = 0, flagged = 0;
  for (const row of todo) {
    try {
      const r = await scoreOne(row, questions);
      ok++;
      if (r.security_flag) flagged++;
      console.log(`  ${r.conversation_id}: ${r.items} answers graded${r.security_flag ? " · SECURITY FLAG" : ""}`);
    } catch (e) {
      failed++;
      console.error(`  ${row.conversation_id} FAILED: ${e.message}`);
    }
  }
  console.log(`\nDone. ${ok} graded, ${failed} failed, ${flagged} with a security flag.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
