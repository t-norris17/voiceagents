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
3. **Judgments.** answers_the_title / title_is_askable / speakable / coverage_complete / bloat.

`scoreReview()` in `lib/validate.js` does the arithmetic — contradiction −3, unsupported claim −2,
omission −1 (capped at 2), wrong-topic body −2, style defects −1 each, floored at 1. A model can be
generous with a score; it can't be generous with a quote that doesn't exist.

Each article gets its **own** critic call (`critiqueOne`) with the raw source as a cached prompt block
— the first call warms the cache, the rest fan out — so one call's attention isn't spread across ten
articles. Sonnet at `effort: "high"`.

- `npm test` — `test/score.test.mjs` pins the arithmetic. No API key needed.
- `npm run calibrate` — `tools/calibrate-critic.mjs` feeds the **live** critic eight synthetic articles
  with planted defects (a fee changed $75→$100, an invented repayment term, a dropped 90-day rule, an
  absolute hedged into "generally", a jargon title, a body answering the wrong question, and a closing
  recap that both pads the article and sharpens "legal limits" into "federal limits") and exits 1 if
  the grader waves them through. Re-run it after any change to `CRITIC_SYSTEM` or the weights.
  Everything in it is fictional — no real plan, no member data.

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

- **Filters** — All / ⛔ PII blocked / ⚠ Needs a look / ✓ Clean 5/5, with counts.
- **Worst-first ordering**, lowest score first within a bucket. Clean cards fold.
- **An unscored article is "needs a look", never clean.** Silence from the critic is not a pass.
- **Send all clean (n)** stages every 5/5 card with no flags, serialized, re-checking triage at click
  time; then a handoff bar into Step 3.
- **Receipts** — each card opens to show every claim next to the source text backing it (or
  "no matching text in your document"), and the score's arithmetic on hover.
- The last run is kept in `localStorage` for a day (local only) so a stray refresh doesn't burn a
  clean pass.

## Name

The app is **The Knowledge Factory** (was "Robin Content Console" / "Content Cleaner"). The directory
stays `projects/content-cleaner/` on purpose — the Vercel project's **Root Directory** setting points
at `projects/content-cleaner/cleaner`, so renaming the folder would break the deployment. Rename the
path only alongside a Vercel settings change.

## Next session

- **Watch the scores fall.** Articles that used to be 5/5 will land at 3-4 with a named omission. That's
  the grader working. If `npm run calibrate` still averages > 4.5 on deliberately broken articles, the
  weights need another turn — it prints a warning when that happens.
- Run the acceptance test through the deployed door; tune `lib/kcs.js` prompts if drops/coverage differ
  from the hand-made KB.
- Optional: auto-seed the eval set from `_candidate-questions.md` into a plan's `curated_questions`;
  a "refine all flagged" batch to mirror "send all clean"; HTML/URL ingestion.
