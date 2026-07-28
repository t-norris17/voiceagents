# Three callers you can be, and what to ask them

**Project:** robin-experiment · **Last updated:** 2026-07-28

All three are invented. Member IDs `90001`–`90003` sit outside the 10001–10050 experiment range, so
nothing here touches a tester's record. Every one is marked consented, so no consent prompt fires.

Robin verifies on **Member ID + date of birth**. She will never ask for a Social Security number, a
User ID, a password or a PIN — and if you offer one, she won't repeat it back.

**Every question is marked with what will actually happen:**

| | |
|---|---|
| ✅ | She answers it well, from an INTRUST-specific card |
| ⚠️ | She answers, but generically — expect "your employer chooses that, check with your plan administrator" |
| ❌ | No content. She'll say she isn't certain and offer a specialist at 866-412-9026 |

Use ✅ when you're demoing. Use ⚠️ and ❌ deliberately when you're testing, or when you want to show
that she routes rather than guesses.

---

## Card 1 — Marcus · the new employee

| Field | Value |
|---|---|
| **Member ID** | **90002** |
| **Date of birth** | **September 30, 1998** |
| Balance | **$27,318.15** total · **$19,122.70 vested** |
| Loan | yes, one outstanding |
| Currently deferring | 6% |

*Twenty-eight, a couple of years in, just starting to pay attention to it.*

**Opening line:** "Hi — I just started looking at my 401(k) and I've got a few questions."

| Ask | |
|---|---|
| "Was I automatically enrolled? At what rate?" | ✅ Her strongest card — 6% pre-tax, escalating, into the BlackRock LifePath default |
| "How do I change how much I'm putting in?" | ✅ Real INTRUST path: nesteggu.com/intrust → My Account → Participant → Manage → Manage Account → Change Contribution Rates, or 866-412-9026 |
| "Can I roll my old 401(k) from my last job into this one?" | ✅ Yes, plus the NestEgg U process and number |
| "Can I do Roth instead of pre-tax?" | ✅ Yes, but you have to elect it online — it isn't automatic |
| "What's my balance?" | ✅ **Listen for the split** — $27,318.15 total but $19,122.70 vested. Ask "why are those different?" |
| "Can I take a loan out?" | ❌ **Nothing published on loans at all.** Good routing demo, bad answer demo |
| "When could I have joined the plan?" | ⚠️ See the warning below |

**The moment worth catching:** the balance split. Ask her why the two numbers differ — the gap is
profit-sharing money that hasn't hit its three-year cliff yet. It's a small human beat that shows
she understands what you *have* versus what you *own*.

---

## Card 2 — Priya · mid-career

| Field | Value |
|---|---|
| **Member ID** | **90003** |
| **Date of birth** | **June 8, 1974** |
| Balance | **$214,905.62** · fully vested |
| Loan | none |
| Currently deferring | 10% |

*Fifty-two. Contributing seriously, thinking about whether she's doing enough.*

**Opening line:** "Hi, I wanted to check on a couple of things with my retirement account."

| Ask | |
|---|---|
| "I'm over fifty — can I put in extra?" | ✅ Catch-up contributions. A nice one, because it lands because of *her age* |
| "Do my catch-up contributions get matched too?" | ✅ Published, and a genuinely good follow-up |
| "What's my balance?" | ✅ $214,905.62, fully vested |
| "Can I take money out for a hardship?" | ✅ Yes, it's a plan feature — then she routes for the specifics, correctly |
| "When am I allowed to take money out generally?" | ✅ Leaving, disability, death, plus in-service and hardship |
| "Which fund should I be in?" | ✅ **The guardrail.** She declines to advise and routes to INTRUST Participant Investment Advice at 800-242-7111 ext. 1795. Prompt-enforced — the most reliable moment you have |
| "Does INTRUST match what I put in?" | ⚠️ See the warning below |
| "How do I update my beneficiary?" | ❌ No published card |

**The moment worth catching:** the guardrail. Push her — "come on, just tell me which one you'd
pick." She won't. That's the answer your CRO wants to hear.

---

## Card 3 — Dana · near retirement

| Field | Value |
|---|---|
| **Member ID** | **90001** |
| **Date of birth** | **April 12, 1953** |
| Balance | **$487,213.44** · fully vested |
| Loan | none |
| Currently deferring | 8% |

*Seventy-three this year. The highest-stakes call in the book.*

**Opening line:** "Hi — I'm getting close to retiring and I want to understand my options."

| Ask | |
|---|---|
| "What's my balance?" | ✅ $487,213.44, fully vested |
| "When can I start taking money out?" | ✅ Leaving employment, disability, death, plus in-service distributions and hardship |
| "How do I get a paper copy of my annual notice?" | ✅ Published and INTRUST-specific |
| "I turn seventy-three this year — when do I *have* to start taking money out?" | ❌ **The RMD gap.** See below |
| "What happens to my 401(k) if I get divorced?" | ✅ QDRO card, published |

**The RMD moment.** There is no published RMD card, so she'll say she isn't certain of the specific
age and offer a specialist. **Set it up before you ask** — "this one she can't fully answer, watch
what she does" — and it becomes the strongest moment in the call rather than the weakest. She will
not invent 73, 72, or 75. Then: *"She'd rather hand off than guess. That question is now in the
queue automatically, and that's how we decide what to write next."*

---

## Two things changed today — read before you dial

**1. The INTRUST eligibility card was archived this morning.** `when-can-i-join-the-plan` — the one
that said *eligible at 18, entry the first of the month* — went to `archived` on 2026-07-28. The only
eligibility content left is the generic regulatory card, so **"when can I join?" now answers with
"the plan may not make you wait past 21… check with your plan administrator."**

That was one of your three demo topics. If it was archived by mistake, republish it. If it was
deliberate, drop eligibility from the demo.

**2. Still no INTRUST employer-match card.** The draft is sitting at
[`kba/intrust-employer-match.md`](./kba/intrust-employer-match.md) — dollar for dollar up to 6%,
vested immediately, grounded in the 2025 Enrollment Packet. Until it's published, "does INTRUST
match?" gets a generic safe-harbor lecture.

**And there is no loan content published at all** — not one article. The enrollment packet has the
$100 origination fee; nothing from it is live. Any loan question routes.

---

## Off-script: what she handles well right now

If someone in the room asks their own question, these are safe:

auto-enrollment · changing your contribution rate · rolling money in · Roth contributions ·
catch-up contributions at 50+ · match on catch-up · hardship withdrawals · when you can take a
distribution · divorce/QDRO · paper copies of notices · anything about her own balance ·
"which fund should I pick" (declines)

These will sound generic — she'll defer to "your employer" or "your plan administrator":

eligibility · the employer match · vesting · profit sharing · automatic escalation ·
break in service · rehire · military service

These have nothing published and will route to a specialist:

loans · RMDs · beneficiaries · the default investment fund · IRS contribution limits · fees ·
support hours
