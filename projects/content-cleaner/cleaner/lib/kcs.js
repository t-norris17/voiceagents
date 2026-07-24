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
- resolution: the FULL article body — write it as a natural knowledge-base article a voice agent can
  speak from, NOT a terse blurb and NOT a form. Lead with the direct answer in one or two sentences,
  then give the useful detail. When the answer has multiple distinct parts, organize them under SHORT
  PLAIN heading lines — just the words on their own line (e.g. a line reading "What the plan accepts",
  then its paragraph). NO markdown symbols anywhere: no "#", no "**bold**", no "*italic*", no backticks.
  Keep every concrete detail the source gives — figures, phone numbers, steps, deadlines. Warm, plain-
  spoken, specific. Do NOT restate the question as an "Issue:" line and do NOT add a "not covered"
  section — those are handled separately. Length must MATCH what the source supports: a rich source
  gets a rich, multi-section article; a one-line source gets a short one. NEVER pad with invented
  detail to look fuller.
- cause: the "why," ONLY when a short reason genuinely helps — and prefer to weave it into the
  resolution. Omit (empty string) otherwise.

=== KCS CONTENT STANDARDS (non-negotiable) ===
- Requestor's words; "just enough" = as complete as the SOURCE supports — a genuinely useful article,
  never invented padding, never boilerplate/marketing. Not a stub, and not filler.
- Consistent structure across articles (drives findability and readability).
- NO requestor-specific PII — no member names, contact info, entitlement, account numbers, or specific
  locations. (System/plan phone numbers and public URLs are fine.)
- One topic per article. Split a multi-topic source into multiple articles.

=== VOICE-RAG OVERLAYS (because Robin speaks) ===
- Self-contained: NO cross-references ("see the section above," "as noted below," "per the table").
  Restate the needed fact inline.
- Read-aloud-friendly: NO markdown tables and NO UI gestures ("click the gear icon," "tap the button").
  Describe the action in words a person can follow by ear ("log in and open Beneficiaries").
- PLAIN TEXT ONLY: the knowledge base stores and Robin reads plain text — do NOT use markdown symbols.
  No "#" headings, no "**bold**" or "*italic*", no backticks, no "|" tables. Use a short heading LINE
  (just the words) followed by its paragraph. It should read cleanly aloud, verbatim.
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

// Article object -> Robin-ready PLAIN TEXT. ElevenLabs' KB stores/displays plain text and Robin reads
// it raw, so we emit NO markdown symbols: a plain title line, a light metadata line, the article body
// (plain heading lines the model wrote), and — folded into a quiet sentence — a routing note for what
// the source doesn't cover. stripMd() is a safety net that removes any markdown the model slipped in
// (**bold**, *italic*, # headings, `code`). The "Issue:" label and "Not covered" heading are not
// rendered; that data lives in the structured result and the coverage/drop reports.
export function stripMd(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, "$1")                          // **bold** -> bold
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2")    // *italic* -> italic
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")                        // # heading -> heading
    .replace(/`([^`]+)`/g, "$1");                              // `code` -> code
}

export function articleToMarkdown(a, meta = {}) {
  const lines = [];
  lines.push(`${a.environment} — ${a.title}`);
  lines.push("");
  const bits = [`Plan: ${a.environment}`];
  if (meta.source) bits.push(`Source: ${meta.source}`);
  bits.push("voice-agent knowledge article");
  lines.push(bits.join(" · "));
  lines.push("");
  lines.push(stripMd(a.resolution).trim());
  lines.push("");
  if (a.cause && a.cause.trim()) { lines.push(stripMd(a.cause).trim()); lines.push(""); }
  if (Array.isArray(a.coverage_flags) && a.coverage_flags.length) {
    const gaps = a.coverage_flags.map((f) => stripMd(f).trim().replace(/[.;]+$/, "")).join("; ");
    lines.push(`If a caller needs specifics beyond this, route to a specialist rather than guess: ${gaps}.`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
