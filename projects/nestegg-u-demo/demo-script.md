# Demo talk track — NestEgg U Password Reset (Tue Jul 7)

**Project:** nestegg-u-demo
**Purpose:** the word-for-word conversation to rehearse against. Tune the agent until a live
call sounds like this: clear, crisp, smooth, warm.
**Last updated:** 2026-07-02

> The caller phones the agent, authenticates with **SSN (last 4) + date of birth**, and the agent
> **emails a reset link to the address on file**, then stays on the line — checking in ~every 30s
> — coaching the caller (including the "click Log In first" step) until they're back in.
> **Synthetic data only.** The only real values are the "email on file" (the presenter's own
> inbox, so the link lands on stage) and the specialist transfer number (the presenter's phone).

---

## Voice

Match the current IVR: a **warm, clear American female voice.** A/B these ElevenLabs defaults
against the IVR recording and pick the closest:

1. **Sarah** — soft, warm, professional (best default for support/IVR)
2. **Rachel** — calm, clear, neutral
3. **Jessica** — friendly, a touch more expressive

Voice settings: **Stability ~55–65%**, **Similarity ~80%**, low **Style**. Use a **low-latency
model (Flash/Turbo)** so replies feel instant. Set **"take turn after silence" ~25s** so the
agent checks in naturally while the caller works the reset.

## Demo identities (give the happy-path card to the caller)

**Happy path — has an email on file:**

| Field | Value |
|---|---|
| Name | Michael Reynolds |
| Date of birth | April 12, 1968 |
| SSN (synthetic — invalid by design) | last 4: **0123** |
| Email on file | **[DEMO_EMAIL — presenter's own inbox so the link lands]** |

**Transfer branch — no email on file** (optional second pass):

| Field | Value |
|---|---|
| Name | Dana Osborne |
| Date of birth | January 1, 1970 |
| SSN (synthetic) | last 4: **0000** |
| Email on file | *(none — triggers the specialist transfer)* |

---

## The conversation (target read — happy path)

**Agent:** "Thanks for calling NestEgg U support — I can help you get back into your account.
First, let me verify your identity. Can I get your date of birth and the last four digits of
your Social Security number?"

**Caller:** "April 12th, 1968, and last four 0123."

> *(Agent calls `verify_caller { last4_ssn, dob }` → `{ verified: true, has_email_on_file: true }`.)*

**Agent:** "Perfect — you're verified. What can I help you with today?"

**Caller:** "I can't log into my account. I need to reset my password."

> *(Account Recovery procedure triggers.)*

**Agent:** "No problem at all — I'll send a secure reset link to the email we have on file right
now, and I'll stay on the line with you while you finish it."

> *(Agent calls `send_reset_email`.)*

**Agent:** "That's on its way — it should land in the next few seconds. Let me know when you see
it. And a quick heads-up: check your spam folder if it doesn't appear."

**Caller:** "Okay… got it."

**Agent:** "Great. Go ahead and click the **Reset Password** link in that email. Tell me when the
page opens."

**Caller:** "It's asking me to log in."

**Agent:** "That's expected — click **Log In** first, and the reset field will appear right
after. That's the step that trips most people up." *(← the fix for the 55% callback)*

**Caller:** "Oh — there it is."

**Agent:** "Perfect. Now set your new password. It needs to be **at least 12 characters and
include a number and a symbol.** Tell me once you've saved it."

**Caller:** "Done."

**Agent:** "Nicely done. Let's make sure it worked — go ahead and log in with your new password.
Are you in?"

**Caller:** "Yep, I'm in."

**Agent:** "Wonderful — you're all set. I'll note that your password reset is complete. Is there
anything else I can help you with today?"

> *(Agent calls `document_resolution`.)*

**Caller:** "Nope, that's it."

**Agent:** "Happy to help, Michael. Have a great day."

---

## The branch — no email on file (optional second pass)

**Agent:** "Perfect — you're verified. What can I help you with today?"

**Caller:** "I'm locked out, I need to reset my password."

> *(Agent calls `verify_caller` → `{ verified: true, has_email_on_file: false }`.)*

**Agent:** "I can help with that. It looks like we don't have an email address on file for your
account, so I'll connect you to a specialist who can verify you another way and get you reset.
One moment — transferring you now."

> *(Agent calls `transfer_to_number` → the presenter's demo phone. `document_resolution` with
> `outcome: "transferred"`.)*

---

## Rehearsal checklist
- [ ] Voice A/B'd against the IVR recording — pick the closest.
- [ ] `send_reset_email` actually delivers to `DEMO_EMAIL` (test the day before).
- [ ] Latency feels instant; no long pauses; check-in cadence natural (~25s).
- [ ] Run **both** branches once: happy path (email link) + no-email (transfer).
- [ ] Transfer connects to the demo phone on the no-email branch.
- [ ] **Record a clean screen+audio backup** of the happy path Monday. Never demo live without it.
- [ ] Have the identity cards + password rules on screen for the caller.
