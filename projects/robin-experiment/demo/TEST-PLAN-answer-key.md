# Loan wave — answer key and verification (internal, not for testers)

Every question in [`TEST-PLAN.md`](./TEST-PLAN.md), the source Robin has for it, and how far it has
been verified. Sources are the **live** Knowledge Base (five Vertex documents in the ElevenLabs
dashboard, read 2026-09-11; repo `kb/` is stale and was not used), the `get_balance` tool, and the
live prompt.

**Verification levels**

- **Observed** — Robin gave this answer on a live call; conversation id cited.
- **In KB** — the fact is stated in the live document; not yet heard on a call.
- **Derived** — not stated anywhere; Robin computes it from KB rule + tool figures.
- **Prompt rule** — governed by the system prompt, not the KB.

## Scenarios

| # | Question | Expected answer | Source | Verified |
|---|---|---|---|---|
| 1 | The most I could borrow | Lesser of $50,000 or 50% of vested balance; today about $9,561 on $19,122.70 vested | Loans KB + `get_balance` | **Observed** `conv_8301m28d4f7zfeja4k2ycd9mb9eh` at 198s ("around nine thousand five hundred") |
| 1 | The minimum | $1,000 | Loans KB | In KB |
| 1 | Does my existing loan change that | One loan at a time; pay it off first | Loans KB + `get_balance.outstanding_loan` | **Observed** same call, 111s |
| 2 | How long to pay back | Up to 5 years; up to 15 for a primary residence | Loans KB | **Observed** same call, 111s and 198s |
| 2 | Vested balance needed to borrow $25,000 | $50,000 | Derived (50% rule) | **Observed** same call, 281s |
| 3 | Set the loan up for me | She cannot; offers to connect, transfers on yes | Loans KB ("request on the portal or call the participant line") + prompt rule "transfer, don't delegate" | **Observed** offer at 167s and 281s (caller declined); the accepted transfer is **unverified** |
| 4 | Interest rate | Prime + 1%, fixed for the life of the loan; cannot quote Prime today; his current loan is 8.5% | Loans KB + `get_balance.loan.interest_rate` | **Observed** 198s and 281s |
| 4 | Fees | $75 origination, $25/year maintenance | Loans KB | **Observed** 198s |
| 4 | Where the interest goes | Back into his own account | Loans KB | **Observed** 198s |
| 4 | How I repay | After-tax payroll deductions, usually from the next pay period | Loans KB | In KB |
| 5 | Second loan | No; one at a time | Loans KB | **Observed** 111s |
| 5 | Payoff date, payments left | Scheduled 2029-11-09; 83 of 130 remaining; $75.64 biweekly; $5,490.37 balance | `get_balance.loan` | **Observed** 51s and 111s. Point-in-time figures; they drift one payment every two weeks past 2026-09-10 |
| 5 | What I do to borrow again | Pay the current loan off | Loans KB | **Observed** 111s |

## Curveballs

| | Question | Expected behaviour | Source | Verified |
|---|---|---|---|---|
| A | Why is vested lower than balance | Employer match vests on a 3-year cliff; his own contributions are always 100% vested; quotes $27,318 and $19,123 | Overview KB (Vesting) + `get_balance` | In KB; figures **Observed** on earlier calls per `CALL-CARDS.md` |
| B | Move my old 401(k) in | Yes; plan accepts 401(k)/403(b)/457(b) and traditional IRAs; direct rollover recommended; Rollover Concierge starts it; 1 to 3 weeks | Rollovers KB | In KB |
| C | What if I quit next month | Vested balance is his; four options (leave in plan if $7,000+, roll to new plan, roll to IRA, cash out with tax and 10% penalty under 59½); **his loan becomes due**, unpaid balance is a loan offset | Leaving KB + Loans KB | In KB. Expected to shift `plan_topic` to `leaving_employer` |
| D | Change my contribution rate for me | Cannot act; the KB puts it on the portal or the participant line; she offers to connect | Overview KB ("How do I change my contribution rate") + prompt rule | In KB + prompt rule; **transfer offer unverified** |
| E | Update my beneficiary | Cannot act; KB says "change your beneficiary anytime on the portal"; she offers to connect | Overview KB (Enrollment) + prompt rule | In KB + prompt rule; **transfer offer unverified** |

## Two things the plan depends on

1. **Where a transfer rings.** `transfer_to_number` on the live agent points at `+13166807638`,
   the same number that placed `conv_8301m28d4f7zfeja4k2ycd9mb9eh`. Scenario 3 sends every tester
   there once. Confirm or change the destination before the wave.
2. **A transferred call produces no survey response** (survey gate a). Scenario 3 is therefore a
   deliberate hole; curveballs D and E are written so the tester declines the offer and the survey
   still fires ("a transfer they turned down is not a transfer").

## Tracking who asked what

Testers state their own full name at the top of the call. That lands in the transcript and in
`notes`, not in a dashboard column; the survey dashboard keys respondents on a hashed phone number.
A `caller_stated_name` Data Collection field plus a view change would make it a column.
