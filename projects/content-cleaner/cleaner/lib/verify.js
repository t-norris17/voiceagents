// Quote verification — the check that makes the critic's evidence honest in BOTH directions.
//
// The critic returns, per claim, a verdict and a verbatim span of the source. Nothing was checking
// that span. That let two opposite errors through, and the second one is what dragged real runs
// down to 2/5:
//
//   1. A quote the source never contained still counted as SUPPORT. A fabricated citation is worth
//      less than no citation, because it looks like proof.
//   2. A fact that IS in the source, which the critic simply didn't find in an 85 KB document, was
//      scored as an invented claim at full price. "I didn't find it" is not "it isn't there."
//
// So every quote is located in the raw source here, in code, before it is allowed to count. Claims
// the check can't settle become `unverified`: surfaced to the reviewer, costed at zero. A grader
// that can't find its own evidence has produced a question, not a finding.

// Normalize for matching only — never for display. Folds the differences that survive a PDF
// extraction (curly quotes, ligature-ish dashes, hard-wrapped whitespace, soft hyphens) so a real
// quote isn't missed on typography alone.
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/­/g, "")            // soft hyphen
    .replace(/[   ]/g, " ")
    .replace(/-\s+/g, "-")             // hyphenation across a line break
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(("the a an and or of to in for on at by with from as is are was were be been it its this that these those "
  + "you your they their we our not no if when then than may can will shall must should would could have has had do does did "
  + "any all each per which who whom what how why also more most other such into over under about after before").split(" "));

const tokens = (s) => norm(s).replace(/[^a-z0-9$%.\s-]/g, " ").split(/\s+/).filter(Boolean);
const contentWords = (s) => tokens(s).filter((t) => !STOP.has(t) && t.length >= 4 && !/^\d/.test(t));

// Figures are what a caller acts on, so they're matched on their own terms: digits only, with
// separators stripped, so "$1,000" in a card matches "1000" in the source and vice versa.
const NUM_RE = /\d[\d,.]*/g;
export function figures(s) {
  const out = [];
  for (const m of norm(s).match(NUM_RE) || []) {
    const v = m.replace(/,/g, "").replace(/\.$/, "");
    if (v && v !== "." ) out.push(v);
  }
  return out;
}

// Is `quote` really in `sourceNorm`?
//   true    — found (exactly, or as a near-match after normalization)
//   false   — searched and not there
//   null    — too short or empty to decide; the caller must not treat this as either
export function quoteFoundIn(sourceNorm, quote) {
  const q = norm(quote);
  if (q.length < 15) return null;                 // a 2-word "quote" proves nothing either way
  if (sourceNorm.includes(q)) return true;

  // Near-match fallback. Extraction artifacts (a stray page number mid-sentence, a dropped bullet
  // glyph) break an exact match on text that is genuinely present, so accept a quote whose content
  // words and figures all appear inside one window of the source.
  const words = contentWords(q);
  const nums = figures(q);
  if (words.length < 3) return null;
  const hits = words.filter((w) => sourceNorm.includes(w)).length;
  if (hits / words.length < 0.85) return false;
  if (nums.length && !nums.every((n) => sourceNorm.includes(n))) return false;

  // Content words are present — but scattered across the document isn't a quote. Require them to
  // co-occur inside a window roughly the quote's own length, so "every word appears somewhere in
  // an 85 KB packet" can never masquerade as a citation.
  const anchor = words.reduce((a, b) => (a.length >= b.length ? a : b), "");
  const span = Math.max(80, q.length);
  let from = 0;
  for (;;) {
    const at = sourceNorm.indexOf(anchor, from);
    if (at < 0) return false;
    const win = sourceNorm.slice(Math.max(0, at - span), at + span);
    if (words.filter((w) => win.includes(w)).length / words.length >= 0.85) return true;
    from = at + anchor.length;
  }
}

// Does the SOURCE look like it contains this claim, independent of the critic's quote? Used only to
// rescue a claim the critic marked unsupported: if every figure in it appears in the document and
// most of its distinctive words do, the critic more likely missed the sentence than the writer
// invented the fact. Deliberately conservative — this downgrades a finding to "check this", it
// never upgrades anything to supported.
export function claimCorroborated(sourceNorm, claim) {
  const nums = figures(claim);
  const words = contentWords(claim);
  if (nums.length) return nums.every((n) => sourceNorm.includes(n)) && words.some((w) => sourceNorm.includes(w));
  if (words.length < 3) return false;
  return words.filter((w) => sourceNorm.includes(w)).length / words.length >= 0.8;
}

// The verdict the SCORE uses, after checking the critic's own evidence.
//
//   supported    the quote is really in the source
//   unsupported  the critic found nothing and neither did we — this one costs
//   contradicted the conflicting span is really in the source
//   unverified   the evidence doesn't settle it. Shown to the reviewer, costs nothing.
export function resolveVerdict(claim, sourceNorm) {
  const v = claim?.verdict;
  const found = quoteFoundIn(sourceNorm, claim?.source_quote);

  if (v === "supported") {
    if (found === false) return { verdict: "unverified", why: "the grader's quote isn't in your document — check this one by hand" };
    return { verdict: "supported", why: null };
  }
  if (v === "contradicted") {
    if (found === true) return { verdict: "contradicted", why: null };
    return { verdict: "unverified", why: "flagged as contradicting the source, but the conflicting quote isn't in your document" };
  }
  // unsupported (or anything unrecognized)
  if (claimCorroborated(sourceNorm, claim?.claim)) {
    return { verdict: "unverified", why: "the grader couldn't cite this, but your document does contain these words and figures — confirm it" };
  }
  return { verdict: "unsupported", why: null };
}

// Resolve a whole claim list against the raw source. Returns new claim objects carrying both the
// model's verdict and the resolved one, so the UI can show where they disagreed.
export function verifyClaims(claims, rawText) {
  const list = Array.isArray(claims) ? claims : [];
  if (!rawText) return list.map((c) => ({ ...c, resolved: c.verdict, quote_found: null, verify_note: null }));
  const sourceNorm = norm(rawText);
  return list.map((c) => {
    const r = resolveVerdict(c, sourceNorm);
    return { ...c, resolved: r.verdict, quote_found: quoteFoundIn(sourceNorm, c.source_quote), verify_note: r.why };
  });
}

// Omissions get the same treatment: the critic must show the missing fact in the source. If its
// quote isn't there, the "omission" is the critic's invention and must not cost the card anything.
export function verifyOmissions(omissions, rawText) {
  const list = Array.isArray(omissions) ? omissions : [];
  if (!rawText) return list.map((o) => ({ ...o, quote_found: null, counts: true }));
  const sourceNorm = norm(rawText);
  return list.map((o) => {
    const found = quoteFoundIn(sourceNorm, o.source_quote);
    return { ...o, quote_found: found, counts: found !== false };
  });
}
