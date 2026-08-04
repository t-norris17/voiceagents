# BUILD — The Knowledge Factory (Robin-ready / KCS gold)

**Slug:** content-cleaner · **Reads:** [`SCOPE.md`](./SCOPE.md) · [`SPEC.md`](./SPEC.md)

> How to run the cleaner + the acceptance test. It **proposes**; a human approves before KB upload.

---

## What's built (v1 first cut)

A Node CLI in [`cleaner/`](./cleaner/) — raw source text → KCS-gold, Robin-ready KB articles + a
reviewer report. Pipeline: extract → rewrite (Opus, structured) → validate (deterministic guards +
Sonnet critic) → render.

```
cleaner/
  clean.js            CLI entry + orchestration
  lib/kcs.js          the KCS-gold + voice-RAG rubric (rewrite/critic system prompts) + article→markdown
  lib/extract.js      read .txt/.md (PDF is a pre-step)
  lib/rewrite.js      Opus structured call: segment + rewrite to the article contract
  lib/validate.js     deterministic guards (PII = hard fail; cross-ref/table/gesture/length = warn) + Sonnet critic
  lib/render.js       write per-topic docs + _drop-report + _coverage-map + _candidate-questions + _run.json
  package.json        @anthropic-ai/sdk
```

## Run it

Needs `ANTHROPIC_API_KEY` in the environment. **Model split (cost):** the **rewrite runs on Opus**
(quality-critical, generates the articles); the **critic runs on Sonnet** at medium effort (reviews
grounding/coverage — the premium tier isn't needed to review). This roughly halves the per-run Opus
spend. A full run lands around $0.35–0.45; the rewrite is the floor. Robin's live answers run on Haiku,
so the expensive model only touches this build step, never a call.

```bash
cd projects/content-cleaner/cleaner
npm install
# PDF? extract to text first:
#   python3 -c "import fitz,sys; print(chr(10).join(p.get_text() for p in fitz.open(sys.argv[1])))" packet.pdf > raw.txt
node clean.js raw.txt --slug intrust --env "INTRUST 401(k) Plan" --source "2025 INTRUST Enrollment Packet"
```

Output lands in `cleaner/out/<slug>/`: the cleaned `*.md` docs (candidates for the KB) plus the three
reviewer reports and `_run.json`. **Exit code 1** on a fatal finding (PII in output) — not safe to import.

## Acceptance test — NOT YET RUN

The v1 gate (from SPEC §6): run on the raw INTRUST packet and confirm the output is at least as good
as the 3 hand-made `robin-experiment/kb/*.md`, with the Schwab/fee-table noise in `_drop-report.md`
(not the docs) and **zero PII**.

Fixture is ready: the extracted packet text is in the session scratchpad (`enrollment.txt`, 85 KB,
70+ Schwab/fee lines to drop). **Blocked only on credentials:** the build sandbox has no
`ANTHROPIC_API_KEY`, so the Opus pipeline can't execute here. Everything short of the live call is
verified — all modules syntax-check, schemas validate, KB + prompts load, pipeline is wired.

**To close the gate, run it in an environment that has the key** (see "Open: run surface" below), then
diff `out/intrust/*.md` against `robin-experiment/kb/*.md` and eyeball `_drop-report.md`.

## The hosted "door" (`api/clean.js` + `public/index.html`)

The front door: paste raw text or upload a `.txt/.md`, set the plan name (+ optional slug/source), hit
**Clean it**. `POST /api/clean` runs the SAME pipeline in-memory and returns the cleaned articles + the
three reports; the page is the **review room** — articles rendered with validator flags highlighted
(PII in red, warnings in amber), critic scores, a drop report / coverage map / candidate-questions tab,
and per-article + report **downloads**. Nothing publishes; you approve and download the markdown.

`vercel.json` raises `api/clean.js` to `maxDuration: 300` — the rewrite is a big Opus call.

### Deploy the door (one-time)

It's its own Vercel project (kept separate so the cleaner stays reusable, not welded to the Robin
broker). Import `t-norris17/voiceagents` in Vercel with **Root Directory =
`projects/content-cleaner/cleaner`**, add `ANTHROPIC_API_KEY` in project env, deploy. PDF is still a
pre-step (paste extracted text or upload `.txt/.md`; the page shows the PyMuPDF one-liner).

