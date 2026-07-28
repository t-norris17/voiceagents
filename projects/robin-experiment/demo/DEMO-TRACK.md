# Demo track — Robin for the COO and CRO

**Project:** robin-experiment
**Audience:** COO, CRO
**Format:** live phone call, on speaker
**Last updated:** 2026-07-28

> **Synthetic data only.** The two demo callers below are invented. Member IDs `90001` / `90002` sit
> outside the 10001–10050 experiment range so nothing here touches a tester's record. No real member,
> no real balance, no SSN anywhere in the flow — Robin verifies on Member ID + date of birth and is
> hard-blocked from ever saying an SSN, User ID, password, or PIN aloud.

---

## Read this first — the demo is blocked until two things are fixed

**1. Robin has no INTRUST-specific answer for the employer match.** Both published match cards are
generic safe-harbor explainers that end in *"the exact one your employer uses is set in its plan
document."* Asked "does INTRUST match what I put in?", she will currently give a lecture on safe
harbor formulas rather than *your* formula. The card is written and ready at
[`kba/intrust-employer-match.md`](./kba/intrust-employer-match.md) — grounded in the 2025 INTRUST
Enrollment Packet, which already states dollar-for-dollar to 6%, vested immediately. **Publish it
through the Knowledge Factory before the demo.**

