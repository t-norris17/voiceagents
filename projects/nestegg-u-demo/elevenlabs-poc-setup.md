# ElevenLabs POC — build guide & demo runbook

**Project:** nestegg-u-demo
**Target:** working demo **Tue Jul 7** · **POC in ElevenLabs only, no Talkdesk**
**Last updated:** 2026-07-02

> Demo scope: **one topic — Account Recovery** — done end-to-end. Caller dials, authenticates with
> **SSN (last 4) + DOB** (synthetic identity), then the agent **emails a reset link to the address
> on file** and stays on the line while they complete it. If there's **no email on file**, the
> agent **transfers to a specialist.** See `demo-script.md` for the talk track, `poc-mock-tools.js`
> for the backend, and `reset-page/` for the page the email opens.
> **Synthetic test data only.** The only real values are `DEMO_EMAIL` (presenter's own inbox, so
> the link lands on stage) and `DEMO_TRANSFER_NUMBER` (presenter's phone, the transfer target).

---

## 1. Agent settings (ElevenLabs dashboard)

- **Voice:** warm, clear **American female** to match the current IVR. A/B **Sarah** (recommended),
  **Rachel**, or **Jessica** and pick the closest. Settings: Stability ~55–65%, Similarity ~80%,
  low Style. Use a **low-latency (Flash/Turbo) model** — instant replies matter most on stage.
- **Take turn after silence:** ~**25s** → drives natural "how's it going?" check-ins while they
  work the reset link. (Native max 30s.)
- **Enable system tools: Skip turn** (wait while they click the email) and **Transfer to number**
  (the no-email / failed-auth branch).
- **First message:** "Thanks for calling NestEgg U support — I can help you get back into your
  account. First, let me verify your identity."
- **Post-call:** enable analysis / Data Collection (topic, outcome, transfer_reason, notes).

## 2. System prompt (paste-ready)

```
You are the NestEgg U support voice assistant, a warm and efficient female-voiced agent. In this
POC you handle ONE thing: account recovery / password reset. For anything else, politely say
you'll connect them to a specialist.

Hard rules:
- Verify the caller with verify_caller BEFORE any account help: collect date of birth + the last
  4 digits of their SSN. If not verified after two tries, stop and transfer to a specialist.
- Read has_email_on_file from the verify result:
  - If true: tell them you'll send a secure reset link to the email on file, call
    send_reset_email, mention it may take a few seconds and to check spam, then STAY ON THE LINE.
  - If false: say "I'll connect you to a specialist who can verify you another way," and transfer.
- You never change the account yourself — you send the link and coach; the caller does the reset.
- Use skip_turn to wait while they work; check in when they go quiet. Guide ONE step at a time;
  wait for confirmation before the next; never read all steps at once.
- Critical step people miss: when the reset link opens a login page, they must click LOG IN first
  — the reset field only appears after that.
- The new password must be at least 12 characters and include a number and a symbol.
- Before ending, confirm they actually logged in with the new password. If not, troubleshoot
  once, then transfer.
- When resolved (or transferred), call document_resolution to log the outcome.
- Be warm, plain-spoken, and brief — this is spoken aloud. Assume low tech comfort.
- POC: synthetic test data only. Never ask for or handle a real SSN.
```

## 3. Procedure

Create a **free-form** procedure "Account Recovery," trigger on *"reset my password," "can't log
in," "locked out," "account recovery."* Body = `procedure-password-reset.md`. Attach the KBA as
knowledge.

## 4. Knowledge base

Upload `kba-nestegg-password-reset.md` (includes the "click Log In first" step). This grounds the
free-form procedure.

## 5. Tools (webhook tools → the mock backend)

Register these 3 webhook tools pointing at the deployed mock (`poc-mock-tools.js`), plus the
built-in transfer system tool:

| Tool | Method/Path | Params (agent-filled) |
|---|---|---|
| `verify_caller` | `POST /api/poc/verify_caller` | `last4_ssn`, `dob` (TEST values) → returns `has_email_on_file` |
| `send_reset_email` | `POST /api/poc/send_reset_email` | `subject_ref` |
| `document_resolution` | `POST /api/poc/document_resolution` | `subject_ref`, `outcome`, `notes` |
| `transfer_to_number` (system) | ElevenLabs system tool | target = `DEMO_TRANSFER_NUMBER` |

## 6. Mock backend + reset page (deploy to a SCRATCH Vercel project)

- Deploy `poc-mock-tools.js` (the 3 webhook tools) and `reset-page/index.html` (the page the
  email links to) to a **throwaway** Vercel project — not tied to anything production.
- **Env vars:** `DEMO_EMAIL` (presenter inbox), `RESEND_API_KEY`, `RESEND_FROM` (a verified
  sender, or `onboarding@resend.dev` for a quick demo), `RESET_PAGE_URL` (the deployed `/reset`
  URL). Suggested routing: API at `/api/poc/<tool>`, page at `/reset`.
- **Test delivery the day before:** call `send_reset_email` and confirm the link lands in
  `DEMO_EMAIL` and the page reproduces the "click Log In first" quirk.

## 7. Telephony for the demo

ElevenLabs does **not** sell native numbers — you either dial from the browser widget or import a
Twilio number. Two paths:

- **Web test widget (zero setup):** call the agent from the browser. Fine for the happy path.
  ⚠️ But the widget has no real phone leg, so a live **transfer to your phone won't connect** —
  the no-email branch can only be *narrated*, not actually transferred.
- **Twilio number (recommended if you want the "dial the 1-800" feel + a real transfer):** buy a
  number in Twilio and **import it into ElevenLabs**. Use a **paid** number (~$1–2/mo), not a
  trial number — trial numbers play a Twilio preamble and only call verified numbers. This makes
  `transfer_to_number` → `DEMO_TRANSFER_NUMBER` actually ring the presenter's phone.
- Set the transfer target (`DEMO_TRANSFER_NUMBER`) on the transfer tool; test one transfer before
  the demo.

---

## Demo runbook (Tuesday)

**Frame (30s):** "This topic is 3,136 calls. Only 3% self-serve today — but **55% call back**,
because the recorded message can't adapt and is missing a step. Watch a conversational agent."

**Live call — happy path (email link):**
1. Caller dials; agent greets and verifies via **DOB + last-4 SSN** (demo identity).
2. "I can't log in." → agent sends the reset link to the email on file.
3. Link **lands in the room** → agent stays on the line and coaches through it, including
   **"click Log In first"** and the 12-char password rule.
4. Agent confirms they're logged in → logs the resolution.

**Optional second pass — the transfer branch:** run it with the **no-email identity** (Dana
Osborne) → agent says "I'll connect you to a specialist" → transfers to the demo phone.

**Close (30s):** the metric that matters is **callback rate** (baseline 55%). Roadmap: more
topics from the transcript analysis, then Talkdesk routing + a Lumio metrics dashboard.

**Backup:** record a clean screen+audio capture of the happy path Monday. If live audio/network
wobbles, play the video — never demo live without a backup.

## Dependencies / risks for Tuesday
- Email delivery to `DEMO_EMAIL` tested ahead of time (Resend sender verified).
- Reset page deployed and reachable at `RESET_PAGE_URL`.
- Voice A/B'd against the IVR; latency rehearsed.
- Synthetic identity cards on screen for the caller.
