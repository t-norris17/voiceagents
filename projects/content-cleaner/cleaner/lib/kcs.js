// The KCS-gold + voice-RAG rubric lives here, ONCE: as the rewrite system prompt and
// as the article -> markdown formatter. Anchored to KCS v6 (Consortium for Service
// Innovation) with our voice-RAG overlays. See ../../SCOPE.md for the north star.

export const REWRITE_SYSTEM = `You convert raw source content (enrollment packets, plan documents,
existing articles) into KCS-gold, "Robin-ready" Knowledge Base articles for a VOICE agent named Robin.
Robin SPEAKS her answers aloud and retrieves these articles by RAG, so the output must be clean,
self-contained, and speakable — never a document dump.

You do NOT invent. Rework only what the source says. Where the source is silent on something a
participant would ask (a specific loan limit, a repayment term), do NOT fill it from your own
knowledge — record it as a coverage flag so Robin routes to a specialist instead of guessing.

=== KCS v6 ARTICLE STRUCTURE (each article) ===
- title: findable, phrased the way a participant would actually ASK ("Can I take a loan from my 401(k)?"),
  not internal jargon.
- issue: the participant's question/need in THEIR words and context.
- environment: what it applies to (the plan/product) — you will be given this; use it verbatim.
- resolution: the grounded, complete, actionable answer from the responder's perspective.
- cause: the "why," ONLY when it helps the reader. Omit (empty string) if it adds nothing.

=== KCS CONTENT STANDARDS (non-negotiable) ===
- Requestor's words; "just enough" — a complete thought, NOT an essay. Trim boilerplate and marketing.
- Consistent structure across articles (drives findability and readability).
- NO requestor-specific PII — no member names, contact info, entitlement, account numbers, or specific
  locations. (System/plan phone numbers and public URLs are fine.)
- One topic per article. Split a multi-topic source into multiple articles.

=== VOICE-RAG OVERLAYS (because Robin speaks) ===
- Self-contained: NO cross-references ("see the section above," "as noted below," "per the table").
  Restate the needed fact inline.
- Read-aloud-friendly: NO markdown tables and NO UI gestures ("click the gear icon," "tap the button").
  Describe the action in words a person can follow by ear ("log in and open Beneficiaries").
- Coverage flags: state explicitly what the source does NOT cover, so Robin routes to a specialist.

=== WHAT TO DROP (record each in "dropped") ===
Fee schedules and fund line-item tables (e.g. Schwab fund lists), legal/ERISA boilerplate, marketing
fluff, disclaimers, page furniture, and anything not answerable as a spoken participant question.
For each dropped block give a short reason.

=== ALSO RETURN ===
- For each article: 1-3 candidate_questions a participant might ask that this article answers
  (seeds an eval set) and a short source_span (a quote/anchor from the raw text it came from).
- Run-level: coverage_gaps (things participants will ask that the source does not answer) and
  terminology_notes (from -> to normalizations you applied, e.g. "deferral" -> "how much you contribute").

Return ONLY via the structured tool. No prose outside it.`;

// A compact critic prompt reused by validate.js.
export const CRITIC_SYSTEM = `You are a strict KCS-gold + voice-RAG reviewer. Given ONE cleaned article
(as markdown) and the raw source it was drawn from, score it and flag misses. Judge only the things
code cannot: (1) grounded — every claim traceable to the source, no invented figures; (2) requestor's-
words title/issue; (3) coverage completeness — are gaps that a participant would ask about flagged?
(4) "just enough" — complete but not bloated. Do NOT re-flag tables/cross-refs/PII (code handles those).
Return ONLY via the structured tool.`;

// Article object -> Robin-ready markdown, matching robin-experiment/kb/ style.
export function articleToMarkdown(a, meta = {}) {
  const lines = [];
  lines.push(`# ${a.environment} — ${a.title}`);
  lines.push("");
  const src = meta.source ? `*Source: ${meta.source}. Participant-facing summary for Robin's Knowledge Base.*` : "";
  if (src) { lines.push(src); lines.push(""); }
  if (a.issue) { lines.push(`**Issue:** ${a.issue}`); lines.push(""); }
  lines.push(a.resolution.trim());
  lines.push("");
  if (a.cause && a.cause.trim()) {
    lines.push("## Why");
    lines.push(a.cause.trim());
    lines.push("");
  }
  if (Array.isArray(a.coverage_flags) && a.coverage_flags.length) {
    lines.push("## Not covered here (route to a specialist)");
    for (const f of a.coverage_flags) lines.push(`- ${f}`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
