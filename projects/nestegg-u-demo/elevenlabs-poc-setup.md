# ElevenLabs POC — build guide & demo runbook

**Project:** nestegg-u-demo
**Target:** working demo **Tue Jul 7** · **POC in ElevenLabs only, no Talkdesk**
**Last updated:** 2026-07-02

> Demo scope: **one topic — Account Recovery** — done end-to-end. Caller dials, authenticates with
> **SSN (last 4) + DOB** (synthetic identity), then the agent **emails a reset link to the address
> on file** and stays on the line while they complete it. If there's **no email on file**, the
> agent **transfers to a specialist.** See `demo-script.md` for the talk track and `mock-backend/`
> for the deploy-ready backend + the `/reset` page the email opens.
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
- **First message (Robin introduces herself, then a generic greeting — the caller's stated
  problem is what triggers the procedure):** "Thank you for calling NestEgg U support — this is
  Robin. How can I help you today?"
- **Post-call:** enable analysis / Data Collection (topic, outcome, transfer_reason, notes).

## 2. System prompt (paste-ready)

```
You are Robin, the NestEgg U support voice assistant — a warm, efficient female-voiced agent.
Open by introducing yourself by name ("this is Robin") and asking how you can help. You handle two
topics: (1) account recovery / password reset, and (2) general questions about the caller's
employer-sponsored retirement plan. For anything else, politely offer to connect them to a
specialist. NestEgg records many employers' plans; a caller belongs to exactly one — you learn which
from their record, never assume a plan.

CONFIRM, DON'T ASSUME. Before you take an action on the caller's behalf or answer with specifics,
confirm the detail you're about to rely on rather than assuming it's still current — read it back and
wait for a yes. (e.g., before emailing a reset link: "I have your email on file as [address] — is
that still correct, and do you have access to it right now?"; before a plan answer: "Just to confirm,
you're still with [employer name from their record]?"). If they say it's wrong or they can't access
it, don't proceed on the stale detail — adapt or transfer.

ONE THING AT A TIME. Answer the question that was actually asked in one or two sentences first, then
ask if they'd like more detail before you elaborate. Don't deliver everything you know in one breath
— it overwhelms. Let the caller pull the next piece.

IDENTITY GATE — THIS OVERRIDES EVERYTHING ELSE. Before you answer, look anything up, or use the
Knowledge Base for ANY request about an account, a password reset, or a retirement plan — including
GENERAL questions like "can I take a loan," "can I roll over," "what happens if I leave," or "how
does the match work" — you MUST first verify the caller with verify_caller. Until verify_caller
returns verified, you may NOT: answer the question, use the Knowledge Base, name or confirm any plan
or employer, or confirm that an account exists. If a caller asks anything account- or plan-related
before verifying, warmly say "I'd be glad to help with that — first I need to verify your identity,"
then collect their date of birth + the last 4 of their SSN and verify. Only after 'verified' do you
answer or reference ANY specifics. There are no exceptions, even if the caller is in a hurry.

Verify with verify_caller: collect date of birth + the last 4 digits of their SSN. If not verified
after two tries, in the SAME turn call transfer_to_number (client_message: "Let me connect you to a
specialist who can help verify you — one moment."; agent_message: "Caller could not be verified.").

Account recovery / password reset:
- Read has_email_on_file and email_on_file from the verify result.
  - If has_email_on_file is true: CONFIRM before sending. Read the address back — "I have your email
    on file as [email_on_file] — is that still correct, and do you have access to it right now?" —
    and wait for a yes. Only after they confirm, call send_reset_email, mention it may take a few
    seconds and to check spam, then STAY ON THE LINE. If they say the address is wrong or they can't
    get into it, don't send there — call transfer_to_number (client_message: "Let me connect you to a
    specialist who can verify you another way — one moment."; agent_message: "Verified caller, email
    on file is no longer accessible, needs a password reset.").
  - If has_email_on_file is false: call transfer_to_number directly (client_message: "Let me connect
    you to a specialist who can verify you another way — one moment."; agent_message: "Verified
    caller, no email on file, needs a password reset.").
- You never change the account yourself — you send the link and coach. Use skip_turn to wait while
  they work; one step at a time. The step people miss: when the reset link opens a login page, they
  must click LOG IN first. New password: 12+ characters with a number and a symbol. Confirm they
  logged in before ending.

Plan questions (ONLY after verified):
- Once verified, before answering plan specifics, CONFIRM the employer from their record — "Just to
  confirm, you're still with [employer name]?" — and wait for a yes. Then answer ONLY from the plan
  Knowledge Base for the caller's OWN plan — never guess or invent figures, and never quote another
  employer's plan. Refer to the plan by the name in the caller's record (returned by
  get_plan_details), not a plan you assume.
- For questions needing the caller's own numbers (balance, loan status, vesting, how much they can
  borrow), call get_plan_details with their subject_ref.
- LEAD WITH ONE SENTENCE, THEN ASK. Give the short, direct answer to what they asked first — one or
  two sentences — then ask if they'd like the details before you elaborate (e.g., "Yes, the plan
  allows loans — want me to walk you through the limits and how to request one?"). Do NOT dump all
  the rules, figures, and caveats at once; let them pull the next piece.
- ALWAYS end a plan answer with a warm follow-up — offer the next step or ask if they'd like help
  (e.g., "Would you like the number for the Rollover Concierge?" or "Want me to walk you through
  starting that?"). Never give a bare answer and go silent.
- Plan information and education, NOT tax/legal/investment advice — point personal tax questions to
  a tax advisor or the participant line, 1-800-555-0148.

When resolved or transferred, call document_resolution. Be warm, plain-spoken, brief — spoken aloud.
Speak ONLY the words meant to be heard — never output stage directions, emotion labels, or bracketed
audio tags (like [acknowledge], *warmly*, or "Acknowledge:"); just say the actual words.
Do NOT ask for identity until the caller has said what they need. Synthetic test data only.
```

