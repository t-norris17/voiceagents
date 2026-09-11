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

## 11. A must-happen step is not a prompt paragraph
Robin's survey ran on one real call and silently didn't on the previous one. The section opened with
`GATE — CHECK THIS BEFORE YOU EVEN CONSIDER ASKING` and spent roughly fifteen lines on five
exemptions before ever reaching "ask." Asked afterward why she skipped it, she generalised the
nearest exemption ("never raised a question") into "you got what you needed right away, so we skip
it." **Put the unconditional instruction first and the exemptions after it.** A list of reasons not
to act, read at maximum context length while the model decides whether to act, is the salient thing
in the window.

Also give the step a trigger the caller cannot preempt. "Before you say goodbye" assumes the agent
controls when goodbye happens; a satisfied caller saying "that's perfect, thank you very much" is the
most common ending there is, and it arrives first. Name that case explicitly.

Where the step is deterministic and needs no Knowledge Base — a fixed set of questions in a fixed
order — a **structured procedure** is the right home for it rather than prose. *Unverified:* procedure
triggers are documented around caller intent, and whether one can fire on "the call is wrapping up"
is untested. Test that before relying on it.

## 12. Protect every fact-supplying tool from interruptions
`get_balance` returned `is_error: true, "Tool execution was abandoned due to user input", latency 0`
because the caller said "Okay" while it was in flight. Robin then answered the question from the
Knowledge Base alone, with no account data, and sounded exactly as confident as if the lookup had
worked. A caller's "mhm" should never be able to strip the agent's facts.

Set `disable_interruptions: true` (and `interruption_mode: disable_during_tool_and_turn`) on every
tool that supplies figures, not just the auth tool. And instruct the agent that a failed or abandoned
lookup is something to retry or say out loud, never something to answer around.

## 13. Every gap gets an authorized answer, or it gets invention
Asked why she hadn't run the survey, Robin stated a policy that does not exist. Note what she did not
invent: a balance, a fee, a limit. The prompt says "never guess or invent figures" and she held that
line perfectly. It simply said nothing about inventing *program* rules.

Prohibitions do not generalise on their own. Anything the agent may plausibly be asked about the
program — what this survey is, why it applied, who sees it — needs a sanctioned sentence. And the
rule against inventing figures should be restated as a rule against inventing **anything the caller
could act on**, policy included.