**2. RMD has no published card at all.** The old one is archived, and its own coverage flag reads
*"The specific RMD age is not stated in the source."* Send me the plan-document or SPD section on
required minimum distributions and it's a fifteen-minute turnaround. Until then, see
[Scenario 4](#scenario-4--rmd-the-honest-one) for how to play it.

> On "it's out in the ElevenLabs KBA" — worth a 30-second check in the ElevenLabs dashboard. Our
> pipeline **deletes** a document from ElevenLabs when an article is archived, so anything published
> through the console is definitely gone. If someone uploaded an RMD document to the agent by hand,
> it would still be attached and would not appear in our console. Either way, nothing changes for the
> demo prep: if she answers RMD specifically in rehearsal, great; if she routes, use Scenario 4.

---

## The bigger issue behind #1, in one paragraph

Of Robin's 30 published articles, **8 are INTRUST-specific and 22 are generic plan-document
boilerplate** — and 20 of those 22 explicitly defer to *"your employer,"* *"your plan document,"* or
*"check with your plan administrator."* That's a side effect of cleaning the 296-page generic plan
tome: the content is accurate, but it answers *"what does the law allow a plan to do?"* rather than
*"what does the INTRUST plan do?"* For an audience who runs INTRUST, that distinction is the whole
demo. It doesn't invalidate anything — the pipeline worked exactly as designed — but the next content
push should be **INTRUST's own documents**, not more generic material. Worth saying out loud in the
room; it's a credible answer to "what's next," not a weakness to hide.

---

## Pre-flight (do this the morning of)

- [ ] Publish `kba/intrust-employer-match.md` via the Knowledge Factory → Publish tab.
- [ ] RMD: publish a card from your source, or plan on Scenario 4.
- [ ] **Rehearse the full track end to end on a real call.** Not the QA console — the phone.
- [ ] Confirm `90001` / `90002` verify (they're seeded and consented).
- [ ] Have the [identity cards](#identity-cards) on screen or printed.
- [ ] Open the dashboard in a second tab for the close.
- [ ] Speakerphone tested in the actual room. Check the mute button.

---

## Identity cards

**Card A — Dana** *(main track: eligibility, match, balance, RMD, guardrail)*

| Field | Value |
|---|---|
| Member ID | **90001** |
| Date of birth | **April 12, 1953** |
| Plan | INTRUST 401(k) Plan |
| Balance | **$487,213.44** · fully vested · no loan · deferring 8% |

*Dana turns 73 this year — which is what makes the RMD question land as a real person's question
rather than a trivia prompt.*

**Card B — Marcus** *(second call: changing contributions, vested vs. total)*

| Field | Value |
|---|---|
| Member ID | **90002** |
| Date of birth | **September 30, 1998** |
| Plan | INTRUST 401(k) Plan |
| Balance | **$27,318.15** · **vested $19,122.70** · has a loan · deferring 6% |

**Card C — failed verification:** any Member ID / DOB that isn't A or B. Use **90001** with
**April 12, 1955** — a plausible near-miss, not an obviously fake ID.

---

## Call 1 — Dana (the main track, ~5 minutes)

> **Say to the room first:** "Everything you're about to hear comes from INTRUST's own plan documents.
> If it isn't in the documents, she won't say it. Watch for that."

### Scenario 1 — The identity gate (the security proof, and it's free)

> **Caller:** "Hi — I've got a couple of questions about my 401(k)."
> **Robin:** "I'd be glad to help with that — first I need to verify your identity. Can I get your
> Member ID and your date of birth?"

**This is the moment to point out, because the room will miss it:** she refused to answer *before*
being asked anything sensitive. She won't confirm the plan exists, won't touch the knowledge base,
won't acknowledge an account — until identity is established. And she asks for **Member ID and date
of birth**, never a Social Security number.

> **Caller:** "Member ID nine zero zero zero one, date of birth April twelfth, nineteen fifty-three."
> *(verify_caller → verified, subject_ref returned)*
> **Robin:** "Thanks, Dana — you're verified. What can I help you with?"

**Worth saying:** the tool hands back an opaque token, not her record. Nothing downstream ever sees a
Member ID or a date of birth again.

### Scenario 2 — Eligibility

> **Caller:** "When am I eligible to join the INTRUST 401(k) plan?"

**Expected:** eligible at **18**; entry date is the **first day of the month on or after** you turn
18; if you do nothing you're **automatically enrolled**. Then she offers the next step.

> ⚠️ **Phrase it that way on purpose.** There are eight published eligibility articles and only one
> is INTRUST-specific; the phrasing above matches its title almost word for word, so it wins
> retrieval. If someone in the room asks *"how long do I have to work before I can join?"* instead,
> she will likely pull the generic card and say *"the plan may not make you wait past 21… check with
> your plan administrator."* That's the collision described above. **Rehearse both phrasings so you
> know which one you're getting.**

### Scenario 3 — The employer match *(requires the new card)*

> **Caller:** "Does INTRUST match what I put in?"

**Expected:** **dollar for dollar up to 6%** of pay, **100% vested immediately**, then an offer of
more detail — and if pushed, the separate **3% contribution** for employees not in the INTRUST
Financial Corporation Employees' Retirement Plan, which vests on a three-year cliff.

**Why this one matters for the CRO:** it's the highest-volume real question in the queue and the
crispest-sounding answer she has. It's the one that makes her sound like she works there.

### Scenario 4 — RMD (the honest one)

> **Caller:** "I turn seventy-three this year. When do I have to start taking money out?"

**If the card is published:** she answers from your document.

**If it isn't** — and this is a strong moment, not a weak one, *if you set it up first:*

> **Say to the room before you ask it:** "This one she can't fully answer. Watch what she does."

**Expected:** she explains that the IRS requires minimum withdrawals once you reach the applicable
age, says she isn't certain of the specific age for this plan, and offers to connect Dana to a
specialist at **866-412-9026**. She will **not** invent 73, 72, or 75.

> **Then say:** "She'd rather hand off than guess. In a regulated business that's the only acceptable
> behavior, and it's enforced — she can only answer from documents we've given her. What you just saw
> is also how we find out what content to build next; that question is now in the queue automatically."

That transition sets up the close perfectly. **If the RMD card is published, deliberately ask a
different unanswerable question instead** — "what are the exact loan repayment terms?" works, because
the enrollment packet gives the $100 fee but no terms, and she's on record routing that one.

### Scenario 5 — Her own balance (the tool call)

> **Caller:** "What's my balance right now?"
> *(get_balance with the opaque subject_ref)*
> **Robin:** "Let me pull that up… you're at four hundred eighty-seven thousand, two hundred thirteen
> dollars and forty-four cents, and you're fully vested."

**The point for the COO:** that figure is read from the record, never generated. She narrates the
wait because there is a real one — she doesn't stall for effect.

### Scenario 6 — The guardrail (the CRO's question)

> **Caller:** "Which fund should I be in?"

**Expected:** she declines to give investment advice and routes to **INTRUST Participant Investment
Advice at 800-242-7111 ext. 1795**. This is prompt-enforced, not content-dependent — it's the most
reliable moment in the demo.

> **Say:** "She's a plan-information agent, not an adviser, and that boundary is hard-coded rather
> than hoped for."

---

## Call 2 — Failed verification (~1 minute)

> **Caller:** "Member ID nine zero zero zero one, April twelfth, nineteen fifty-five."
> *(verify_caller → not verified)*
> **Robin:** "That doesn't match what I have — let's try once more. Can I confirm your date of birth?"
> **Caller:** *(repeat the wrong date)*
> *(second failure → transfer_to_number in the same turn)*
> **Robin:** "Let me connect you to a specialist who can help verify you — one moment."

**Expected:** two attempts, then a warm transfer. **Zero** account detail leaked — she never confirms
whether 90001 exists, never names the plan, never hints at a balance.

> ⚠️ **This scenario ends in a transfer.** Know where that call lands before you dial it in front of
> your COO, and hang up cleanly.

---

## Call 3 — Marcus (optional, ~2 minutes)

Use if the room is engaged and you have time. It shows a second member and a different shape of answer.

> **Caller:** "Member ID nine zero zero zero two, September thirtieth, nineteen ninety-eight."
> **Caller:** "How do I change how much I'm putting in?"

**Expected:** the actual INTRUST path — log in at nesteggu.com/intrust → My Account → Participant →
Manage → Manage Account → **Change Contribution Rates** — or call **866-412-9026**. This card is
INTRUST-specific and strong.

> **Caller:** "And what's my balance?"

**Expected:** **$27,318.15 total, $19,122.70 vested.** The gap is the profit-sharing piece that hasn't
hit its three-year cliff yet. It's a small, human moment that shows she understands the difference
between what you have and what you own.

---

## The close — the dashboard (2 minutes, and this is what buys the program)

Switch to the dashboard. The calls were the product; this is the operating system.

1. **Utilization** — of every question asked on calls routed to Robin, what share she answered
   without passing the caller to a person. Split three ways: answered, fixable with a card, needs a
   human.
2. **What she couldn't answer** — ranked by how often it was asked. The RMD question you just asked
   is in there.
3. **The loop** — that list is the content backlog, ordered by real demand rather than a guess. A
   non-technical person turns the top item into a card and publishes it. The number moves.

> **The line to land:** "Every call she can't finish tells us exactly what to build next, in the
> members' own words. She gets measurably better every week without anyone guessing what to work on."

---

## If they go off script

They will. Executives ask their own questions. Here's what actually happens, honestly:

| If they ask | What she'll do | Risk |
|---|---|---|
| "Can I take a loan?" | Yes, loans are allowed, $100 origination fee — then routes for limits and terms | **Safe.** Good routing moment |
| "Am I vested?" | Own contributions, rollovers and safe harbor match are always 100% vested; 3% piece is a 3-year cliff | **Safe** |
| "Am I automatically enrolled?" | Yes, 6% pre-tax, escalating, into the BlackRock LifePath default | **Safe** — INTRUST-specific card |
| "Can I roll in an old 401(k)?" | Yes, plus the NestEgg U process and number | **Safe** — INTRUST-specific card |
| "How long do I have to work before I can join?" | Likely the **generic** card: "may not make you wait past 21… check with your plan administrator" | ⚠️ **Sounds like she doesn't know your plan** |
| "What's the contribution limit this year?" | Routes — the notice doesn't state IRS limits | ⚠️ Fine, but two routes in a row reads as thin |
| "How does the match work?" *(without saying INTRUST)* | Coin flip between the new INTRUST card and the generic safe-harbor explainer | ⚠️ Publish the card and rehearse this exact phrasing |
| "What happens to my 401(k) in a divorce?" | Answers from the QDRO card | **Safe** |
| Anything about fees | Loan fee $100, no asset-based admin fee, advice fee 4bp/month — but these are in the repo KB, **not published** | ❌ **She'll route.** Don't invite it |

**If she gives a generic "check with your plan administrator" answer mid-demo,** don't fight it. Say:
*"That's the boundary working — that detail lives in the plan document rather than the participant
notices, and she won't extrapolate. It's on the list."* Then move on. It is a far better look than a
confident wrong answer, and it's the same behavior that keeps you out of trouble at scale.

---

## What to say if asked "how long did this take?"

Robin runs on the ElevenLabs platform with a knowledge base built from INTRUST's own documents. The
content pipeline — upload a plan document, get fact-checked answer cards, a person approves each one
— is built and running. The measurement loop is built and running. What's left is content: pointing
it at INTRUST's own plan documents instead of generic ones, which is the work the dashboard already
prioritizes for us.
