# SPEC — NestEgg U Password-Reset Voice Demo

**Slug:** nestegg-u-demo
**Status:** active
**Last updated:** 2026-07-02

> Scope: `SCOPE.md` (locked 2026-07-02). This spec covers **the demo only**. The program-level
> architecture (Talkdesk/SIP/Navigator, `ai_call_events`, the supervisor dashboard) lives in
> `phase2/` — see `phase2/PROGRAM-SPEC.md` — and is out of scope here.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Voice agent | **ElevenLabs Conversational AI** (dashboard config, not code) | Bought voice stack; free-form procedures + tools + Skip turn + transfer are all native |
| Agent logic | **Free-form procedure** grounded in the KBA | Structured procedures can't reference the KB; can't convert types later |
| Mock backend | **Node serverless on Vercel** (`mock-backend/`, `api/poc/[tool].js` handler) | Throwaway scratch project; in-memory state is fine for one demo session |
| Mock reset page | **Static hosted page** (same Vercel project, `/reset`) | The emailed link needs somewhere real to land; reproduces the "Log In first" quirk |
| Email delivery | **Resend** (`RESEND_API_KEY`) → `DEMO_EMAIL` | Sends the real reset link to the presenter's inbox on stage |
| Telephony | **ElevenLabs phone number** (primary) + **web widget** (backup) | Feels like the 1-800; widget is zero-setup fallback |
| Storage | **In-memory array** in the mock (resolutions log) | No DB for the demo; `ai_call_events` is phase 2 |
| Trigger | **Inbound call** → agent; **webhook tools** mid-call | Everything is call-driven; no cron |
| Outputs | (1) Voice + a **real reset email**; (2) a logged resolution (mock) | The two things the demo shows |

## Architecture

```
Caller ──dials──▶ ElevenLabs agent (warm female voice)
                    │
                    │ 1. "can't log in"  ── intent → Account Recovery procedure (free-form, KBA-grounded)
                    │ 2. verify_caller { last4_ssn, dob } ─────────▶ Vercel mock ─▶ { verified, subject_ref, has_email_on_file }
                    │        └─ not verified after 2 tries ─▶ transfer_to_number (specialist)
                    │ 3a. has_email_on_file = true:
                    │       send_reset_email { subject_ref } ──────▶ Vercel mock ─▶ Resend ─▶ DEMO_EMAIL  (link lands on stage)
                    │ 3b. has_email_on_file = false:
                    │       "I'll connect you to a specialist" ─▶ transfer_to_number (DEMO_TRANSFER_NUMBER)
                    │ 4. Skip turn + take-turn-after-silence (~25–30s): stay on the line, check in,
                    │    coach through the reset — incl. "click Log In first" — until login confirmed
                    │       └─ caller opens emailed link ─▶ Vercel /reset mock page (reproduces "Log In first")
                    │ 5. document_resolution { subject_ref, outcome, notes } ─▶ Vercel mock ─▶ { logged, ticket_id }
                    ▼
              Post-call Data Collection (topic, outcome, method) — native ElevenLabs analysis
```

**Flow in one line:** authenticate (SSN last-4 + DOB) → send reset link to the email on file
(or transfer if none) → stay on the line with ~30s check-ins, coaching the "Log In first" step,
until the caller is back in → log the resolution.

## File / folder structure

