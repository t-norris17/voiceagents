# BUILD — Content Cleaner (Robin-ready / KCS gold)

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

## Next session

- Run the acceptance test through the deployed door; tune `lib/kcs.js` prompts if drops/coverage differ
  from the hand-made KB.
- Optional: per-topic chunked rewrite (removes the timeout risk / enables progress streaming);
  PDF/Word/HTML/URL ingestion; auto-seed the eval set from `_candidate-questions.md` into a plan's
  `curated_questions`.
