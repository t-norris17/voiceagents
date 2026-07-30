// Closing the loop between "the dashboard says Robin couldn't answer this" and "someone wrote the
// article that answers it".
//
// The dashboard records a gap as a canonical question in the caller's words ("Can I take a loan?").
// The Knowledge Factory publishes an article whose title is also a question, plus 1-3
// candidate_questions. Nobody is going to keep those in sync by hand, so we match on meaning-ish
// overlap and let a human override.
//
// Deliberately NOT an LLM call: this runs inside the publish path, which is already slow and
// already spends money. A token-overlap score is predictable, free, and explainable — and the cost
// of a miss is a gap that stays open one extra cycle, not a wrong answer reaching a member.
import { sb } from "./supabase.js";

const q = (s) => encodeURIComponent(s);

// Words that carry no topic signal. Without this, "how do I change my contribution" and
// "how do I change my beneficiary" score as near-identical.
const STOP = new Set([
  "the", "and", "for", "are", "can", "you", "your", "yours", "how", "what", "when", "where", "why",
  "who", "does", "did", "will", "would", "should", "could", "have", "has", "had", "get", "got",
  "with", "from", "into", "about", "any", "all", "one", "there", "this", "that", "these",
  "those", "was", "were", "been", "being", "its", "it's", "i'm", "i've", "do", "don't", "not",
  "but", "than", "then", "them", "they", "their", "our", "ours", "his", "her", "hers",
]);

export function topicTokens(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9']+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

// Jaccard over topic words. Symmetric, 0..1, and stable enough to put a threshold on.
export function overlap(a, b) {
  const A = topicTokens(a), B = topicTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

// A published article's full question surface: its title plus the questions it says it answers.
export function articleQuestions(article) {
  const out = [String(article.title || "")];
  const cq = article.candidate_questions;
  if (Array.isArray(cq)) for (const c of cq) if (c) out.push(String(c));
  return out.filter(Boolean);
}

// How well does this article answer this gap? Best score across the article's question surface.
export function scoreMatch(gapQuestion, article) {
  let best = 0;
  for (const q2 of articleQuestions(article)) best = Math.max(best, overlap(gapQuestion, q2));
  return best;
}

// 0.5 = half the topic words shared. Tuned to be reluctant: a gap wrongly marked resolved
// disappears from the queue and nobody writes the article, which is the expensive failure.
// A gap left open just shows up again next time someone looks.
export const MATCH_THRESHOLD = 0.5;

// Called after a successful publish. Marks every open gap this article plausibly answers as
// resolved, recording which article did it. Best-effort: a failure here must never fail a publish
// that already reached ElevenLabs.
export async function resolveGapsFor(article, { threshold = MATCH_THRESHOLD } = {}) {
  const plan_id = String(article.plan_id || "");
  try {
    const open = await sb(
      `gap_requests?plan_id=eq.${q(plan_id)}&status=neq.resolved` +
        `&select=canonical_key,canonical_question,status`
    );
    if (!open || !open.length) return { checked: 0, resolved: [] };

    const hits = open
      .map((g) => ({ gap: g, score: scoreMatch(g.canonical_question, article) }))
      .filter((h) => h.score >= threshold);

    for (const h of hits) {
      await sb(`gap_requests?plan_id=eq.${q(plan_id)}&canonical_key=eq.${q(h.gap.canonical_key)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: {
          status: "resolved",
          resolved_slug: article.slug,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    }
    return {
      checked: open.length,
      resolved: hits.map((h) => ({ canonical_key: h.gap.canonical_key, question: h.gap.canonical_question, score: Number(h.score.toFixed(2)) })),
    };
  } catch (e) {
    return { checked: 0, resolved: [], error: String(e.message || e) };
  }
}
