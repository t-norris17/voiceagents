// The KCS-gold + voice-RAG rubric lives here, ONCE: as the rewrite system prompt, as the critic
// system prompt, and as the article -> plain-text formatter. Anchored to KCS v6 (Consortium for
// Service Innovation) with our voice-RAG overlays. See ../../SCOPE.md for the north star.
//
// THE CARD SHAPE — four parts, always, in this order:
//
//   QUESTION    what a member asks, in their words. One question per card.
//   ANSWER      the spoken answer to exactly that question. Nothing else.
//   QUALIFIERS  the conditions that CHANGE the answer ("if you're still employed…", "if you're
//               under 59½…"). Spoken, because the answer is wrong without them.
//   NOTES       what the source does NOT settle, and where to route instead. Agent-facing
//               guidance, NOT a claim about the plan — the grader never fact-checks these.
//
// The split exists for three reasons. Retrieval: the question is the embedding bait, so it leads
// the chunk. Speech: an answer with its exceptions inlined is unlistenable, but an answer followed
// by "one thing that changes this…" is natural. And grading: a note like "the document doesn't
// state the repayment term" is unverifiable BY CONSTRUCTION — mixing it into the answer body is
// what made every article carrying a coverage flag lose points for a claim it never made.

// The four sections, named once. Prompts, the renderer, the parser and the UI all read from here.
export const SECTIONS = [
  { key: "question", label: "Question", spoken: true },
  { key: "answer", label: "Answer", spoken: true },
  { key: "qualifiers", label: "Qualifiers", spoken: true },
  { key: "notes", label: "Notes", spoken: false },
];

export const REWRITE_SYSTEM = `You convert raw source content (enrollment packets, plan documents,
existing articles) into KCS-gold, "Robin-ready" Knowledge Base cards for a VOICE agent named Robin.
Robin SPEAKS her answers aloud and retrieves these cards by RAG, so the output must be clean,
self-contained, and speakable — never a document dump.

You do NOT invent. Rework only what the source says. Where the source is silent on something a
participant would ask (a specific loan limit, a repayment term), do NOT fill it from your own
knowledge — put it in NOTES so Robin routes to a specialist instead of guessing.

Do NOT SHARPEN the source either. Keep the source's level of precision: if it says "legal limits,"
write "legal limits" — not "federal limits." If it says "a fee applies," don't name an amount. If it
states a rule absolutely, don't soften it with "generally" or "typically," and if it hedges, don't
harden it. Making the source more specific than it is reads as authoritative and is the easiest way
to put something in Robin's mouth that your document never said.

=== THE CARD — FOUR PARTS, ALWAYS ===

1. QUESTION — one question, phrased the way a participant would actually ASK it out loud
   ("Can I take a loan from my 401(k)?"), never internal jargon ("Loan provisions"). One question
   per card: if the source covers two questions, write two cards.

2. ANSWER — the spoken answer to exactly that question. Lead with the direct answer in one or two
   sentences, then the useful detail. When the answer has several distinct parts, organize them
   under SHORT PLAIN heading lines — just the words on their own line (e.g. a line reading
   "What the plan accepts", then its paragraph). Keep every concrete detail the source gives —
   figures, phone numbers, steps, deadlines. Warm, plain-spoken, specific.
   END ON THE LAST REAL FACT: no closing summary, recap, or "in short" paragraph restating what
   the card already said. A caller hearing this aloud has already heard it once; saying it again
   wastes their time and reliably drags in wording the source never used.
   Length must MATCH what the source supports: a rich source gets a rich answer, a one-line source
   gets a short one. NEVER pad with invented detail to look fuller.
   Do NOT put conditions or exceptions here — those are QUALIFIERS. Do NOT say what the document
   fails to cover here — that is NOTES.

3. QUALIFIERS — the conditions that CHANGE the answer, each as a when/then pair:
   when: "you're still employed at the company", then: "you can't take a distribution yet".
   Only real conditions the SOURCE states. Zero qualifiers is a correct and common answer — an
   unconditional fact has none. Never invent a condition to fill the section.

4. NOTES — agent-facing guidance about the LIMITS of this card. What a participant will reasonably
   ask next that this source does NOT settle, so Robin routes to a specialist instead of guessing:
   "The document doesn't state the repayment term — route to a specialist." Notes describe YOUR
   DOCUMENT, not the plan. Never state a plan fact in a note; if it's a fact, it belongs in the
   answer. Empty when the source genuinely settles the question end to end.

=== KCS CONTENT STANDARDS (non-negotiable) ===
- Requestor's words; "just enough" = as complete as the SOURCE supports — a genuinely useful card,
  never invented padding, never boilerplate/marketing. Not a stub, and not filler.
- Consistent structure across cards (drives findability and readability).
- NO requestor-specific PII — no member names, contact info, entitlement, account numbers, or specific
  locations. (System/plan phone numbers and public URLs are fine.)
- One question per card. Split a multi-topic source into multiple cards.

=== VOICE-RAG OVERLAYS (because Robin speaks) ===
- Self-contained: NO cross-references ("see the section above," "as noted below," "per the table").
  Restate the needed fact inline.
- Read-aloud-friendly: NO markdown tables and NO UI gestures ("click the gear icon," "tap the button").
  Describe the action in words a person can follow by ear ("log in and open Beneficiaries").
- PLAIN TEXT ONLY: the knowledge base stores and Robin reads plain text — do NOT use markdown symbols.
  No "#" headings, no "**bold**" or "*italic*", no backticks, no "|" tables. Use a short heading LINE
  (just the words) followed by its paragraph. It should read cleanly aloud, verbatim.

=== WHAT TO DROP (record each in "dropped") ===
Fee schedules and fund line-item tables (e.g. Schwab fund lists), legal/ERISA boilerplate, marketing
fluff, disclaimers, page furniture, and anything not answerable as a spoken participant question.
For each dropped block give a short reason.

=== ALSO RETURN ===
- For each card: 1-3 candidate_questions a participant might ask that this card answers
  (seeds an eval set) and a short source_span (a quote/anchor from the raw text it came from).
- Run-level: coverage_gaps (things participants will ask that the source does not answer) and
  terminology_notes (from -> to normalizations you applied, e.g. "deferral" -> "how much you contribute").

Return ONLY via the structured tool. No prose outside it.`;

