# Procedure — Account Recovery / Password Reset (POC demo flow)

**Project:** lumio-retirement-voice
**Topic key:** `account_recovery`
**Type:** Free-form procedure (branches, confirms, grounds on a KBA, calls tools)
**Status:** draft — POC demo target for **Tue Jul 7**
**Last updated:** 2026-07-01

> Supersedes the earlier guide-only version. This flow is **transactional**: the agent
> verifies the caller, sends an OTP, sends a reset link/temp password, stays on the line while
> they complete it, checks in periodically, and writes back a resolution.
>
> **⭐ Jul 7 demo variant (simplified — see `demo-script.md`):** auth is **SSN + address** (no
> OTP), delivery is an **email reset link to the address on file** (no SMS/temp password), and
> the "split" is the agent offering *email link vs. guided walkthrough*. Tools reduce to
> `verify_caller`, `send_reset_email`, `document_resolution`. The full OTP/SMS flow below is the
> richer production target for phase 2.

---

## Why this exists (the data)

Current recorded-message flow: volume **3,136**, only **3% short-abandon** (self-served), but
**55% call back**. The message can't confirm steps, can't adapt, and is **missing the "click
Log In to reveal Forgot Password" step**. Target metric: **first-call resolution** (no
callback), proven by keeping the caller on the line until they're actually logged in.

## The 8-step demo flow → ElevenLabs mechanics

| # | Step | How it's built |
|---|---|---|
| 1 | **Verify the caller** | `verify_caller` webhook tool (POC: mock, synthetic test identity) |
| 2 | **Validate why they're calling** | Agent asks the reason; captures intent → matches "account recovery" |
| 3 | **Pull up the Account Recovery procedure** | This free-form procedure's trigger fires; grounded in the corrected KBA |
| 4 | **Send an OTP to mobile** | `send_otp` then `verify_otp` webhook tools (proves phone possession) |
| 5 | **Send reset link or temp password to mobile** | `send_reset` webhook tool (`method=link` or `temp_password`) |
| 6 | **Stay on the line while they do it** | `Skip turn` system tool + "take turn after silence" so the agent waits without hanging up |
| 7 | **~Every-30s check-ins** | "Take turn after silence" (≤30s) prompts "How's it going?"; confirm each step incl. the missing Log In step |
| 8 | **Write back the resolution** | `document_resolution` webhook tool (disposition → mock store / Data Collection) |

---

## Free-form procedure content (agent instructions)

> Goal: get the caller logged in with a new password, **confirmed working, on this call**.
> Speak one step at a time and **wait for confirmation**. Short, spoken sentences. Patient,
> plain tone. Escalate (simulated in POC) only when genuinely blocked. **POC: synthetic test
> data only — never handle a real SSN or real member data.**

### Step 1 — Verify the caller
Ask for the identifying details, then call **`verify_caller`**. If not verified after two
attempts → do not proceed (in POC, say you'd transfer to an agent).

### Step 2 — Confirm the reason
*"What can I help you with today?"* → confirm it's account recovery / can't log in / password
reset. (If it's something else and out of the pilot scope → simulated transfer.)

### Step 3 — Enter the Account Recovery procedure
(Trigger fires automatically.) Tell the caller you can help them reset it right now and will
stay on the line.

### Step 4 — Send + verify OTP
*"I'm sending a one-time code to the mobile number on file — read it back to me when it
arrives."* Call **`send_otp`**, then **`verify_otp`** with what they read back. Handle: no code
after ~1 min → resend once → else simulated transfer.

### Step 5 — Send the reset
Once the OTP is verified: *"I've sent a password-reset link to your phone."* Call
**`send_reset`** (`method=link` for the demo; `temp_password` is the alternate branch).

### Step 6–7 — Stay on the line and walk them through it
Use **Skip turn** to wait while they tap the link; check in when they go quiet (≤30s):
1. *"Open the link I just sent. Tell me when the reset page has loaded."* — wait.
2. **(The missing step — the fix.)** *"If it drops you on the login page, click **Log In**
   first — the reset field shows up after that. Let me know when you see it."* — wait.
3. *"Set your new password — it needs [PASSWORD RULES]. Tell me when it's saved."* — wait.
4. **Verify success:** *"Now sign in with the new password. Were you able to get in?"*
   - Yes → done. No → troubleshoot once (caps lock, spaces, right username) → else transfer.

Check-in style while waiting: *"Still with you — how's it going so far?"* Never go silent for
long; never dump all steps at once.

### Step 8 — Document the resolution
Call **`document_resolution`** with `{ outcome, method, steps_completed, notes }`. Confirm to
the caller it's done and ask if there's anything else.

### Escalation triggers (simulated in POC — no Talkdesk)
Not verified · never registered / needs activation · account locked · no OTP after resend ·
no reset message · link errors · any step fails twice · caller asks for a person.

---

## Tools this procedure calls (POC = mocked; see `poc-mock-tools.js`)

| Tool | Input | Output |
|---|---|---|
| `verify_caller` | `{ last4_ssn, dob, ... }` (TEST data) | `{ verified, subject_ref }` |
| `send_otp` | `{ subject_ref, channel:"sms" }` | `{ sent, otp_id }` |
| `verify_otp` | `{ otp_id, code }` | `{ verified }` |
| `send_reset` | `{ subject_ref, method:"link"\|"temp_password" }` | `{ sent }` |
| `document_resolution` | `{ subject_ref, outcome, method, steps_completed, notes }` | `{ logged }` |

## Data captured (→ resolution + metrics)
`topic=account_recovery` · `outcome` (resolved/transferred/abandoned) · `auth_outcome` ·
`method` (link/temp_password) · `transfer_reason` · free-text `notes`.

## Fix the KBA too
Correct the source KCS article to include the "click Log In to reveal Forgot Password" step so
the agent, the article, and web self-serve all match.