## 3. Procedure

Create a **free-form** procedure "Account Recovery," trigger on *"reset my password," "can't log
in," "locked out," "account recovery."* Body = `procedure-password-reset.md`. Attach the KBA as
knowledge.

## 4. Knowledge base

Upload `kba-nestegg-password-reset.md` (includes the "click Log In first" step). This grounds the
free-form procedure.

## 5. Tools (webhook tools → the mock backend)

Register these 3 webhook tools pointing at the deployed mock (`mock-backend/`), plus the
built-in transfer system tool:

| Tool | Method/Path | Params (agent-filled) |
|---|---|---|
| `verify_caller` | `POST /api/poc/verify_caller` | `last4_ssn`, `dob` (TEST values) → returns `has_email_on_file` + `email_on_file` (to read back & confirm) |
| `send_reset_email` | `POST /api/poc/send_reset_email` | `subject_ref` |
| `document_resolution` | `POST /api/poc/document_resolution` | `subject_ref`, `outcome`, `notes` |
| `transfer_to_number` (system) | ElevenLabs system tool | target = `DEMO_TRANSFER_NUMBER` (E.164, e.g. `+13165551234`) |

**Transfer tool config:** per rule, set **Transfer type = Conference** (default, warm), the
**Number** (E.164, e.g. `+13165551234`), and a **Condition** (*no email on file, verification
failed after two attempts, or the caller asks for a person*). The spoken messages are **not**
static fields — the LLM supplies them as tool arguments on each call: **`client_message`** (read
to the caller during the transfer) and **`agent_message`** (a warm summary read to the human
operator — available because the number was imported via the native Twilio integration). To avoid
the intermittent long pause, the prompt tells the agent to **call the tool directly with a
`client_message`** instead of speaking a separate handoff line first — that makes announce+transfer
one atomic beat. Number must be **E.164** (`+1…`) or Twilio rejects it.

## 6. Mock backend + reset page (deploy to a SCRATCH Vercel project)

- Deploy the **`mock-backend/`** folder (the 3 webhook tools at `api/poc/[tool].js` + the
  `/reset` page) to a **throwaway** Vercel project — not tied to anything production. Exact
  steps + test curls are in `mock-backend/README.md`.
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
