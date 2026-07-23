# BUILD — Content Cleaner (Robin-ready / KCS gold)

**Slug:** content-cleaner · **Reads:** [`SCOPE.md`](./SCOPE.md) · [`SPEC.md`](./SPEC.md)

> How to run the cleaner + the acceptance test. It **proposes**; a human approves before KB upload.

---

## What's built (v1 first cut)

A Node CLI in [`cleaner/`](./cleaner/) — raw source text → KCS-gold, Robin-ready KB articles + a
reviewer report. Pipeline: extract → rewrite (Opus, structured) → validate (deterministic guards +
Opus critic) → render.

```
cleaner/
  clean.js            CLI entry + orchestration
  lib/kcs.js          the KCS-gold + voice-RAG rubric (rewrite/critic system prompts) + article→markdown
  lib/extract.js      read .txt/.md (PDF is a pre-step)
  lib/rewrite.js      Opus structured call: segment + rewrite to the article contract
  lib/validate.js     deterministic guards (PII = hard fail; cross-ref/table/gesture/length = warn) + Opus critic
  lib/render.js       write per-topic docs + _drop-report + _coverage-map + _candidate-questions + _run.json
  package.json        @anthropic-ai/sdk
```

## Run it

Needs `ANTHROPIC_API_KEY` in the environment (the rewrite + critic are Opus calls).

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

## Open: run surface (decision needed)

The SCOPE assumed "run in-session," but the build sandbox has no API key. Pick one:
- **A — key in this environment:** add `ANTHROPIC_API_KEY` to the remote env so the CLI runs in-session.
- **B — broker endpoint:** wrap the pipeline as a broker route (+ a paste-in page like the Q&A tool);
  it uses the key already on Vercel. Watch serverless timeouts (the rewrite is a large Opus call).
- **C — local:** run the CLI wherever you have Node + the key.

## Next session

- Run the acceptance test on `enrollment.txt`; compare to the hand-made KB; tune `lib/kcs.js` prompts
  if drops/coverage aren't right.
- Decide the run surface (A/B/C above).
- Optional: PDF/Word/HTML/URL ingestion; a side-by-side reviewer artifact; auto-seed the eval set from
  `_candidate-questions.md`.
