# SCOPE — Transcript Demand Miner

**Slug:** transcript-demand-miner
**Status:** draft
**Created:** 2026-07-24
**Effort:** M (core batch run 1–2 days; L if it becomes an ongoing periodic pipeline)
**Owner:** Tanner

---

## Problem

Robin's knowledge base was built from a single enrollment packet and evaluated against 25 hand-picked questions — a *guess* at what members actually ask. Meanwhile ~750 real TalkDesk call transcripts capture exactly what members ask and how they phrase it, but that signal is untapped: we have no ranked view of the true top questions, their frequency, or which ones Robin can't yet answer. Today the KB covers only ~5 of the 25 eval questions, and we're prioritizing content by intuition.

## Solution

A batch "demand miner" that (1) scrubs PII from the transcripts, (2) extracts each caller's question(s)/intent, (3) clusters them into canonical questions ranked by how often they're asked, and (4) cross-references current KB coverage. It emits two things: demand-weighted candidates for the eval set, and a prioritized content backlog. Transcripts are treated strictly as a **demand and phrasing signal — not as content truth**; the actual answers are still authored from grounded sources through the existing content cleaner. This turns content work from guesswork into demand-ranked ROI.

## Success criteria

- [ ] All ~750 transcripts pass a PII scrub — zero real SSN / account number / DOB / full name reaches any LLM prompt, Supabase row, or repo artifact (verified on an audited sample).
- [ ] The 750 collapse to a deduped, **frequency-ranked** list of ~40–80 canonical questions, each with `demand_count`, 2–3 verbatim sample phrasings, and a coverage status.
- [ ] A prioritized **content backlog** (uncovered questions, highest demand first) is produced in a shape the existing cleaner can consume.
- [ ] The dashboard/eval can express **demand-weighted coverage** ("Robin covers N of the top 20 most-asked questions"), not just N of 25.

## Why now

The KB is ~5/25 covered and we're choosing what to build next by intuition. The 750 transcripts already exist in TalkDesk — mining them is the cheapest way to replace guesswork with real demand ranking, and it directly feeds the content push that's already the top priority. It also aligns with the phase-2 TalkDesk direction the program already anticipates.

## Constraints

- **Regulated financial services.** Transcripts contain real member PII. A scrub/redaction pass is **step zero and non-negotiable**; only scrubbed data flows downstream. Raw or scrubbed transcript text never gets committed to the repo — code only; data lives in Supabase/local.
- Reuse the existing stack (Supabase, Vercel/Node, Anthropic SDK, the content cleaner). No new heavyweight dependencies without cause.
- Batch, not real-time. Cost-bounded — 750 × LLM is fine if chunked and the cheap model does the bulk.
- **Demand signal, not content truth** — no ungrounded/agent-sourced content may reach Robin's KB.

## Non-goals

- Not publishing agent answers directly into Robin's KB.
- Not building a live TalkDesk API integration in v1 — assume a transcript export file; live pull is later.
- Not real-time/streaming ingestion — batch only.
- Not auto-promoting mined questions into the eval set without human triage.
- Not authoring the content itself — that stays with the existing grounded cleaner.

## Open questions

- [ ] What's the TalkDesk export format/fields (CSV/JSON? one file? speaker labels, timestamps)? Is any redaction already applied by TalkDesk, or do we scrub everything ourselves?
- [ ] Clustering approach: embeddings + distance threshold, or LLM canonicalization in a consolidation pass? (avoids an embeddings dependency) — SPEC to decide.
- [ ] Where do mined questions live: a new `mined_questions` table (preferred) vs. extending `curated_questions`? How do they get promoted to the eval set (human triage step)?
- [ ] How much of the current human-agent answer do we keep as a writer's hint, and how do we keep it clearly separated from published content?

---

*Scope locked: not yet*
