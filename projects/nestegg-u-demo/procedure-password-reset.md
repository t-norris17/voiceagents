# Procedure — Account Recovery / Password Reset (demo flow)

**Project:** nestegg-u-demo
**Topic key:** `account_recovery`
**Type:** Free-form procedure (branches, confirms, grounds on a KBA, calls tools)
**Status:** active — demo target for **Tue Jul 7**
**Last updated:** 2026-07-02

> **Locked flow (see `SCOPE.md` / `SPEC.md`):** the agent verifies the caller with **SSN last-4 +
> DOB**, then — **if there's an email on file** — sends a **reset link** to it and stays on the
> line, checking in ~every 30s, coaching them (including the "click Log In first" step) until
> they're back in. **If there's no email on file → transfer to a specialist.** Then it documents
> the resolution. No OTP/SMS in the demo (that's a phase-2 enrichment — see `phase2/`).

---

## Why this exists (the data)

Recorded-message flow: volume **3,136**, only **3% short-abandon** (self-served), but **55% call
back**. The message can't confirm steps, can't adapt, and is **missing the "click Log In to
reveal Forgot Password" step**. Target metric: **first-call resolution** (no callback), proven by
keeping the caller on the line until they're actually logged in.

## The flow → ElevenLabs mechanics

| # | Step | How it's built |
|---|---|---|
| 1 | **Verify the caller** | `verify_caller { last4_ssn, dob }` webhook tool → `{ verified, subject_ref, has_email_on_file }` (POC: mock, synthetic identity) |
| 2 | **Confirm why they're calling** | Agent asks the reason; matches "account recovery / can't log in / password reset" |
| 3a | **Email on file → send the reset link** | `send_reset_email { subject_ref }` → link to the mock reset page, delivered via Resend |
| 3b | **No email on file → transfer** | Agent: *"I'll connect you to a specialist"* → `transfer_to_number` (system tool) |
| 4 | **Stay on the line + ~30s check-ins** | `Skip turn` + "take turn after silence" (≤30s); coach each step incl. the missing **Log In** step, until login is confirmed |
| 5 | **Write back the resolution** | `document_resolution { subject_ref, outcome, notes }` → mock store / Data Collection |

---

## Free-form procedure content (agent instructions)

> Goal: get the caller logged in with a new password, **confirmed working, on this call**. Speak
> one step at a time and **wait for confirmation**. Short, spoken sentences. Patient, plain tone.
> **POC: synthetic test data only — never handle a real SSN or real member data.**

> **Triggers after the greeting.** The agent's first message is a generic greeting ("How can I
> help you today?"); the caller stating they can't get in / need a reset is what fires this
> procedure. Do **not** ask for identity until the caller has said what they need.

### Step 1 — Acknowledge, then verify identity
Briefly reassure them (*"I'm sorry about that — I can get you back in"*). Then, before anything
else, ask for their **date of birth + the last 4 digits of the SSN** and call **`verify_caller`**.
If not verified after two attempts → stop and **transfer to a specialist** (simulated in POC).

### Step 2 — Send the reset link, or transfer
Read `has_email_on_file` from the verify result:
- **Has an email on file:** *"I'll send a secure reset link to the email on file right now, and
  I'll stay on the line with you."* Call **`send_reset_email`**. Mention it may take a few seconds
  and to check spam.
- **No email on file:** *"It looks like we don't have an email on file for your account, so I'll
  connect you to a specialist who can verify you another way."* Call **`transfer_to_number`**,
  then **`document_resolution`** with `outcome: "transferred"`.

### Step 3 — Stay on the line and walk them through it
Use **Skip turn** to wait while they open the link; check in when they go quiet (≤30s):
1. *"Open the link I just sent. Tell me when the reset page has loaded."* — wait.
2. **(The missing step — the fix.)** *"If it drops you on the login page, click **Log In** first —
   the reset field shows up right after. Let me know when you see it."* — wait.
3. *"Set your new password — it needs to be **at least 12 characters with a number and a symbol.**
   Tell me when it's saved."* — wait.
4. **Verify success:** *"Now sign in with the new password. Were you able to get in?"*
   - Yes → done. No → troubleshoot once (caps lock, spaces, right username) → else transfer.

Check-in style while waiting: *"Still with you — how's it going so far?"* Never go silent for
long; never dump all steps at once.

### Step 4 — Document the resolution
Call **`document_resolution`** with `{ subject_ref, outcome, notes }`. Confirm to the caller it's
done and ask if there's anything else.

### Escalation triggers (simulated in POC — no Talkdesk)
Not verified after two tries · no email on file · account locked / needs activation · link errors
· any step fails twice · caller asks for a person.

---

## Tools this procedure calls (POC = mocked; see `mock-backend/`)

| Tool | Input | Output |
|---|---|---|
| `verify_caller` | `{ last4_ssn, dob }` (TEST data) | `{ verified, subject_ref, has_email_on_file }` |
| `send_reset_email` | `{ subject_ref }` | `{ sent, delivered_to }` |
| `document_resolution` | `{ subject_ref, outcome, notes }` | `{ logged, ticket_id }` |
| `transfer_to_number` (system) | — | Simulated in POC; used on the no-email / failed-auth branch |

## Data captured (→ resolution + metrics)
`topic=account_recovery` · `outcome` (resolved / transferred / abandoned) · `auth_outcome` ·
`transfer_reason` (null unless transferred) · free-text `notes`.

## Fix the KBA too
Keep the source KCS article aligned with `kba-nestegg-password-reset.md` — including the "click
Log In to reveal Forgot Password" step — so the agent, the article, and web self-serve all match.