```
projects/nestegg-u-demo/
  SCOPE.md                      # locked scope
  SPEC.md                       # this file
  BUILD.md                      # session journal
  START-HERE.md                 # fresh-chat briefing  (needs re-badge to this flow)
  kba-nestegg-password-reset.md # KB doc — the corrected reset steps (agent grounds on this)
  procedure-password-reset.md   # free-form procedure  (trim to: verify SSN+DOB → send email → stay-on-line → document)
  demo-script.md                # word-for-word talk track + synthetic identity  (align auth to SSN+DOB)
  elevenlabs-poc-setup.md       # dashboard build guide + runbook  (add transfer tool + Resend + /reset page)
  mock-backend/                 # deploy-ready Vercel app (throwaway/scratch project)
    api/poc/[tool].js           #   the 3 webhook tools, routed by {tool} -> /api/poc/<tool>
    public/reset/index.html     #   the mock reset page -> served at /reset
    package.json .env.example README.md
  phase2/                       # deferred: PROGRAM-SPEC.md, TOOLS-AND-WEBHOOK.md, 001_ai_call_events.sql
```

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| ElevenLabs Conversational AI | The agent: voice, procedure, tools, transfer, post-call data | Dashboard login; webhook tools call the mock over HTTPS | To build |
| Vercel (scratch project) | Host `mock-backend/` (the 3 webhook tools + the `/reset` page) | Project env vars | To deploy |
| Resend | Send the real reset email on stage | `RESEND_API_KEY` (env) | To wire |
| Demo inbox (`DEMO_EMAIL`) | The "email on file" the link lands in | Presenter's own inbox | Presenter-provided |
| Demo phone (`DEMO_TRANSFER_NUMBER`) | Transfer target for the no-email / failed-auth branch | ElevenLabs `transfer_to_number` config | Presenter-provided (not in repo) |

## Key decisions

- **Email-link flow, not guided self-service.** Per Tanner's target workflow: the agent sends a
  reset link and coaches; the caller performs the reset. (Reverses the earlier self-service lean.)
- **The emailed link opens a mock page, not the live site.** NestEgg's real Forgot Password is
  self-service with no emailed link, so a real reset email can't point at nesteggu.com. The mock
  page reproduces the **"click Log In first"** quirk so the agent still lands the business-case beat.
- **Auth = SSN (last 4) + DOB.** Phone-safe, enough to prove the concept; synthetic identity only.
- **`verify_caller` returns `has_email_on_file`.** That single flag drives the step-3 branch
  (send vs. transfer) cleanly, instead of the agent guessing.
- **Secrets stay out of the repo.** `DEMO_EMAIL`, `RESEND_API_KEY`, and `DEMO_TRANSFER_NUMBER`
  are env / dashboard config. The mock never echoes full PII (returns a masked address).
- **Native post-call Data Collection over a custom webhook** for the demo — the phase-2
  `ai_call_events` pipeline is not built here.
- **Backup recording is mandatory.** A clean screen+audio capture of the happy path, recorded
  Monday, is the fallback if live audio/network/email wobbles on stage.

## Open questions

- [ ] None blocking the build. Voice A/B (Sarah/Rachel/Jessica) against the IVR is tuning, not a gate.
- [ ] Confirm Resend can send from a verified domain/sender in time, or use Resend's onboarding
      sender (`onboarding@resend.dev`) to `DEMO_EMAIL` for the demo.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Live email latency / spam filtering delays the link on stage | Medium | Test delivery the day before; mention "check spam"; **backup recording** if it stalls |
| Real-site dependency creeps back in | Low | Locked: link opens the **mock** `/reset` page, fully under our control |
| Reset email fails to send during the demo | Medium | Resend tested ahead; agent has a graceful "give it a moment" check-in; backup video |
| Latency / awkward pauses make the agent feel robotic | Medium | Low-latency (Flash/Turbo) model; rehearse cadence; tune take-turn-after-silence to ~25s |
| Transfer branch misfires (wrong number / no answer) | Low | `DEMO_TRANSFER_NUMBER` = presenter's phone; test one transfer before the demo |
| Procedures are Alpha; trigger matching is a black box | Medium | Tight trigger phrases; conservative prompt; default to transfer when unsure |
| Handling of the "Log In first" beat feels scripted | Low | Coach it only if the caller hits it; keep the line warm and brief |
| Synthetic-data slip (a real SSN/PII enters the demo) | Low/High-impact | Only real values are `DEMO_EMAIL` + `DEMO_TRANSFER_NUMBER`; identity is the 900-range test card |

---

*Spec last updated: 2026-07-02*
