# Demo talk track — Robin (NestEgg U voice agent) · Tue Jul 7

**Project:** nestegg-u-demo
**Purpose:** the single word-for-word script to rehearse and record against. Four scenarios:
password reset, plan questions, no-email transfer, and failed verification.
**Last updated:** 2026-07-06

> **Synthetic data only.** SSNs are in the invalid 900-range. The only real values are the "email
> on file" (`DEMO_EMAIL` = presenter's inbox) and the specialist transfer number (presenter's phone).
> After **every** call, an end-of-call **report email** lands in `DEMO_EMAIL`.

---

## Voice & tuning (recap of the dialed-in settings)
- Voice: warm American female — Sarah / Rachel / Jessica (A/B'd against the IVR).
- **Stability ~45%**, Similarity ~80%, Style ~10–15%, **Flash v2.5**, Optimize latency 3.
- LLM **Gemini 2.5 Flash**, **temp 0.53**, Thinking Budget off, **Soft Timeout OFF**.
- RAG on, Character limit ~8k, Chunk limit ~5.

## Demo identity cards (have these on screen)

**Card A — Michael Reynolds** — happy path + Vertex plan participant:
| Field | Value |
|---|---|
| Date of birth | **April 12, 1968** |
| SSN (last 4) | **0123** |
| Email on file | yes (`DEMO_EMAIL`) |
| Plan | Vertex Manufacturing 401(k) · $142,350 · fully vested · **no loan** |

**Card B — Dana Osborne** — no email on file → transfer:
| Field | Value |
|---|---|
| Date of birth | **January 1, 1970** |
| SSN (last 4) | **0000** |
| Email on file | none → transfers to presenter's phone |

**Card C — failed verification:** any DOB + last-4 that isn't A or B (e.g., **March 3, 1980 / 5555**).

---

## Scenario 1 — Password reset (the headline)

> **Robin:** "Thank you for calling NestEgg U support — this is Robin. How can I help you today?"
> **Caller:** "Hi, I can't get into my account."
> **Robin:** "I'm sorry about that — I can help you get back in. First, let me verify your identity.
> Can I get your date of birth and the last four digits of your Social Security number?"
> **Caller:** "April 12th, 1968, and last four — zero one two three."
> *(verify_caller → verified, email on file)*
> **Robin:** "Perfect, you're verified. I'll send a secure reset link to the email on file right now
> and stay on the line with you. Give it a few seconds — check spam if it doesn't appear."
> *(send_reset_email → link lands in the inbox)*
> **Caller:** "Got it… I clicked the link, but it's asking me to log in."
> **Robin:** "That's expected — click **Log In** first, and the reset field shows up right after."
> *(← the 55%-callback fix)*
> **Caller:** "Oh, there it is."
> **Robin:** "Great. Set your new password — at least 12 characters with a number and a symbol.
> Tell me once it's saved."
> **Caller:** "Done."
> **Robin:** "Now sign in with the new password to make sure it works. Are you in?"
> **Caller:** "Yep, I'm in."
> **Robin:** "Wonderful — you're all set. Anything else I can help with?"
> **Caller:** "Nope, thanks."
> **Robin:** "Happy to help, Michael. Take care!" *(document_resolution → resolved)*

## Scenario 2 — Plan questions (Michael, after verifying)

> **Robin:** "Thanks for calling NestEgg U support — this is Robin. How can I help?"
> **Caller:** "I've got a couple questions about my 401(k)."
> **Robin:** "Happy to help — let me quickly verify you first. Your date of birth and the last four
> of your Social?"
> **Caller:** "April 12th, 1968, and zero one two three."
> *(verify_caller → verified. Note the identity gate: Robin names no plan until now.)*
> **Robin:** "Perfect, you're verified. What would you like to know?"
>
> **Caller:** "Can I take out a loan against my 401(k)?"
> *(Plan Questions procedure → RAG over the Loans article → get_plan_details)*
> **Robin:** "Yes — the Vertex plan allows loans: the lesser of fifty thousand dollars or half your
> vested balance, one at a time, repaid over up to five years through payroll. Looking at your
> account, you're fully vested with no loan outstanding, so you could borrow up to about **fifty
> thousand**. Want me to point you to where to request it?"
>
> **Caller:** "Good to know. Can I roll over a previous 401(k) into this one?"
> **Robin:** "Yes — the plan accepts roll-ins from old 401(k), 403(b), and 457(b) plans and
> traditional IRAs, pre-tax or Roth. The cleanest way is a direct rollover, with no taxes withheld.
> **Would you like the number for NestEgg's Rollover Concierge to get it started?**"
>
> **Caller:** "Maybe later. I'm also thinking about leaving the company — how does that affect it?"
> **Robin:** "Your vested balance is yours to keep. You'd have four options: leave it in the Vertex
> plan — you're above the seven-thousand-dollar threshold — roll it to a new employer's plan, roll
> it to an IRA, or take cash, though cash is taxed and usually penalized before 59½. Since you're
> 58 and leaving after 55, a distribution from this plan would avoid the ten-percent penalty, though
> it's still taxed. **Want the steps to start a rollover?**"
> **Caller:** "That's really helpful — that's all for now."
> **Robin:** "Glad I could help. Take care!" *(document_resolution → resolved)*

## Scenario 3 — No email on file → transfer (Dana Osborne)

> **Robin:** "…How can I help you today?"
> **Caller:** "I'm locked out and need to reset my password."
> **Robin:** "I can help — first, your date of birth and the last four of your Social?"
> **Caller:** "January 1st, 1970, and zero zero zero zero."
> *(verify_caller → verified, **no email on file**)*
> **Robin:** "Let me connect you to a specialist who can verify you another way — one moment."
> *(transfer_to_number → **presenter's phone rings**; document_resolution → transferred)*

## Scenario 4 — Failed verification → transfer

> **Robin:** "…How can I help you today?"
> **Caller:** "I can't log in."
> **Robin:** "First, your date of birth and the last four of your Social?"
> **Caller:** "March 3rd, 1980, five five five five."
> *(verify_caller → not verified)*
> **Robin:** "Hmm, that doesn't match what we have on file. Let's try once more — your date of
> birth and last four?"
> **Caller:** *(gives a wrong value again)*
> *(verify_caller → not verified, 2nd try)*
> **Robin:** "I'm not able to verify you here, so I'll connect you to a specialist — one moment."
> *(transfer_to_number → presenter's phone; document_resolution → transferred)*

---

## Demo framing (open & close)
- **Open (30s):** "Password reset alone is 3,136 calls — only 3% self-serve, but **55% call back**,
  because the recorded message can't adapt and skips a step. Watch a conversational agent."
- **Close (30s):** the number that matters is **callback rate** (baseline 55%). Then: "and it's not
  just reset — it answers real plan questions, and every call writes back a summary." Roadmap:
  Talkdesk routing + the metrics dashboard + 150-plan rollout.

## Rehearsal + recording checklist
- [ ] Voice matches the IVR; latency snappy; **no spoken audio tags** ("Acknowledge"); plan answers
      end with a **warm follow-up**, not silence.
- [ ] Scenario 1 (reset) — link lands, "Log In first" caught, login confirmed.
- [ ] Scenario 2 (plan) — verify gate holds (no plan details before verifying); loan/rollover/leaving
      answer fast + confident + with a follow-up offer.
- [ ] Scenario 3 (no email) — transfer rings the presenter's phone, no long pause.
- [ ] Scenario 4 (failed auth) — transfers after two tries.
- [ ] Post-call **report email** lands in `DEMO_EMAIL` after each call.
- [ ] **Record a clean screen+audio backup of Scenario 1** (and ideally Scenario 2). Never demo
      live without the backup.
- [ ] Identity cards A/B/C on screen; framing rehearsed.
