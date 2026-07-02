# SCOPE — Lumio Retirement Voice Line

**Slug:** lumio-retirement-voice
**Status:** draft
**Created:** 2026-07-01
**Effort:** XL (program) · **POC due Tue Jul 7** (~4 working days)
**Owner:** Tanner

> **Phase 0 (now): ElevenLabs POC, no Talkdesk.** One topic — account recovery / password
> reset — demoed end-to-end in ElevenLabs. SIP, Navigator routing, transfer-to-Talkdesk, and
> the Lumio metrics dashboard are all **phase 2 (post-POC)**. See `artifacts/elevenlabs-poc-setup.md`.
> Pilot topic set beyond the demo is TBD from a 750-transcript categorization (in progress).

> **Not the plan-admin app.** This is the *customer-facing phone line* that deflects easy calls to an AI voice agent. The internal plan-administration app (plan analysts, ERISA reviewers) is a separate build — see `docs/retirement-command-DESIGN.md`. They may share a brand/Supabase project later; they are separate efforts.

---

## Problem

The retirement phone team spends a large share of its time answering repetitive, KBA-answerable questions on the 1-800 line. Those "easy win" calls crowd out the complex cases that actually need a human, and there's no clean way to triage them at the door. Today every caller waits in the same queue regardless of how trivial their question is.

## Solution

Put an AI voice agent behind the existing Talkdesk line. Talkdesk Navigator classifies intent at the front door; AI-eligible topics route (over SIP) to an ElevenLabs voice agent that authenticates the caller (OTP), answers from the team's KCS knowledge-base articles, and warm-transfers back to a live Talkdesk agent the moment it's out of scope, unsure, or asked to. Every AI call's outcome flows into Lumio, where supervisors get one dashboard of what the AI is handling. Callers never meet Lumie; Lumio owns the staff-facing metrics and audit.

## Pilot scope (proposed — confirm to lock)

Working assumption: this is a **plan-participant–facing** line (callers asking about
their own retirement accounts), not a plan-sponsor/employer line. Confirm or correct.

Proposed v1 pilot = **5 informational, low-risk, high-volume topics** (everything else
routes straight to a human):

1. Portal login / password reset
2. Check balance / find statements
3. How contributions & contribution changes work (informational)
4. Loan eligibility & how to request (informational)
5. Leaving employer: rollover / distribution process (informational)

## Success criteria

- [ ] Pilot AI agent handles 3–5 defined topics end-to-end (auth → KBA answer → clean end or transfer) in production.
- [ ] Measurable **deflection rate** on AI-routed calls, with a **false-answer / bad-deflection rate at or below an agreed ceiling** (e.g. <2%) — tracked in the dashboard.
- [ ] 100% of out-of-scope / low-confidence / failed-auth situations **warm-transfer** to a Talkdesk human with context carried over (no cold transfers, no dead ends).
- [ ] Supervisors can see deflection rate, transfer rate + reason, topic mix, auth success, and handle time in a Lumio dashboard.

## Why now

Sponsor (Tanner's boss) is driving this as a way to shift easy wins off the human team. ElevenLabs' Conversational AI now supports every required piece (SIP into existing telephony, KB-grounded procedures, transfer-to-human, post-call webhooks) — verified against their docs — so the plumbing is buildable today rather than a research project. It's also the first concrete client-facing use of the platform, seeding the future Call Center flavor.

## Constraints

- Regulated financial services — compliance must be in the room from day one (recording disclosure, PII handling, what the AI is allowed to do).
- Talkdesk stays the front door and switchboard; we plug in, we don't replace it.
- ElevenLabs Procedures are **Alpha** (breaking changes expected); KBA answers must use **free-form** procedures (structured ones can't reference the KB) and can't be converted later.
- **Answer-only in v1** — no account-changing actions by the AI until a higher-assurance auth model is approved.
- Dashboard + OTP + webhook receiver build on the existing Lumio stack (Vite/React 19, Vercel `/api`, Supabase).
- Metrics data is owned by Lumio, not locked in a vendor dashboard (vendor portability).

## Non-goals

- Not: any transactional action by the AI (distributions, beneficiary/address changes, loans) — those transfer to a human.
- Not: a Lumie persona on the caller-facing side.
- Not: replacing Talkdesk routing, queues, or telephony.
- Not: custom ASR/TTS — ElevenLabs provides the voice stack.
- Not: any retirement plan-admin functionality (that's the other project).

## Open questions

- [ ] Authenticate before Navigator routing (shared with human path) or only on the AI path? (Lean: up front, shared.)
- [ ] What, if anything, may the AI *do* after OTP? (v1 = answer-only; confirm with compliance.)
- [ ] Which 3–5 topics for the pilot? (Highest-volume, lowest-risk, best KBA coverage.)
- [ ] How do KCS KBA updates propagate into the ElevenLabs KB — manual re-upload or sync? Owner + cadence?
- [ ] One human transfer queue or per-topic queues (right skill group)?
- [ ] Recording consent/disclosure wording + retention (compliance-owned).
- [ ] Who provisions the Talkdesk↔ElevenLabs SIP trunk and the custom-header contract?

---

*Scope locked: not yet — pending sponsor confirmation.*
