# Demo talk track — Account Recovery (Tue Jul 7)

**Project:** lumio-retirement-voice
**Purpose:** the word-for-word conversation to rehearse against. Tune the agent until a live
call sounds like this: clear, crisp, smooth, warm.
**Last updated:** 2026-07-01

> The boss ("caller") phones the agent, authenticates with the demo identity below, and is
> resolved by an emailed reset link that he completes while the agent stays on the line.
> **Synthetic data only.** The one real value is the "email on file" — set it to the boss's own
> inbox so the reset email actually arrives on stage.

---

## Voice

Match the current IVR: a **warm, clear American female voice.** Recommended ElevenLabs default
voices to A/B against your IVR recording — pick the closest:

1. **Sarah** — soft, warm, professional (best default for support/IVR)
2. **Rachel** — calm, clear, neutral
3. **Jessica** — friendly, a touch more expressive

Voice settings: **Stability ~55–65%** (consistent, not flat), **Similarity ~80%**, low
**Style** for a natural read. Use a **low-latency model (Flash/Turbo)** so replies feel instant
— responsiveness matters more than anything on stage. Rehearse and listen for filler/awkward
pauses; adjust "take turn after silence" to ~25s.

## Demo identity (give this card to the boss)

| Field | Value |
|---|---|
| Name | Michael Reynolds |
| Date of birth | April 12, 1968 |
| SSN (synthetic — invalid by design) | 900-55-0123 (last 4: **0123**) |
| Address | 1010 Elm Street, Wichita, KS 67202 |
| Email on file | **[BOSS_EMAIL — his real inbox so the link lands]** |

---

## The conversation (target read)

**Agent:** "Thanks for calling [PLATFORM] support. I can help you get back into your account.
First, I just need to verify your identity — can I get your full name and date of birth?"

**Caller:** "Michael Reynolds, April 12th, 1968."

**Agent:** "Thank you, Michael. And to confirm it's really you, what are the last four digits of
your Social Security number and the ZIP code on your account?"

**Caller:** "0123, and 67202."

> *(Agent calls `verify_caller`.)*

**Agent:** "Perfect — you're verified. What can I help you with today?"

**Caller:** "I can't log into my account. I need to reset my password."

> *(Account Recovery procedure triggers.)*

**Agent:** "No problem at all, I can take care of that right now. I can do it two ways: I can
send a secure reset link to the email we have on file, or I can walk you through resetting it
yourself on the site. Which would you prefer?"

**Caller:** "Send me the link."

**Agent:** "You got it — sending that now to the email on file."

> *(Agent calls `send_reset_email`.)*

**Agent:** "That's on its way — it should land in the next few seconds. I'll stay right here
with you. Let me know when you see it. And just a heads-up, check your spam folder if it
doesn't appear."

**Caller:** "Okay… got it."

**Agent:** "Great. Go ahead and click the **Reset Password** link in that email. Tell me when
the page opens."

**Caller:** "It's asking me to log in."

**Agent:** "That's expected — click **Log In** first, and the reset field will appear right
after. That step trips a lot of people up." *(← the fix for the 55% callback)*

**Caller:** "Oh — there it is."

**Agent:** "Perfect. Now enter your new password. It needs at least [PASSWORD RULES]. Tell me
once you've saved it."

**Caller:** "Done."

**Agent:** "Nicely done. Let's make sure it worked — go ahead and log in with your new
password. Are you in?"

**Caller:** "Yep, I'm in."

**Agent:** "Wonderful — you're all set. I'll note that your password reset is complete. Is there
anything else I can help you with today?"

> *(Agent calls `document_resolution`.)*

**Caller:** "Nope, that's it."

**Agent:** "Happy to help, Michael. Have a great day."

---

## The "split in the road" (if the boss picks *guide me* instead)

**Agent:** "Sure — let's do it together. Open your browser and go to [URL]… " → then the same
click-**Log In**-first → Forgot Password → new password → verify-login sequence, one step at a
time. Either branch ends the same way: confirmed login + `document_resolution`.

## Rehearsal checklist
- [ ] Verify voice matches the IVR (A/B with the real recording).
- [ ] `send_reset_email` actually delivers to the boss's inbox (test the day before).
- [ ] Latency feels instant; no long pauses; check-in cadence natural (~25s).
- [ ] Run both branches (link + guided) once each.
- [ ] **Record a clean screen+audio backup** of the happy path Monday. Never demo live without it.
- [ ] Have the identity card and password rules on screen for the boss.