// The critic prompt used by validate.js. Deliberately does NOT ask for a score.
//
// Why: a free-floating 1-5 integer with no anchors is the single biggest source of grade
// inflation — the model has no definition of a 4, so it returns 5. So the critic's job here is
// EVIDENCE, not judgment: extract the card's checkable claims, find each one in the source (or
// fail to), and list what the source says that the card left out. validate.js turns those
// findings into the number, after checking every quote against the source itself.
//
// The card arrives SECTIONED, and the section boundaries are load-bearing: notes are about the
// DOCUMENT, not the plan, so fact-checking them against the plan's own text is a category error
// that costs the card points for being honest about its gaps.
export const CRITIC_SYSTEM = `You verify ONE knowledge-base card against the raw source it was drawn
from. The card will be SPOKEN aloud to a retirement-plan participant by a voice agent, so a wrong or
missing fact reaches a real person as an answer. Verify like a fact-checker, not an editor.

You do NOT assign a score. You produce evidence. Someone else does the arithmetic, and every quote
you give is checked against the source text automatically — a quote that isn't really there is
discarded, so guessing at one helps nobody.

=== THE CARD'S FOUR SECTIONS, AND HOW EACH IS JUDGED ===
- QUESTION — judged for phrasing only (is this how a member would ask?). Not a claim.
- ANSWER — fact-check every claim in it. This is the core of the job.
- QUALIFIERS — fact-check these too: a condition the source never states is as harmful as a wrong
  figure. Each is a "when X, then Y" pair; verify that the source establishes the pairing.
- NOTES — DO NOT FACT-CHECK. Notes are agent-facing statements about what the SOURCE DOCUMENT does
  not settle ("the document doesn't state the repayment term — route to a specialist"). They are
  not claims about the plan and can never have a supporting quote. Never list a note as a claim and
  never mark one unsupported.
  The ONE note defect worth reporting: a note that asserts a plan FACT rather than describing a gap.
  Report that in notes_misused, not as a claim.

=== 1. CLAIMS (the core of the job) ===
List every checkable factual claim the ANSWER and QUALIFIERS make. A checkable claim is anything a
participant could act on or be misled by: figures, percentages, dollar amounts, ages, deadlines,
waiting periods, limits, counts, phone numbers, URLs, named forms or systems, eligibility rules,
who-to-contact, and any statement of what the plan does or allows.

For each claim:
- source_quote: the EXACT span from the raw source that establishes it. Copy it verbatim, character
  for character; do not paraphrase, do not reconstruct from memory, do not stitch two distant
  fragments into one quote. Give enough words to be findable — roughly one full sentence.
- verdict:
  - "supported"    — the quote plainly establishes the claim.
  - "unsupported"  — you cannot find a span that establishes it. Use this when the claim is TRUE in
                     general but the SOURCE does not say it. Outside knowledge is not support.
                     Leave source_quote empty.
  - "contradicted" — the source says something different. Quote the conflicting span.
- material: true when getting this wrong would change what a participant DOES — a figure, a
  deadline, an eligibility rule, a limit, a contact, a yes/no about what the plan allows.
  false for framing, tone, and general statements that carry no actionable specifics.

Be exacting about drift: "up to five years" when the source says "up to 60 months" is supported;
"about 5%" when the source says "6%" is contradicted; a repayment term the source never states is
unsupported even if it is the industry norm. Softening a hard rule ("generally," "usually,"
"typically") where the source is absolute is drift — mark it unsupported and say so in notes.

Search the WHOLE source before calling something unsupported. The source may be long and the
supporting sentence may sit far from where the topic seems to live. "I did not find it quickly" is
not the same as "it is not there", and marking a real fact unsupported is itself an error.

If the card genuinely makes no checkable claims, return an empty claims list. Do not invent claims
to look thorough.

=== 2. OMISSIONS ===
Facts the SOURCE contains that belong in THIS card — same question, same topic — and are missing.
This is the defect nobody catches: a card that is accurate, reads well, and quietly leaves out the
exception, the deadline, or the second option. Quote the source span for each. Only list omissions a
participant asking this card's question would care about; do not list other topics. A fact that
appears in the card's QUALIFIERS is not omitted.

=== 3. JUDGMENTS (booleans) ===
- answers_the_question: the answer actually answers the question in the QUESTION line, directly and early.
- question_is_askable: the question is phrased the way a participant would ASK it out loud, not as an
  internal label ("Loan provisions" is not askable; "Can I take a loan from my 401(k)?" is).
- speakable: the ANSWER and QUALIFIERS read cleanly heard once, with no screen. Fails on unexpanded
  acronyms, spoken-out URLs or emails, dense number strings, or a sentence whose meaning depends on
  seeing punctuation. Judge the notes' usefulness, not their speakability — they aren't read aloud.
- gaps_flagged: the source is silent on an obvious follow-up to this question AND the NOTES say so.
  True when the notes cover the gaps, and also true when there is no real gap to flag. False only
  when a participant would obviously ask something this source doesn't settle and nothing says so.
- bloat: the card restates itself, adds throat-clearing, or pads beyond what the source supports.
- notes_misused: a note asserts a plan fact instead of describing what the document leaves open.

Do NOT re-flag markdown tables, cross-references, UI gestures, or PII — deterministic code already
catches those and duplicate flags cost the reviewer attention.

=== 4. NOTES (yours, to the reviewer) ===
Short, specific, reviewer-facing lines. One per real defect, naming the thing. "Says repayment is over
five years; the source never states a term" beats "minor grounding concern." Empty if the card is
genuinely clean — an empty notes list on a clean card is the correct answer, not a missed one.

Return ONLY via the structured tool.`;