> **maxDuration note:** 300s needs a Pro plan; Hobby caps function duration at 60s. If a big guide
> times out on Hobby, the fix is to chunk the rewrite per-topic (a follow-up), not to shrink the guide.

## Acceptance test — closes when the door is deployed

Deploy the door, paste `enrollment.txt` (the raw INTRUST packet) with env "INTRUST 401(k) Plan", Clean,
then compare the article tab against the hand-made `robin-experiment/kb/*.md` and eyeball the drop
report (Schwab/fee tables should be there, not in the docs) and the "no PII" chip. That's the v1 gate.

## The card: Question · Answer · Qualifiers · Notes

Every card is one member question, in four parts, defined once in `lib/kcs.js` (`SECTIONS`) and read
from there by the rewrite prompt, the critic prompt, the renderer, the parser and the UI:

| Part | Spoken? | Holds |
|---|---|---|
| **Question** | yes | What a member asks, in their words. The embedding bait — it leads the chunk. |
| **Answer** | yes | The answer to exactly that question. No conditions, no caveats about the document. |
| **Qualifiers** | yes | The conditions that *change* the answer, as `{when, then}` pairs. Usually empty. |
| **Notes** | no | Agent-facing: what **this source** doesn't settle, so Robin hands off instead of guessing. Never a plan fact. |

The split is not tidiness. It fixes three things at once:

1. **Speech.** An answer with every exception inlined is unlistenable. An answer followed by "one
   thing that changes this…" is how a person talks.
2. **Grading.** This is the big one — see below.
3. **Review.** The card renders as four labelled blocks, so a reviewer scanning twenty of them sees
   where the answer stops and the conditions start without reading.

`normalizeArticle()` accepts the old `title`/`issue`/`resolution`/`cause`/`coverage_flags` shape, so
cached runs, older `kb_articles` rows and hand-written fixtures still render and still grade.
`parseArticle()` reads the four sections back out of the rendered text — the reviewer edits that
text, so it's what has to be graded and published.

## Why most cards were scoring 2/5 and lower

Two causes, one structural and one arithmetic. Neither was the rewrites being bad.

**1. The card was penalized for being honest about its own gaps.** The renderer appended the
coverage flags to the article body as a sentence: *"If a caller needs specifics beyond this, route to
a specialist rather than guess: the repayment term…"* The critic was then told to list every
checkable claim including "who-to-contact" and "any statement of what the plan does or allows" — so
it read that sentence as a claim, looked for a supporting quote, and correctly found none. A claim
about what a document *omits* can never have a supporting quote in that document. **Every card
carrying a coverage flag took an automatic −2**, and coverage flags are exactly what a
conscientious rewrite produces most of.

The fix is the Notes section. The critic now receives the card **sectioned and labelled**
(`articleForCritic()`), with notes marked explicitly off-limits: they describe the document, not the
plan, and are never claims. The one note defect it still reports is `notes_misused` — a note that
smuggles in a plan fact, which is a real way to dodge fact-checking.

**2. Unsupported claims cost 2 points each with no ceiling.** Three of them floored any card at 1/5.
That punished *depth*: a rich card making fifteen accurate statements plus two the critic couldn't
cite scored the same as a card that was simply wrong. Every deduction is now **capped**, and a
claim's price depends on whether a caller could act on it:

| Finding | Cost | Cap |
|---|---|---|
| Contradicts the source | 1.5 each | 3 |
| States a figure/rule the source doesn't (**material**) | 1.0 each | 2.5 |
| Wording the source doesn't support (non-material drift) | 0.5 each | 1 |
| Fact from the source left out | 0.5 each | 1.5 |
| Doesn't answer its own question | 2 | — |
| Unaskable question / not speakable / gap unnoted / bloat / note misused | 0.5 each | — |

Floored at 1, scored to one decimal. **Ready to send = ≥ 4.5 with nothing on its fix list**
(`CLEAN_MIN`). The card shows its own subtraction in the UI — "starts at 5.0, then −1.0 a figure
your document doesn't state" — so the number is arguable rather than an edict.

## The quote check: the grader's evidence has to survive contact with the source

`lib/verify.js` locates every `source_quote` in the raw document before it is allowed to count.
Nothing was doing this, which let two opposite errors through:

