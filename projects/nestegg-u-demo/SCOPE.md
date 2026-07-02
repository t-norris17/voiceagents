# SCOPE — NestEgg U Password-Reset Voice Demo

**Slug:** nestegg-u-demo
**Status:** draft
**Created:** 2026-07-02
**Effort:** M (~12 business hours / ~1.5 working days to **Tue Jul 7**)
**Owner:** Tanner

> **This scope is the demo only.** The broader program (Talkdesk routing, SIP, multi-topic
> pilot, Lumio metrics dashboard) is **phase 2** — captured in `SPEC.md` and `phase2/`. For the
> next 12 hours: one topic, done well.

---

## Problem

NestEgg U's password-reset call is **3,136 calls** in volume, but only **3% self-serve** and
**55% call back**. The recorded IVR message can't confirm or adapt, and it **omits the one
non-obvious step** — you must click **Log In** *before* the "Forgot Password" link appears. That
missing step is the likely driver of the callback rate. We need to prove, on a live demo call,
that a conversational agent resolves this on the first call.

## Solution

A single-topic **ElevenLabs voice agent** — warm, clear American female voice to match the
current IVR — that verifies the caller against a synthetic test identity, then **coaches them
through NestEgg's self-service password reset one step at a time**, explicitly naming the
"click Log In first" step, **staying on the line** (Skip turn + ~25s check-ins) until they've
**actually logged in with the new password**, and then logging the resolution. Built in the
ElevenLabs dashboard from `elevenlabs-poc-setup.md`, grounded in the corrected
`kba-nestegg-password-reset.md`, and rehearsed against `demo-script.md`.

## Success criteria

- [ ] A demo call runs the full happy path end-to-end — **verify → intent → guided reset →
      confirmed login → resolution logged** — and sounds warm, crisp, and smooth.
- [ ] The agent **explicitly catches the "click Log In first" step** mid-call (the 55%-callback fix).
- [ ] The agent **stays on the line** through the reset (Skip turn + ≤30s check-ins) with no dead
      air and without hanging up.
- [ ] A **clean screen+audio backup recording** of the happy path exists before Tuesday.

## Why now

Working demo is due **Tue Jul 7**; today is Jul 2, leaving **~12 business hours** to build,
rehearse, and record. This is the first concrete client-facing use of the platform; the boss is
both the demo audience and the sponsor. Everything ElevenLabs needs (KB-grounded free-form
procedures, Skip turn / take-turn-after-silence, webhook tools, post-call data) is verified
buildable today — see `../../docs/elevenlabs-reference.md`.

## Constraints

- **~12 business hours total**, inclusive of build + rehearsal + backup recording.
- **ElevenLabs only** — no Talkdesk, no SIP, no dashboard (all phase 2).
- **Regulated financial services: synthetic test data only.** No real SSN/PII. The only real
  value permitted is a demo *inbox*, and only if we keep an email step (we are not — see below).
- Procedures are **Alpha**; KBA answers must be **free-form** (structured can't reference the KB,
  and types can't be converted later).
- The agent is **configuration in the ElevenLabs dashboard, not code** in this repo. This repo is
  docs + (if needed) a small mock backend.

## Non-goals

- **Not: the email-reset-link flow.** The authoritative KBA shows NestEgg's Forgot Password as
  self-service (SSN + DOB + ZIP + security question) with **no emailed reset link**. We demo the
  guided self-service flow. *(Revisit only if the business confirms NestEgg actually sends reset
  emails — see open questions.)*
- Not: OTP/SMS, or any transactional account change — the agent **never touches the account**.
- Not: any topic besides account recovery / password reset.
- Not: Talkdesk routing, SIP trunking, or the Lumio metrics dashboard (phase 2).
- Not: the production webhook receiver, `ai_call_events` DB, or repo re-architecture.

## Open questions

> The first two gate the build plan. Current working assumptions in **bold**; confirm or flip.

- [ ] **Reset method — guided self-service** (assumed, per the KBA) **vs. email link.** Confirm
      NestEgg has no emailed reset-link option. If it does, the email variant is back on the table.
- [ ] **Demo surface — mock / narration** (assumed safe default) **vs. driving the real
      nesteggu.com site.** Upgrade to the real site only if a working synthetic test account
      (known SSN/DOB/ZIP/security answer) exists and the site is reliable on stage.
- [ ] **Password rules** for NestEgg (length/complexity) — needed for the "set your new password"
      step in the talk track. Currently a `[PASSWORD RULES]` placeholder.
- [ ] **Security-question fallback** — if the caller doesn't know their security answer (a hard
      gate), the agent guides them to a live agent. Confirm wording / simulated-transfer behavior.
- [ ] **Telephony** — provision a temporary ElevenLabs phone number vs. the web test widget.
      Default: do both; widget is the zero-setup backup.

---

*Scope locked: not yet — pending confirmation of the two working assumptions above.*
