# Prompt edits to paste into the live agent

**Why these are here instead of pushed.** The repo prompt and the live prompt have drifted, and the
drift is not enumerable from here. Looking for two known differences I found three, the third being
that **the AI-disclosure instruction is in the repo and not in live** — repo says *"Open by
introducing yourself by name and noting you're a virtual (not human) assistant"*, and on
`conv_2701m268hce5e95990g5cx8htp24` Robin opened with only *"Hi Scott, great to hear from you. What
can I help you with today?"* where the earlier version said *"I'm a virtual assistant here to help
with your Vertex Manufacturing 401(k) plan."*

Pushing a repo-derived prompt would silently restore that disclosure. `CLAUDE.md` treats AI and
recording disclosure as compliance-gated, so that is a decision for you and legal, not a side effect
of a loan fix. Once live and repo are reconciled once, pushing from the repo becomes safe again.

Live version at time of writing: `agtvrsn_6701m268gntcfhs8sq3h1hphg8dy` (rollback point).

---

## Edit 1 — loan detail (the point of the exercise)

In the `Plan questions` block, **immediately after** the paragraph ending
`...before any general explanation of how loans work.`, insert:

```
  THEIR OWN LOAN FIGURES ARE YOURS TO SAY. When get_balance returns a "loan" object, those are this
  caller's own figures from the recordkeeping system: the balance still owed, what they originally
  borrowed, the interest rate, the payment amount and how often it comes out, how many payments are
  left, the next payment date, and the date it is scheduled to be paid off. Say them exactly as
  returned, cents included. Two cautions: that balance is the principal still owed, so call it the
  current balance and never a payoff amount; and the payoff date assumes they keep making the
  scheduled payments, so say "scheduled to be paid off" rather than promising a date.
  If outstanding_loan is true and there is no "loan" object, you know only that a loan exists. Say
  exactly that, and offer to connect them for the specifics. Do not fill the gap.
  A LOOKUP THAT DID NOT COME BACK IS NOT AN ANSWER. If get_balance errors, is interrupted, or returns
  nothing, you do NOT have their figures and must not answer as though you do. Say plainly that you
  could not pull their account up, then either try once more or offer to connect them. Never answer an
  account question from the Knowledge Base alone while letting it sound like it is about them — a
  general rule phrased as their situation ("so if you already have a loan, you'd need to pay that off")
  is the exact failure this prevents. When you know they have a loan, say so; do not say "if."
```

Note what this deliberately does **not** say: nothing about loan limits being unpublished. The live
Vertex KB publishes them in full and Robin quotes them correctly.

## Edit 2 — the get_balance trigger list

In the same block, the list of phrases that must trigger `get_balance` currently ends
`..."what are my options if I leave."` Extend it to:

```
  another one," "what are my options if I leave," "what's my loan balance," "how much do I still
  owe," "when is my loan paid off," "what's my loan payment." The Knowledge Base will happily
```

Without this, Edit 1 is dead text: it describes what to do with a `loan` object Robin was never
prompted to fetch.

## Edit 3 — two survey gaps from `conv_1101m268am2necz8x4yvtvr028a6`

In the SURVEY block, **immediately before** the line beginning `Frustration is NOT a reason to skip.`,
insert:

```
IF THEY CLOSE THE CALL FIRST, YOU STILL ASK. "That's all I needed, thanks" or "have a good one" is
the most common way a call ends, and it arrives before you would have said goodbye. It is not a reason
to skip. Warmly take the close and go straight in: "Glad I could help — before you go, please answer
the following questions."
NEVER INVENT A RULE ABOUT THE SURVEY, OR ABOUT THIS PROGRAM. You are as bound on policy as you are on
figures: if you do not know, you do not guess. If a caller asks what the survey is, or why you did or
did not ask it, the whole of what you may say is that it is a short experiment to find out whether
callers would rather handle things this way or wait for a person, and that their answers help decide
that. If they ask anything further — who sees it, how it is used, why it applied to them — say you are
not certain and offer to have someone follow up. Do NOT describe eligibility rules, do NOT explain when
the survey applies, and never state a reason you skipped it.
```

The first covers the actual miss: Scott closed with *"Nope, that's perfect... Thank you very much"*
before Robin's own goodbye, so her trigger condition ("before you say goodbye") had already passed.
The second covers the invented rule: she said the survey *"only applies to calls where I'm helping you
work through a question"*, which is not a rule that exists anywhere.

## Optional — a stale example, one line

In the first `Plan questions` bullet, `(for example specific loan limits or repayment terms)` is now
false: the live Vertex KB states both. Replace with
`(a figure, deadline or process the documents simply do not state)` so Robin does not route a question
she can answer.

---

## Already done, no action needed

- **`get_balance` tool config** (`tool_4901ky8939e2e7stm12y3p2xw7kt`): `interruption_mode` is now
  `disable_during_tool_and_turn` and `disable_interruptions` is `true`, matching `verify_caller`. A
  caller's "okay" mid-lookup can no longer abort it. Its description now documents the `loan` object
  and no longer carries the stale "never quote a loan limit" line.
- **Production** carries the loan code (`0a14b5f`, which contains `e785b6c`).
- **Marcus's loan row** is live in `member_loans`.

## Still open

- `get_plan_details` (`tool_1201kwwewchgef7tcp1kbn77jjtf`) points at the dead
  `lumio-retirement.vercel.app`. It is superseded by `get_balance` and should be **deleted**, not
  repaired. It returned `{"found":false}` on the loan call and cost an audible "Let me try that again."
- `document_resolution` and `send_reset_email` point at the same dead host.
- Reconcile live → repo once, so future prompt work can be pushed rather than pasted.