- A quote the source **never contained** still counted as support. A fabricated citation is worth
  less than no citation, because it looks like proof.
- A fact that **is** in the source, which the critic simply didn't find in an 85 KB document, was
  scored as an invented claim at full price. *"I didn't find it"* is not *"it isn't there"* — and
  this is the failure mode that scales with document size, which is why it bit hardest on the real
  packet.

Matching normalizes the things that survive a PDF extract (curly quotes, dashes, hard-wrapped
whitespace, soft hyphens) and falls back to a windowed content-word match — but the window is
roughly the quote's own length, so "every word appears somewhere in the packet" can never
masquerade as a citation.

Claims the check can't settle become **`unverified`**: shown to the reviewer under *"Worth
confirming — these didn't cost the card any points"*, costed at zero. A grader that can't find its
own evidence has produced a question, not a finding. The same rule applies to omissions: an
omission the critic can't quote from the source doesn't count against the card.

`api/refine.js` now re-grades against the **original document**, passed from the browser as
`source_text`. It used to grade the revised card against *itself*, where every claim is trivially
present — a rigged exam that returned 5/5 regardless of what the edit did. With no source available
it returns `graded_against_source: false` and the UI leaves the card unscored rather than showing a
fake number.

## Grading: evidence, not opinion

The first critic scored almost everything 5/5. It wasn't that the rewrites were flawless — the rubric
couldn't fail. Four "did you avoid an obvious sin" booleans (grounded / requestor's-words /
coverage-complete / just-enough), which a rewrite explicitly instructed not to invent passes by
construction, plus a free-floating 1-5 integer with **no anchors**, graded in **one batch call** over
every article at once. Nothing defined a 4, so the model returned 5.

The fix removes the model's ability to be generous. `CRITIC_SYSTEM` no longer asks for a score at all:

