# START HERE — NestEgg U password-reset demo

**Read this first.** It's the briefing for picking up the demo in a fresh chat.

**Goal:** a working ElevenLabs voice-agent demo where a caller resets their NestEgg password —
the agent authenticates them, emails a reset link, and stays on the line (catching the step
people miss) until they're back in.
**Deadline:** working demo **Tue Jul 7**.
**Scope:** ElevenLabs only — **no Talkdesk, no dashboard** (those are `phase2/`). One topic.
**Status:** scope + spec **locked** (2026-07-02). Building now — see `SPEC.md` for the plan and
`BUILD.md` for the latest "Next session" briefing.

---

## The story (why this matters)

Password reset is **3,136 calls**. Only **3%** self-serve today; **55% call back** because the
recorded IVR message can't adapt and **skips a step** ("click Log In before Forgot Password").
The demo shows a conversational agent resolving it on the first call. Lead and close with the
**55% callback** number — that's the business case.

## The locked flow

1. Caller says they can't get into their account.
2. Agent authenticates with **SSN (last 4) + date of birth**.
3. **If email on file →** agent sends a **reset link** to it (Resend → the mock reset page).
   **If no email on file →** agent says *"I'll connect you to a specialist"* → **transfers**.
4. Agent **stays on the line, ~30s check-ins**, coaching the caller (including **"click Log In
   first"**) until they've reset the password and confirmed they're logged in.
5. Agent documents the resolution.

## Confirmed facts & decisions

- **Platform:** NestEgg, at **https://www.nesteggu.com/**
- **Reset flow = email link** (Tanner's call). The emailed link opens a **mock `/reset` page we
  build** — the live site is self-service with no emailed link, so we don't touch it. The mock
  page reproduces the "click Log In first" quirk so the agent still catches it.
- **Auth:** SSN last-4 + DOB. **Password rules:** 12+ chars incl. a number and a symbol.
- **Email:** **Resend** → `DEMO_EMAIL` (presenter's own inbox — the one real value allowed).
- **No-email branch:** real `transfer_to_number` to the presenter's demo phone
  (`DEMO_TRANSFER_NUMBER` — kept in env / dashboard config, **not** in the repo).
- **Voice:** warm American **female** to match the IVR (A/B Sarah / Rachel / Jessica).

## What's already done (in this folder)

| File | What it is |
|---|---|
| `SCOPE.md` / `SPEC.md` / `BUILD.md` | Project-spec docs — scope + spec locked; BUILD has session history |
| `kba-nestegg-password-reset.md` | Authoritative reset steps (from the Scribe) — the agent's Knowledge Base doc |
| `procedure-password-reset.md` | The free-form procedure — aligned to the locked email-link flow |
| `demo-script.md` | Word-for-word talk track + synthetic identity cards + voice pick |
| `elevenlabs-poc-setup.md` | Build guide: agent settings, system prompt, tool schemas, runbook |
| `poc-mock-tools.js` | Mock backend: `verify_caller`, `send_reset_email`, `document_resolution` |
| `reset-page/` | The mock reset page the emailed link opens (reproduces "Log In first") |
| `phase2/` | Program spec + Talkdesk/dashboard reference (deferred, not for the demo) |

## Next steps to Tuesday

1. **Build the mock backend + reset page:** deploy `poc-mock-tools.js` + `reset-page/` to a
   scratch Vercel project; set `DEMO_EMAIL`, `RESEND_API_KEY`, `RESET_PAGE_URL`; test delivery.
2. **Build the agent** in the ElevenLabs dashboard from `elevenlabs-poc-setup.md`; upload
   `kba-nestegg-password-reset.md` as the Knowledge Base; register the 3 webhook tools + the
   transfer tool; A/B the female voice against the IVR.
3. **Rehearse** `demo-script.md`; tune latency + the ~30s check-in cadence; run both branches.
4. **Record a clean screen+audio backup Monday.** Never demo live without it.

## Synthetic identity for the demo

See `demo-script.md`. SSNs are in the invalid 900-range (fake by design). The only real values
are the "email on file" (`DEMO_EMAIL` = presenter's inbox) and the specialist transfer number
(presenter's phone).
