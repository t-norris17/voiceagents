# START HERE — NestEgg U password-reset demo

**Read this first.** It's the briefing for picking up the demo in a fresh chat.

**Goal:** a working ElevenLabs voice-agent demo where a caller resets their NestEgg password,
guided by a warm female-voiced agent that catches the step people miss.
**Deadline:** working demo **Tue Jul 7** (~4 working days).
**Scope:** ElevenLabs only — **no Talkdesk, no dashboard** (those are `phase2/`). One topic.

---

## The story (why this matters)

Password reset is **3,136 calls**. Only **3%** self-serve today; **55% call back** because the
recorded IVR message can't adapt and **skips a step** ("click Log In before Forgot Password").
The demo shows a conversational agent resolving it on the first call. Lead and close with the
**55% callback** number — that's the business case.

## Confirmed facts

- **Platform:** NestEgg, at **https://www.nesteggu.com/**
- **Real reset flow** (from Tanner's Scribe → `kba-nestegg-password-reset.md`):
  Login → **Forgot Password** → SSN → Birth Date (with slashes) → ZIP → NEXT → security question
  → NEXT → set new password.
- **The missing step:** you must click **Log In** *before* "Forgot Password" appears. This is
  the fix that beats the 55% callback.
- **Voice:** warm American **female** to match the current IVR (A/B Sarah / Rachel / Jessica).

## ⚠️ OPEN DECISIONS — resolve these before building

1. **Reset method — email link vs. self-service?** Tanner's Scribe shows NestEgg's Forgot
   Password as **self-service, knowledge-based** (SSN + DOB + ZIP + security question) with **no
   emailed reset link**. An earlier demo plan assumed the agent emails a link.
   → **Recommended:** demo the **guided self-service** flow (matches reality; most defensible).
   Only keep the email-link path if the business confirms NestEgg actually sends reset emails.
2. **Demo account?** Guided self-service on the *real* site needs a working test NestEgg account
   with known SSN/DOB/ZIP/security answer. If there isn't one, fall back to the agent narrating
   the steps against a mock (still smooth, not touching the live site).

The talk track (`demo-script.md`) and mock tools (`poc-mock-tools.js`) currently assume the
**email-link** variant. **Once the two decisions above are settled, update them** — for guided
self-service you only need `verify_caller` + `document_resolution` (no email tool), and the
talk track's middle section becomes the on-site step-by-step from the KBA.

## What's already done (in this folder)

| File | What it is |
|---|---|
| `SCOPE.md` / `SPEC.md` / `BUILD.md` | Project-spec docs (BUILD has the full session history) |
| `kba-nestegg-password-reset.md` | Authoritative reset steps (from the Scribe) — the agent's Knowledge Base doc |
| `procedure-password-reset.md` | The free-form procedure (has a "Jul 7 demo variant" note) |
| `demo-script.md` | Word-for-word talk track + synthetic identity card + voice pick |
| `elevenlabs-poc-setup.md` | Build guide: agent settings, system prompt, tool schemas, runbook |
| `poc-mock-tools.js` | Mock backend for the webhook tools (deploy to a scratch Vercel project) |
| `phase2/` | Talkdesk + metrics-dashboard reference (deferred, not for the demo) |

## Next steps to Tuesday

1. Resolve the two open decisions above.
2. If guided self-service: update `demo-script.md` + `procedure-password-reset.md` to the on-site
   flow; trim `poc-mock-tools.js` to `verify_caller` + `document_resolution`.
3. Build the agent in the ElevenLabs dashboard from `elevenlabs-poc-setup.md`; upload
   `kba-nestegg-password-reset.md` as the Knowledge Base; A/B the female voice against the IVR.
4. (If email variant) deploy `poc-mock-tools.js` to a scratch Vercel project; test delivery.
5. Rehearse the talk track; tune latency + check-in cadence.
6. **Record a clean screen+audio backup Monday.** Never demo live without it.

## Synthetic identity for the demo

See `demo-script.md`. SSN is in the invalid 900-range (fake by design). The only real value is
the "email on file" (set to the presenter's own inbox) — and only if you keep the email variant.
