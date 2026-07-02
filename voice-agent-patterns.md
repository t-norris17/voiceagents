# Voice-agent design patterns

Reusable patterns distilled from the NestEgg demo work. Apply these to any support voice agent.

---

## 1. One step at a time, confirm before advancing
Never read all the instructions at once. Say one step, **wait for the caller to confirm**, then
the next. This is the single biggest difference between a helpful agent and a recorded message.

## 2. Verify success before ending
Don't end on "you should be all set." End on **confirmed success** — "log in with your new
password now; are you in?" This is what kills callback rates. Make it a hard step.

## 3. Name the step people miss
Recorded IVR messages skip the non-obvious step (for NestEgg: click **Log In** before "Forgot
Password" appears). Call it out explicitly and preempt the confusion.

## 4. Default to transfer when unsure
Trigger matching and LLM confidence aren't perfect. A conservative system prompt + an
aggressive **default-to-transfer** rule beats a confidently-wrong answer every time. Escalation
is a feature, not a failure — showing the agent knows its limits builds trust.

## 5. Guide-only vs. transactional — decide it
- **Guide-only:** the agent coaches the caller through self-service; never touches the account.
  Lowest risk; good default for v1/POC.
- **Transactional:** the agent takes actions (send OTP, send reset, update a record) via tools.
  Higher assurance auth required; get compliance sign-off before enabling.

## 6. Single-source the topic taxonomy
If a front-door router (e.g. Talkdesk Navigator) and the agent's procedure triggers both decide
"can the AI handle this?", author that list **once** and feed both. Drift routes callers to the
AI for things it then bounces back — the worst UX.

## 7. Stay-on-the-line + timed check-ins
Use "take turn after silence" (~25s) + Skip turn so the agent waits patiently and checks in
naturally while the caller works. Keep check-ins short and warm ("still with you — how's it
going?").

## 8. Success metric = first-call resolution, not deflection
For fix-it topics, the number that matters is **callback rate** (did they have to call again?),
not raw deflection. Instrument the resolution write-back and compare against the baseline.

## 9. Synthetic data only
Never use real SSNs/PII in a procedure, demo, or repo. The only acceptable real value is a
demo inbox for email-delivery testing. This is a hard rule in regulated financial services.

## 10. Voice matches the incumbent
Match the existing IVR voice (gender, warmth, cadence) so the agent feels like a natural
upgrade, not a jarring replacement. A/B against the real recording.
