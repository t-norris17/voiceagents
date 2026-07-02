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
**55% call back**. The recorded IVR message can't confirm or adapt, and callers get stuck — most
notoriously on the non-obvious step where you must click **Log In** *before* the "Forgot
Password" field appears. We need to prove, on a live demo call, that a conversational agent
authenticates the caller, gets a reset moving, and **stays with them until they're back in** —
resolving it on the first call.

## Solution — the target workflow

A single-topic **ElevenLabs voice agent** (warm, clear American female voice) that runs this flow:

1. **Caller** says they can't get into their account.
2. **Agent authenticates** them with **SSN + date of birth** (synthetic test identity).
3. On success, the **agent sends a password-reset link to the email address on file**
   (`send_reset_email`).
   - **If there is no email on file → transfer to a human** (simulated in the POC — no Talkdesk).
4. The **agent stays on the line, checking in ~every 30s** (Skip turn + take-turn-after-silence),
   coaching the caller as needed — including the **"click Log In first"** catch — **until the
   caller has reset their password and confirmed they're back in.** Then it logs the resolution.

Built in the ElevenLabs dashboard from `elevenlabs-poc-setup.md`, grounded in
`kba-nestegg-password-reset.md`, rehearsed against `demo-script.md`. The emailed link opens a
**mock reset page** we control (see the note under Constraints).

## Success criteria

- [ ] **Happy path, end-to-end:** "can't log in" → agent authenticates via **SSN + DOB** → sends
      the reset link to the email on file (**the link lands in the room**) → stays on the line
      with ~30s check-ins → caller completes the reset and **confirms they're logged in** →
      resolution logged. Sounds warm, crisp, smooth.
- [ ] The **"no email on file → transfer to a human"** branch is demonstrable (simulated in POC).
- [ ] The agent **stays on the line** without dead air and **catches the "click Log In first"
      step** during the reset (the 55%-callback fix).
- [ ] A **clean screen+audio backup recording** of the happy path exists before Tuesday.

## Why now

Working demo is due **Tue Jul 7**; today is Jul 2, leaving **~12 business hours** to build,
rehearse, and record. First concrete client-facing use of the platform; the boss is both the
demo audience and the sponsor. Everything ElevenLabs needs (KB-grounded free-form procedures,
webhook tools for the send + document actions, Skip turn / take-turn-after-silence, transfer to
human, post-call data) is verified buildable today — see `../../docs/elevenlabs-reference.md`.

## Constraints

- **~12 business hours total**, inclusive of build + rehearsal + backup recording.
- **ElevenLabs only** — no Talkdesk, no SIP, no dashboard (all phase 2). The transfer branch is
  therefore **simulated** in the POC.
- **Regulated financial services: synthetic test data only.** No real SSN/PII. **The one real
  value permitted is the demo *inbox*** — set the "email on file" to the presenter's own inbox so
  the reset link actually lands on stage.
- **Mock reset page:** NestEgg's live site is self-service (knowledge-based) and has **no emailed
  reset link** (per `kba-nestegg-password-reset.md`). So the emailed link must open a **mock
  reset page we control**, not the real nesteggu.com. That mock should reproduce the **"click Log
  In first"** quirk so the agent can catch it — that beat is the whole business case.
- Procedures are **Alpha**; the account-recovery procedure must be **free-form** (structured
  can't reference the KB; types can't be converted later).
- The agent is **configuration in the ElevenLabs dashboard, not code**. This repo is docs + a
  small mock backend (`poc-mock-tools.js`).

## Non-goals

- Not: **guided self-service on the real site.** We're doing the email-link flow instead.
- Not: OTP/SMS as a second factor (auth is SSN + DOB for the demo).
- Not: the agent **changing the password itself** — it sends the link and coaches; the caller
  performs the reset.
- Not: any topic besides account recovery / password reset.
- Not: Talkdesk routing, SIP trunking, a real human-transfer queue, or the Lumio metrics
  dashboard (phase 2).
- Not: the production webhook receiver, `ai_call_events` DB, or repo re-architecture.

## Tools the agent calls (POC = mocked; see `poc-mock-tools.js`)

| Tool | Input | Output |
|---|---|---|
| `verify_caller` | `{ last4_ssn, dob }` (TEST identity) | `{ verified, subject_ref, has_email_on_file }` |
| `send_reset_email` | `{ subject_ref }` | `{ sent, delivered_to (masked) }` |
| `document_resolution` | `{ subject_ref, outcome, notes }` | `{ logged, ticket_id }` |
| `transfer_to_number` (system) | — | Simulated in POC; used on the no-email branch |

## Open questions

- [ ] **Password rules** for the mock reset page (length/complexity) — needed for the "set your
      new password" step. Currently a `[PASSWORD RULES]` placeholder.
- [ ] **Email provider** for the demo (Resend / SendGrid / SES) + `DEMO_EMAIL` (presenter inbox)
      so the link actually delivers on stage.
- [ ] **SSN form** — read **last 4** (phone-safe convention) or full synthetic SSN? Assumed last 4.
- [ ] **Mock reset page** — build a tiny hosted page that reproduces the "click Log In first"
      quirk, or coach against a static screenshot? (Leaning: tiny hosted page for a live feel.)
- [ ] **No-email-on-file branch** — how to present the simulated transfer (agent message vs. a
      real `transfer_to_number` to a demo phone)?

---

*Scope locked: not yet — pending confirmation of the open questions above.*