1. **Claims.** Every checkable fact the article states — figures, deadlines, limits, phone numbers,
   eligibility rules — each with the **verbatim span of the source** that establishes it, or a verdict
   of `unsupported` (true in general, but your document doesn't say it) / `contradicted`.
2. **Omissions.** Facts the source contains that belong in *this* article and are missing. The defect
   nobody catches: accurate, well-written, quietly missing the exception.
3. **Judgments.** answers_the_question / question_is_askable / speakable / gaps_flagged / bloat /
   notes_misused. Plus, per claim, a `material` flag — would getting this wrong change what a
   participant *does*?

`scoreReview()` in `lib/validate.js` does the arithmetic (weights and caps in the table above).
A model can be generous with a score; it can't be generous with a quote that doesn't exist — and
since `lib/verify.js` checks every quote against the document, it can't be generous with a quote
that doesn't exist *there* either.

Each card gets its **own** critic call (`critiqueOne`) with the raw source as a cached prompt block
— the first call warms the cache, the rest fan out — so one call's attention isn't spread across ten
cards. Sonnet at `effort: "high"`.

- `npm test` — `test/score.test.mjs` pins the arithmetic, `test/verify.test.mjs` pins the quote
  check (both directions: a fabricated citation never counts as support, a real fact the critic
  missed never counts as a penalty), `test/validate.test.mjs` pins the guards and the card round
  trip. 54 tests, no API key needed.
- `npm run calibrate` — `tools/calibrate-critic.mjs` feeds the **live** critic ten synthetic cards
  with planted defects (a fee changed $75→$100, an invented repayment term, a dropped 90-day rule, an
  absolute hedged into "generally", a jargon question line, an answer to the wrong question, a plan
  fact smuggled into Notes, and a closing recap that both pads the card and sharpens "legal limits"
  into "federal limits") and exits 1 if the grader waves them through — **or if it marks a faithful
  card down**, which is the failure we actually hit. It reports the two tails separately (faithful
  cards want ≥ 4.50, sabotaged cards want ≤ 4.00), because one average hides exactly that case.
  Two of the ten cases are clean on purpose, one of them the `honest-gap` regression: a faithful
  card declaring two gaps in Notes, which used to lose points for saying so. Re-run after any change
  to `CRITIC_SYSTEM` or the weights. Everything in it is fictional — no real plan, no member data.

## Two rewriter rules that stop defects at the source

The grader is downstream. Two habits of the *rewriter* produced the low scores in the first real run,
and both are now forbidden in `REWRITE_SYSTEM`:

1. **No closing recap.** The model liked to end an article with an "in short" paragraph restating what
   it had just said. On a spoken answer that wastes the caller's time, and it reliably drags in wording
   the source never used. Articles now end on the last real fact.
2. **Don't sharpen the source.** Keep its level of precision — "legal limits" stays "legal limits", not
   "federal limits"; "a fee applies" doesn't acquire an amount; an absolute rule doesn't get softened
   into "generally", and a hedge doesn't get hardened. Making the source *more specific* than it is
   reads as authoritative, and is the easiest way to put something in Robin's mouth the document
   never said.

A real card scored 2/5 from exactly this pair — one closing paragraph, two defects (−2 unsupported for
"Federal rules…" where the source said "legal limits", −1 bloat for restating the article). The fix was
deleting one paragraph. `tools/calibrate-critic.mjs` carries it as the `closing-recap` case so the
critic keeps catching it if it slips through.

## The review room

The Articles tab is a triage surface, not a list:

- **Filters** — All / ⛔ Blocked / ⚠ Needs an edit / ✓ Ready to send, with counts. Named for what
  you'd *do*, not for what the grader thought.
- **Worst-first ordering**, lowest score first within a bucket. Ready cards fold.
- **An unscored card is "needs an edit", never ready.** Silence from the critic is not a pass.
- **Four labelled blocks per card** — Answer ("what Robin says"), Qualifiers ("conditions that change
  the answer"), Notes ("not spoken — what this document doesn't settle"). Empty sections say so
  rather than vanishing, so "no qualifiers" reads as a decision instead of an omission.
- **The score explains itself in place**, not on hover: *"Starts at 5.0, then −1.0 a figure your
  document doesn't state, −0.5 padded beyond what the source supports. 14 claims checked against your
  document, 2 the checker couldn't settle either way."*
- **Two lists, not one.** Things that cost points are the fix list. Things the quote check couldn't
  settle are a separate, quieter *"Worth confirming — these didn't cost the card any points"*.
  Collapsing them was how a reviewer learned to distrust the whole panel.
- **Send all ready (n)** stages every card at ≥ 4.5 with no flags and an empty fix list, serialized,
  re-checking triage at click time; then a handoff bar into Step 3.
- **Receipts** — each card opens to show every claim next to the source text backing it, marked with
  the verdict *after* the quote was located in your document (✓ found / ○ not there / ✕ contradicted
  / ? couldn't be settled).
- **Editing clears the score.** The old one belonged to the text that was just replaced; keeping it
  would let an edited card carry a stale 5/5 into "Send all ready". Refine re-grades; Save doesn't.
- The last run is kept in `localStorage` for a day (local only, with its source text, so Refine can
  still re-grade after a restore) so a stray refresh doesn't burn a clean pass.

## Name

The app is **The Knowledge Factory** (was "Robin Content Console" / "Content Cleaner"). The directory
stays `projects/content-cleaner/` on purpose — the Vercel project's **Root Directory** setting points
at `projects/content-cleaner/cleaner`, so renaming the folder would break the deployment. Rename the
path only alongside a Vercel settings change.

## Next session

- **Run `npm run calibrate` with a key** — it's the only thing that hasn't been exercised live. It now
  fails in *both* directions, so it will tell you if the recalibration overshot. Watch the two
  averages it prints, not one: faithful ≥ 4.50, sabotaged ≤ 4.00.
- **Then re-clean the INTRUST packet and compare the score distribution to the last run.** The
  expectation is that the 2s become 4s and 4.5s, with the remaining low scores naming a real defect.
  If cards are still clustering low, read the *fix list* on three of them — if the lines are all
  "Not in the source" on facts the packet plainly contains, the quote check's thresholds in
  `lib/verify.js` are too tight, not the weights.
- Run the acceptance test through the deployed door; tune `lib/kcs.js` prompts if drops/coverage differ
  from the hand-made KB.
- Optional: auto-seed the eval set from `_candidate-questions.md` into a plan's `curated_questions`;
  a "refine all flagged" batch to mirror "send all ready"; HTML/URL ingestion.
