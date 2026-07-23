# SCOPE — Content Cleaner (Robin-ready / KCS gold)

**Slug:** content-cleaner
**Status:** draft
**Created:** 2026-07-23
**Effort:** M (1–2 days for a first cut; L for the full reviewer UX)
**Owner:** Tanner

> A reusable workbench capability, not tied to one project. Turns raw source content into
> **Robin-ready, KCS-gold** Knowledge Base articles so we never import garbage into an agent's KB.

---

## Problem

Raw source content — enrollment packets, plan documents, existing KCS articles, web pages — is not
safe to drop into a voice agent's Knowledge Base. It carries fee tables and legal boilerplate that
pollute RAG, cross-references ("see the section above," "click the gear icon") that break when read
aloud, inconsistent terminology, marketing fluff, and PII risk. Robin then retrieves noise or, worse,
invents. We hand-cleaned the INTRUST packet (25 pages → 3 tight docs, Schwab tables dropped) and it
worked — but by hand it doesn't scale to the ~150 plans production will carry. "Garbage in, garbage
out" is the single biggest threat to answer quality.

## Solution

A **content-cleaner pipeline** that ingests raw content and transforms it into KCS-gold, Robin-ready
KB articles: one topic per doc, plain participant language, question-oriented, **self-contained**
(no cross-refs), **voice-friendly** (no tables/UI gestures that don't read aloud), terminology
normalized, **PII-scrubbed**, with explicit **coverage flags** (what the source does NOT cover →
Robin routes to a specialist instead of guessing). It runs raw text through: extract → segment topics
and drop noise → rewrite each to the KCS-gold shape → validate against a checklist (deterministic PII
+ structure checks *and* an LLM critic) → output clean markdown **plus a "what was dropped and why"
report and a coverage map**. **Human-in-the-loop: it proposes, a person approves before KB upload —
never auto-publish.**

## Success criteria

- [ ] **Reproduces the hand cleanup:** given the raw INTRUST packet, the cleaner produces docs at
      least as good as the 3 hand-made ones, dropping the Schwab/fee-table noise, with **zero PII** in
      the output.
- [ ] **Every output passes the Robin-ready checklist** (one topic, self-contained, no cross-refs,
      voice-friendly, has a retrieval title + coverage flags).
- [ ] **Reviewable in minutes:** the dropped/flagged report + coverage map let a human approve or
      reject without re-reading the source.
- [ ] **Reusable, not INTRUST-specific:** runs on a new plan's raw docs with no code changes.

## Why now

The experiment proved manual cleaning is necessary *and* that it's the bottleneck. Before scaling
past one plan, we need a repeatable "make it Robin-ready" step — it's the difference between accurate
answers and confident nonsense, and it feeds every project's KB.

## Constraints

- **LLM-driven (Claude) with deterministic guards.** The rewrite is a model; the safety checks (PII
  scan, structure/cross-ref/length checks) are code, so a bad rewrite can't slip PII or garbage
  through silently.
- **Human gate — never auto-upload.** The cleaner outputs candidate docs + a report; a person
  approves before anything reaches the ElevenLabs KB.
- **Compliance:** never emit real PII; flag anything that looks like member data or a real
  credential. Synthetic-only discipline carries over.
- **Output = Robin-ready markdown** that the KB ingests cleanly (the same shape as `robin-experiment/kb/`).

## Non-goals

- Not auto-publishing to the ElevenLabs KB (human approval required).
- Not a general summarizer — specifically the **KCS-gold + voice-RAG** shape.
- Not authoring net-new content — it reworks existing source and **flags gaps** rather than filling
  them from the model's own knowledge.
- Not RAG/vector infrastructure (that's the KB's job).

## Open questions

- [ ] **The KCS-gold rubric — lock the exact criteria.** Draft: one topic per doc · question-oriented
      headings · self-contained (no cross-refs) · voice-friendly (no read-aloud-hostile tables/UI
      gestures; spell out phone numbers) · normalized terminology · explicit coverage flags · PII-clean
      · retrieval-friendly title + metadata (source, plan_id, effective date, review owner). Confirm /
      adjust against how your team defines KCS gold.
- [ ] **Input formats first:** PDF (already solved via PyMuPDF) — add Word / HTML / plain text / a URL
      fetcher?
- [ ] **Where it runs:** a CLI in the repo (Node or Python), a broker endpoint, or a small artifact UI
      so non-technical reviewers can paste content and get clean output + report?
- [ ] **Review UX:** a plain report file, or a side-by-side (raw → cleaned, with drops highlighted)
      artifact for the reviewer?
- [ ] **Synergy:** should it also propose a **candidate Q&A eval set** from the cleaned content (like
      the 25 questions), so cleaning a plan and seeding its test set are one step?
- [ ] **Chunking:** per-topic files (current approach) vs. explicit chunk markers for the KB.

---

*Scope locked: not yet*
