# SPEC — Transcript Demand Miner

**Slug:** transcript-demand-miner
**Status:** draft
**Last updated:** 2026-07-24

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | JavaScript (ESM) | Matches broker + cleaner; no new toolchain. |
| Runtime | Node — local batch script for the one-time 750; optional Vercel serverless endpoint for periodic top-ups | A single serverless call can't LLM-process 750 transcripts under the time limit; a local/batch run over the export is simpler and resumable. |
| Key libraries | `@anthropic-ai/sdk` | Extraction + consolidation. No embeddings dependency unless clustering demands it (see Key decisions). |
| Storage | Supabase (Postgres) | `mined_questions` + a scrubbed staging table. Service-role, server-side only. Raw/scrubbed transcripts are **not** committed to the repo. |
| Scheduler / trigger | Manual batch (one-time 750); periodic re-run later | Batch, not real-time. |
| Outputs / delivery | `mined_questions` table → content backlog view + demand-weighted coverage; promotion feeds `curated_questions` and the cleaner | Plugs into the pipeline that already exists. |

## Architecture

Transcripts are a demand signal. The pipeline never turns an agent's answer into published content — it produces *what to build* and *how members phrase it*, and hands that to the grounded cleaner.

```
TalkDesk export (file)
   │
   ▼
[1. INGEST + SCRUB]   deterministic PII redaction (SSN, account #, phone, email, DOB, names)
   │                  + LLM audit on a sample → scrubbed_transcripts (staging)   ← step zero
   ▼
[2. EXTRACT]          per transcript, LLM pulls caller question(s)/intent + topic + the
   │                  current agent answer (as a hint only)  → raw_questions
   ▼
[3. CONSOLIDATE]      merge near-duplicates into canonical questions, seeded by the existing
   │                  25-question taxonomy; tally demand_count; keep sample phrasings  → mined_questions
   ▼
[4. COVERAGE]         cross-ref each canonical question vs published kb_articles
   │                  → covered? / gap
   ▼
   ├──▶ CONTENT BACKLOG   uncovered, ranked by demand → input to the existing cleaner (grounded)
   └──▶ EVAL CANDIDATES   demand-weighted questions → human triage → curated_questions
```

## File / folder structure

```
transcript-demand-miner/
  SCOPE.md
  SPEC.md
  BUILD.md
  scrub.js            # deterministic PII redaction + sample LLM audit
  extract.js          # per-transcript question/intent extraction (LLM, structured output)
  consolidate.js      # canonicalize/dedupe raw_questions -> mined_questions, tally demand
  coverage.js         # cross-ref canonical questions vs published kb_articles -> backlog
  run.js              # local batch orchestrator over the export (chunked, resumable)
  supabase/migrations/
    001_mined_questions.sql   # scrubbed_transcripts + raw_questions + mined_questions
  README.md           # how to run the batch; where the export goes (NOT in git)
```
Data (the export, scrubbed transcripts) lives outside the repo — local working dir + Supabase only.

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| TalkDesk | Source transcripts (export file v1; API later) | Export file — no creds in v1 | TBD (format) |
| Supabase | Store scrubbed staging + `mined_questions` | Service-role key, server-side | Reuse existing project |
| Anthropic API | Extract + consolidate | `ANTHROPIC_API_KEY` | Reuse |
| Embeddings (optional) | Only if clustering goes vector-based | Voyage AI (Anthropic-recommended) or OpenAI | TBD — avoid if possible |
| Content cleaner | Consumes the backlog | — (existing app) | Existing |

## Key decisions

- **Demand signal, not content truth.** Nothing an agent said is published. Extraction keeps `current_agent_answer` only as a writer's hint, clearly separated; facts are authored from grounded sources via the cleaner.
- **PII scrub is stage zero.** Deterministic redaction first (regex/patterns for SSN, account numbers, phone, email, DOB, member names), then an LLM audit pass on a random sample to catch leakage. Only scrubbed text is ever sent to extraction prompts or written to Supabase. No transcript text (raw or scrubbed) is committed to git.
- **Clustering via LLM consolidation, not embeddings (default).** Extract to short question strings, then a consolidation pass merges near-duplicates into canonical questions seeded by the existing 25-question categories. Avoids adding an embeddings provider. Fall back to embeddings + threshold only if the LLM merge proves unreliable at this scale.
- **New `mined_questions` table, human-gated promotion.** Keeps the eval set (`curated_questions`) clean; mined questions get `demand_count`, sample phrasings, coverage, and a status. Promotion to the eval set is an explicit human triage step (adds `origin` + `demand_count` to `curated_questions` at that point).
- **Local batch for the one-time 750; endpoint later.** Sidesteps serverless time limits; the run is chunked and resumable (each transcript stamped processed).
- **Cheap model for volume, strong model for the merge.** Haiku for per-transcript extraction (750×), Sonnet for the consolidation pass (one pass over the deduped set).

## Open questions

- [ ] TalkDesk export format/fields and whether any redaction is pre-applied (drives the scrub design).
- [ ] Confirm LLM consolidation is accurate enough at ~750→~60 without embeddings.
- [ ] Promotion workflow: how many mined questions enter the eval set, and who signs off.
- [ ] Do we retain scrubbed transcripts after mining, or discard post-extraction (data-minimization)?

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Real PII leaks into a prompt / Supabase / repo | Med | Deterministic scrub first + sample LLM audit; process scrubbed-only; never commit transcript text; data-minimize. |
| Agent answer mistaken for authoritative content | Med | Hard design boundary — `current_agent_answer` is a hint; all published content authored via the grounded cleaner. |
| Clustering over- or under-merges questions | Med | Human review of the ~40–80 canonical list before it drives work; seed with the existing taxonomy. |
| Cost/time over 750 LLM calls | Low–Med | Chunked resumable batch; Haiku for extraction, Sonnet only for the single consolidation pass. |
| TalkDesk export shape varies / messy | Med | Normalize on ingest; v1 assumes one documented export format (open question). |

---

*Spec last updated: 2026-07-24*
