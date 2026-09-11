# Three Days with Robin — tester protocol

**Status:** submitted for approval 2026-09-11 ·
**Published:** https://claude.ai/code/artifact/30f17d77-27f7-4c66-b730-b6a392347b78

10 internal testers · 5 calls each · 3 business days · target ~45 survey responses.

---

## The two design decisions that shape everything

1. **Testers are not given the expected answers.** They will not know what Marcus's loan balance is
   supposed to be, so they *cannot* grade accuracy even if they want to — only whether the call felt
   like being helped. This is what lets the plan honestly claim to isolate experience. Accuracy is a
   separate later exercise against a graded question bank, run by us from the transcripts.
2. **Scenarios spread across `plan_topic`.** The dashboard slices NPS and preference by subject, and
   that slice is the highest-value thing in it. If every tester asks about loans it has one row and
   says nothing. S1–S8 span loans, rollover_in, leaving_employer and contributions_vesting.

## Profile — everyone calls as the same synthetic member

One profile across all testers on purpose: holding the account constant means differences in what
testers report are about Robin, not about which balance they were handed.

| | |
|---|---|
| Member ID | `90002` |
| Date of birth | September 30, 1998 |
| Plan | Vertex Manufacturing 401(k) |
| Number | +1 833 573 9530 |

Marcus is invented. No real member record is touched. Testers give *Marcus's* details when verifying,
never their own name, DOB, SSN or account number.

## Scenarios

S1 and S2 are run by everyone, for a common baseline. Each tester picks **three more** from S3–S8,
**from different subjects**.

| # | Scenario | Topic | Opening line | Watching for |
|---|---|---|---|---|
| S1 | Check the loan balance | loans | "I wanted to check on my 401(k) loan." | The straightforward case. Service, or a lookup you could have done yourself? |
| S2 | Ask for a second loan | loans | "I'm thinking about taking out another loan — can I do that?" | **The most important call in the set.** The answer is no. A well-delivered no is the hardest thing any service does, and whether it beats a hold queue is nearly the whole question. |
| S3 | Buying a house | loans | "I'm looking at buying a house and wondering what my options are." | Vague, open-ended, no single right answer. Does she stay useful? |
| S4 | Roll in an old account | rollover_in | "I've got a 401(k) from my last job — can I move it over?" | A process rather than a number. Do you know what to *do* next? |
| S5 | What if I leave | leaving_employer | "If I took another job, what happens to my account — and my loan?" | Two things at once. Does she connect the loan to the leaving? |
| S6 | Two numbers, one account | contributions_vesting | "There are two different balances — what's the difference?" | Explaining a concept, not reading a figure. |
| S7 | Change what I'm putting in | contributions_vesting | "I want to change my contribution — and can I do Roth?" | Handed homework, or walked through it? Two requests in one breath. |
| S8 | Just get me a person | handoff | "I'd rather just talk to a person." | The handoff. **Produces NO survey response by design** — the gate suppresses it on a transfer. Doesn't count toward the five. |

## Tester instructions

**Do:** talk normally (trail off, change your mind, interrupt); use the same phone every time so calls
group as yours; ask follow-ups; answer all four questions honestly, especially the *reason* for the
0–10.

**Don't:** try to break her (later phase); grade whether she's right (you don't have the answers);
over-enunciate to help her along; give real personal information.

**Known and expected, don't report:** she can't go deep on specifics beyond balance and loan detail
(that limit is the finding); a stray bracketed word; an occasional mispronunciation; "let me try that
again" mid-lookup.

## Data handling

Collected: call audio and transcript, the four survey answers including verbatim comments, call
metadata, and the tester's phone number — genuine personal data, hashed to an anonymous respondent
key for all reporting and never displayed.

Not collected: any real member data; any tester's own SSN/DOB/account. No production system is
touched.

**Disclosure.** Every tester is told in advance and in writing that they are calling an AI agent and
that the call is recorded. Robin does not state this herself in-call — a deliberate decision on
leadership's recommendation (see `CLAUDE.md` → Settled decisions). Because the wave is internal and
testers are briefed beforehand, no caller in this pilot is unaware of what they are speaking to.

## Success criteria — a baseline, not a bar

| Measure | Threshold for a valid wave |
|---|---|
| Survey responses | ≥ 40, across ≥ 8 testers |
| Survey adherence | ≥ 70% of eligible calls |
| Subject coverage | ≥ 4 of 5 subjects represented |
| Preference | **Reported, not targeted.** This wave sets the baseline. |
| Recommendation index | **Reported, not targeted**, and not comparable to a company-level NPS benchmark — it asks about an agent mid-task, a different question. |

Committing to a score threshold at this sample size would be false precision and would put pressure
on the result rather than the method.

**The one result that invalidates the wave:** low adherence. If Robin isn't reliably asking, every
other figure is drawn from a skewed slice. That gets reported as such rather than worked around.
