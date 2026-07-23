# SCOPE — Robin 50-User Experiment

**Slug:** robin-experiment
**Status:** draft
**Created:** 2026-07-23
**Effort:** L (1-2 weeks)
**Owner:** Tanner

> Builds on `projects/nestegg-u-demo/`. Reuses Robin (ElevenLabs), the Vercel broker
> (`mock-backend/`), the post-call webhook, and the phase-2 metrics schema
> (`nestegg-u-demo/phase2/001_ai_call_events.sql`). This is the first time Robin touches **real
> (internal) user data** — read Constraints before building.

---

## Problem

Robin has proven the demo happy path, but we don't yet know how she performs with **real users
asking real questions** at any volume. We need a controlled, measurable trial before anyone talks
about a member-facing launch — and today we have no way to see, per call, *what was asked, what
Robin answered, and whether it was any good.*

## Solution

A tight, instrumented experiment: **50 internal users** call Robin, who **verifies them against a
Supabase table**, **pulls their balance**, and **answers ~25 curated questions** drawn from the
enrollment guide (loaded into the ElevenLabs Knowledge Base). Every call flows through the post-call
webhook into Supabase, where each turn is tagged to one of the 25 questions, graded for answer
quality, and scored for sentiment. An **experiment dashboard** shows it all: questions asked,
answer given per question, sentiment, and a quality score, with a human-review queue. The goal is to
judge *the experience*, not to ship a broad feature set.

## Success criteria

- [ ] **Verification works on real data:** ≥95% of correctly-answering users are verified against
      Supabase on the first or second attempt; zero false accepts.
- [ ] **Answer quality is measured, not guessed:** every call's turns are tagged to the 25-question
      set and graded; ≥80% of in-scope answers rated acceptable-or-better by the rubric + human review.
- [ ] **Sentiment + quality visible per question on the dashboard** for 100% of completed calls,
      with negatives flagged for review.
- [ ] **No PII incident:** no raw SSN stored anywhere; Supabase RLS on; access limited; consent +
      disclosure captured for all 50 participants.

## Why now

Boss wants a real-user read on Robin's experience before committing to a wider rollout. 50 users +
25 questions is small enough to run safely and instrument fully, and large enough to surface the
experience problems a scripted demo hides.

## Constraints

- **Real internal-user PII enters the stack for the first time.** This crosses the demo's
  "synthetic only" line. Requires **compliance sign-off**, data minimization (hash the SSN, don't
  store it raw), Supabase **RLS + encryption at rest**, restricted access, and **participant consent
  + AI/recording disclosure** before any real data is loaded.
- **Answer-only.** Knowledge-based auth (SSN last-4 + DOB) is low assurance — fine for reading a
  balance and answering questions, **not** for changing anything. No account actions in this phase.
- **Reuse the existing stack**, don't rebuild: ElevenLabs agent + KB, Vercel broker for tools,
  Supabase for data + metrics, post-call webhook. New code is the Supabase-backed tools, the scoring
  step, and the dashboard.
- **ElevenLabs never talks to Supabase directly** — the Vercel broker holds the service key and
  shapes/normalizes every call.
- **Tight topic scope:** enrollment guide + balance + verify only. ~25 curated questions.

## Non-goals

- Not: a production or member-facing launch (internal test users only).
- Not: a broad feature set — no new topics beyond enrollment guide + balance.
- Not: transactional actions (no password changes, no contribution changes) — answer-only.
- Not: storing raw SSNs or real financial data beyond what the experiment strictly needs.
- Not: a fully-automated quality score with no human in the loop — LLM scoring is assisted, then
  reviewed.
- Not: multi-plan / multi-employer — one enrollment guide.

## Locked decisions (2026-07-23)

1. **Balances: synthetic** for the experiment (assigned test values, not real financial data).
2. **Consent: opt-in.** Testers give consent to participate; AI/recording disclosure at call start.
3. **Verification: assigned Member ID + DOB** (no SSN in the stack at all). **Recommended refinement:**
   issue each tester a *synthetic* DOB too (printed on their credential card) so the verification DB
   holds **zero real PII**, testing the exact flow while removing the PII blocker.
4. **Supabase: no existing project holds voice-agent data** (checked; `lumio-demo` is a different
   app). Provision a **dedicated project** for isolation + clean teardown. Cost: **$10/mo** on the
   Pro org. *(Pending Tanner's go-ahead before creating.)*

## Open questions

- [ ] **Success thresholds:** confirm the exact pass bars (the % in Success criteria are proposed
      defaults).
- [ ] **Quality rubric + reviewer:** what makes an answer "acceptable," and who reviews the flagged
      ones?
- [ ] **Sentiment source:** ElevenLabs analysis vs. an LLM pass over the transcript (recommend LLM
      pass for control + consistency with the quality grader).
- [ ] **Retention:** how long do we keep transcripts after the experiment, and who can see the
      dashboard? (Transcripts of real testers may contain incidental PII even with a clean DB.)
- [ ] **Enrollment guide:** is the "~25 questions + potential answers" the eval set, the KB content,
      or both? (Recommend: the *guide* goes in the KB; the 25 Q&A are the eval set + an optional
      curated FAQ doc.)

---

*Scope locked: pending Supabase go-ahead + threshold confirmation*
