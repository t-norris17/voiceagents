# KBA — Reset Your NestEgg Password (Forgot Password)

**Project:** lumio-retirement-voice
**Source:** Tanner's Scribe "How to Log Into Your NestEgg Account" (2026-07-02)
**Use:** grounding knowledge for the voice agent + the corrected member-facing article
**Last updated:** 2026-07-01

> This is the **authoritative, corrected** version of the reset steps — it makes the
> "click Log In first" step explicit, which the current recorded IVR message omits (a likely
> driver of the 55% callback rate). Upload this as the agent's Knowledge Base document.

## What the member needs on hand
- Their **SSN**
- Their **date of birth**
- The **ZIP code** on their account
- The answer to their **security question**

## Steps

1. Go to **https://www.nesteggu.com/**
2. Click **Login**.
   - ⚠️ **The "Forgot Password" link only appears after you click Login.** This is the step
     most callers miss.
3. On the login screen, click **FORGOT PASSWORD**.
4. In the **SSN#** field, enter your Social Security number.
5. In the **Birth Date** field, enter your date of birth — **include the slashes** (MM/DD/YYYY).
6. In the **Zip Code** field, enter your account ZIP.
7. Click **NEXT**.
8. Answer your **security question**.
9. Click **NEXT**, then follow the prompts to set your new password.

## Notes for the voice agent
- The site's Forgot Password flow is **self-service and knowledge-based** (SSN + DOB + ZIP +
  security question). There is **no emailed reset link** in this flow (confirm with the
  business if an email option exists).
- The caller re-enters SSN/DOB/ZIP on the site even though they may have already verified those
  with the agent by phone — a "capture once" opportunity for a future integrated flow.
- The security-question answer is a hard gate: if the caller doesn't know it, guide them to the
  fallback / live agent.
- Success = the caller sets a new password and logs in. Confirm that before ending the call.