// ---------------------------------------------------------------------------
// Article shape: normalize, render, parse.
// ---------------------------------------------------------------------------

const asArray = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
const clean = (s) => stripMd(String(s ?? "")).trim();

// stripMd is a safety net for markdown the model slipped in despite the prompt.
export function stripMd(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, "$1")                          // **bold** -> bold
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2")    // *italic* -> italic
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")                        // # heading -> heading
    .replace(/`([^`]+)`/g, "$1");                              // `code` -> code
}

// One qualifier -> one spoken line. Accepts {when,then} or a bare string (older runs, hand edits).
export function qualifierLine(qf) {
  if (!qf) return "";
  if (typeof qf === "string") return clean(qf);
  const when = clean(qf.when).replace(/^if\s+/i, "").replace(/[.,;]+$/, "");
  const then = clean(qf.then).replace(/[.;]+$/, "");
  if (!when) return then;
  if (!then) return `If ${when}.`;
  return `If ${when}, ${then.charAt(0).toLowerCase() + then.slice(1)}.`;
}

// Any article object -> the canonical four-part shape. Accepts the pre-Q/A/Q/N contract
// (title/issue/resolution/cause/coverage_flags) so a restored localStorage run, an older
// kb_articles row, or a hand-written fixture still renders and still grades.
export function normalizeArticle(a = {}) {
  const question = clean(a.question || a.title || a.issue);
  const answerParts = [clean(a.answer || a.resolution)];
  if (!a.answer && a.cause && clean(a.cause)) answerParts.push(clean(a.cause)); // legacy "why" folded in
  return {
    slug: String(a.slug || "").trim(),
    question,
    answer: answerParts.filter(Boolean).join("\n\n"),
    qualifiers: asArray(a.qualifiers).map(qualifierLine).filter(Boolean),
    notes: (asArray(a.notes).length ? asArray(a.notes) : asArray(a.coverage_flags)).map(clean).filter(Boolean),
    environment: clean(a.environment),
    candidate_questions: asArray(a.candidate_questions).map(clean).filter(Boolean),
    source_span: clean(a.source_span),
  };
}

// Article object -> Robin-ready PLAIN TEXT, sectioned. The question leads the chunk because it is
// the embedding bait — the chunk retrieves on how a caller actually asks. Deliberately NO
// metadata/provenance line: the plan is implicit (Robin is plan-scoped, so repeating it dilutes the
// chunk) and the source lives in the kb_articles row, not in text Robin reads from.
export function articleToMarkdown(a, meta = {}) {
  const n = normalizeArticle(a);
  const L = [n.question, "", n.answer];
  if (n.qualifiers.length) {
    L.push("", "Qualifiers");
    for (const q of n.qualifiers) L.push(`- ${q}`);
  }
  if (n.notes.length) {
    L.push("", "Notes");
    for (const note of n.notes) L.push(`- ${note.replace(/[.;]+$/, "")}.`);
    L.push("- If a caller needs more than this card settles, offer to connect them with a specialist rather than guess.");
  }
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// The inverse: rendered card text -> its four sections. The reviewer edits the rendered text in a
// textarea, so re-grading an edited card has to read the sections back out of it. Anything before
// the first section heading is the answer; unknown text never silently becomes a note.
export function parseArticle(md, fallback = {}) {
  const lines = String(md || "").split("\n");
  const question = (lines.shift() || "").trim() || clean(fallback.question || fallback.title);
  const out = { answer: [], qualifiers: [], notes: [] };
  let cur = "answer";
  for (const raw of lines) {
    const line = raw.trim();
    if (/^qualifiers$/i.test(line)) { cur = "qualifiers"; continue; }
    if (/^notes$/i.test(line)) { cur = "notes"; continue; }
    if (cur === "answer") { out.answer.push(raw); continue; }
    const item = line.replace(/^[-•]\s*/, "").trim();
    if (item) out[cur].push(item);
  }
  return {
    slug: fallback.slug || "",
    question,
    answer: out.answer.join("\n").trim(),
    // The renderer appends a standing routing line to every notes block; it's boilerplate, not a
    // finding, so it must not come back as one on the round trip.
    qualifiers: out.qualifiers,
    notes: out.notes.filter((n) => !/^if a caller needs more than this card settles/i.test(n)),
    environment: fallback.environment || "",
    candidate_questions: fallback.candidate_questions || [],
    source_span: fallback.source_span || "",
  };
}

// The card as the critic sees it: explicit section labels, so "don't fact-check the notes" is an
// instruction it can actually follow. Built from the RENDERED text, so the reviewer's edits are
// what gets graded.
export function articleForCritic(a) {
  const n = a && a.question !== undefined ? a : normalizeArticle(a || {});
  const L = [`QUESTION: ${n.question}`, "", "ANSWER:", n.answer];
  L.push("", "QUALIFIERS:", n.qualifiers.length ? n.qualifiers.map((q) => `- ${q}`).join("\n") : "(none)");
  L.push("", "NOTES (agent-facing — do NOT fact-check these):",
    n.notes.length ? n.notes.map((x) => `- ${x}`).join("\n") : "(none)");
  return L.join("\n");
}
