# ElevenLabs POC — build guide & demo runbook

**Project:** lumio-retirement-voice
**Target:** working demo **Tue Jul 7** · **POC in ElevenLabs only, no Talkdesk**
**Last updated:** 2026-07-01

> Demo scope: **one topic — Account Recovery** — done end-to-end. Boss calls, authenticates
> with **SSN + address** (synthetic demo identity), then the agent **emails a reset link to the
> address on file** and stays on the line while he completes it. See `demo-script.md` for the
> word-for-word talk track and `poc-mock-tools.js` for the backend.
> **Synthetic test data only — no real SSNs/member data. The one real value is the "email on
> file": set it to the boss's own inbox so the link arrives on stage.**

---

## 1. Agent settings (ElevenLabs dashboard)

- **Voice:** warm, clear **American female** voice to match the current IVR. A/B **Sarah**
  (recommended), **Rachel**, or **Jessica** against the IVR recording and pick the closest.
  Settings: Stability ~55–65%, Similarity ~80%, low Style. Use a **low-latency (Flash/Turbo)
  model** — instant replies matter most on stage.
- **Take turn after silence:** ~**25s** → drives natural "how's it going?" check-ins while he
  works the reset link. (Native max 30s; literal 60s needs client pings — out of scope.)
- **Enable system tool: Skip turn** → lets the agent wait patiently while he clicks the email.
- **First message:** "Thanks for calling [PLATFORM] support — I can help you get back into your
  account. First, let me verify your identity."
- **Post-call:** enable analysis / Data Collection (topic, outcome, method, notes).

## 2. System prompt (paste-ready)

```
You are the retirement platform support voice assistant for [PLATFORM], a warm and efficient
female-voiced agent. In this POC you handle ONE thing: account recovery / password reset. For
anything else, politely say you'll connect them to a live agent.

Hard rules:
- Verify the caller with verify_caller BEFORE any account help: collect name + date of birth,
  then last 4 of SSN + account ZIP code. If not verified after two tries, stop and offer to
  transfer to a live agent.
- You never change the account yourself. You offer two options: send a secure reset link to the
  email on file (send_reset_email), or walk them through resetting it on the site. Let them
  choose.
- If they choose the email link: call send_reset_email, tell them it's on the way (mention the
  spam folder), then STAY ON THE LINE. Use skip_turn to wait; check in when they go quiet.
- Guide ONE step at a time; wait for confirmation before the next; never read all steps at once.
- Critical step people miss: when the reset link opens the login page, they must click LOG IN
  first — the reset field only appears after that.
- Before ending, confirm they actually logged in with the new password. If not, troubleshoot
  once, then transfer.
- When resolved, call document_resolution to log the outcome.
- Be warm, plain-spoken, and brief — this is spoken aloud. Assume low tech comfort.
- POC: synthetic test data only. Never ask for or handle a real SSN.
```

## 3. Procedure

Create a **free-form** procedure "Account Recovery," trigger on *"reset my password," "can't
log in," "locked out," "account recovery."* Body = `procedure-password-reset.md` (use the
"Jul 7 demo variant"). Attach the corrected KBA as knowledge.

## 4. Knowledge base

Upload the **corrected** reset KBA (must include the "click Log In first" step). Draft it if the
knowledge team hasn't — dependency.

## 5. Tools (webhook tools → the mock backend)

Register these 3 webhook tools pointing at the deployed mock (`poc-mock-tools.js`):

| Tool | Method/Path | Params (agent-filled) |
|---|---|---|
| `verify_caller` | `POST /api/poc/verify_caller` | `name`, `dob`, `last4_ssn`, `zip` (TEST values) |
| `send_reset_email` | `POST /api/poc/send_reset_email` | `subject_ref` |
| `document_resolution` | `POST /api/poc/document_resolution` | `subject_ref`, `outcome`, `notes` |

## 6. Telephony + email for the demo

- Calling: provision a temporary **ElevenLabs phone number** and have the boss dial it (feels
  like the 1-800). The **web test widget** is the zero-setup fallback.
- Email: set `DEMO_EMAIL` (boss's inbox) + an email provider in the mock so the reset link
  actually arrives. Test delivery the day before.

---

## Demo runbook (Tuesday)

**Frame (30s):** "This topic is 3,136 calls. Only 3% self-serve today — but **55% call back**,
because the recorded message can't adapt and is missing a step. Watch a conversational agent."

**Live call — happy path (email link):**
1. Boss dials, agent greets, verifies via **name + DOB + last-4 SSN + ZIP** (demo identity).
2. "I can't log in." → agent offers **email link vs guided** → boss picks the link.
3. Agent emails the reset link → **it lands in the room** → agent stays on the line and coaches
   him through it, including **"click Log In first."**
4. Agent confirms he's logged in → logs the resolution.

**Optional second pass — the split:** run it again choosing "walk me through it" to show the
guided branch.

**Close (30s):** the metric that matters is **callback rate** (baseline 55%). Roadmap: more
topics from the transcript analysis, then Talkdesk routing + a Lumio metrics dashboard.

**Backup:** record a clean screen+audio capture of the happy path Monday. If live audio/network
wobbles, play the video — never demo live without a backup.

## Dependencies / risks for Tuesday
- Corrected reset KBA text (with the missing step).
- Email delivery to the boss's inbox tested ahead of time.
- Voice A/B'd against the IVR; latency rehearsed.
- Synthetic identity card printed for the boss.
