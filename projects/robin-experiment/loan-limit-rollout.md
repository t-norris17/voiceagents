# Loan limit fix: live-agent changes

Robin quoted $107,453 as Priya's maximum loan on at least six customer-wave calls; the plan limit is
$50,000. Root cause, from the live agent on 2026-09-24:

- The **401(k) Loan Inquiries** procedure (`agtprc_1501m2tk3t8xfaprsgxeqj330q20`, HEAD
  `agtprcv_7001m2tvy0ccfc0s52j3cv09pxn8`) taught the limit with a worked example in which 50% of
  vested is always the smaller number ("$35,000 … 50% comes out to $17,500 as their maximum").
- The prompt told her to "answer from the plan rule AND their figures together", i.e. to compute.
- `get_balance` returned no limit to quote.

The code change (`broker/api/get_balance.js`, migration 017) gives her `max_loan`. The three
changes below tell her to use it. Live agent before this change: `agtvrsn_9101m2zv730xe9ss1h2yapgk7ga5`
on branch `agtbrch_8801kwj5qb38f7n966f5375s5ccz` (Main). That version is the rollback point.

## 1. Procedure: two edits

**Step 1, last bullet.** Before:

> - Do NOT calculate or state their specific borrowing limit ($17,500) or maximum numbers until they ask for borrowing limits.

After:

> - Do NOT state their borrowing limit until they ask about borrowing limits.

**Step 2, whole step.** Before:

> 2. Borrowing Limits & Eligibility (when caller asks about limits/borrowing):
>   - Explain that the loan minimum is $1,000, and the maximum is the lesser of $50,000 or 50% of their vested balance.
>   - Using their vested balance from `get_balance` ($35,000), explain that 50% comes out to $17,500 as their maximum.
>   - Check in: "Does that make sense, or would you like to hear about repayment terms and interest rates?"

After:

> 2. Borrowing Limits & Eligibility (when caller asks about limits/borrowing):
>   - Their maximum is `max_loan` from `get_balance`. Quote it exactly as returned. The minimum is `min_loan`.
>   - NEVER work out a limit yourself and NEVER say what half their balance comes to. You may describe the rule in words: "the plan allows the lesser of $50,000 or half your vested balance."
>   - If `loan_eligible` is false: `existing_loan` means they must pay off their current loan first; `below_minimum` means their balance is too small to reach the $1,000 minimum.
>   - If `loan_limit_reason` is `needs_specialist`: say a specialist needs to review their loan eligibility, and offer to connect them.
>   - If they ask about an amount above `max_loan`, say plainly that the most they can borrow is `max_loan`.
>   - Check in: "Does that make sense, or would you like to hear about repayment terms and interest rates?"

## 2. System prompt: one new paragraph

Inserted after "...that is the trap." and before "THE LOAN TRAP, SPECIFICALLY". Same text as
`robin-system-prompt.txt` in the repo. Nothing else in the live prompt changes. The stale "virtual
(not human) assistant" line in the repo file is NOT pushed (CLAUDE.md, Settled decisions).

> BORROWING LIMITS COME FROM THE TOOL, NEVER FROM YOUR ARITHMETIC. get_balance returns max_loan, the caller's maximum loan, already worked out from every plan rule. Quote it exactly as returned. Never compute a limit yourself and never say what half their balance comes to: "fifty percent of your balance is..." is how a wrong limit gets said. You may describe the rule in words ("the lesser of $50,000 or half your vested balance"). If loan_eligible is false, give the reason plainly: existing_loan means they must pay off the loan they have first; below_minimum means their balance is too small to reach the $1,000 minimum. If loan_limit_reason is needs_specialist, say a specialist needs to look at their loan eligibility and offer to connect them. If they ask about an amount above max_loan, say plainly that the most they can borrow is max_loan.

## 3. `get_balance` tool description (`tool_4901ky8939e2e7stm12y3p2xw7kt`)

Append to the existing description:

> It also returns the borrowing limit: loan_eligible, max_loan (their maximum loan, already computed from every plan rule; the only limit you may state), min_loan, and loan_limit_reason (existing_loan, below_minimum or needs_specialist when not eligible).

## Order

1. Migration 017 applied; 90004 and the `paid_off_on` column verified. **This must land before the
   code.** The new `get_balance` selects `paid_off_on`; against a database without it the loan
   lookup fails, every caller gets `needs_specialist`, and Marcus loses his loan detail. For the same
   reason, never roll back 017 while this code is live.
2. Code merged and promoted; the live endpoint read back for Priya, Marcus and 90004.
3. Changes 1 to 3 on a separate agent branch; simulation tests there.
4. Merge to Main (the only step callers can hear).
5. One real call as Priya: the tool result shows `max_loan` "$50,000", Robin says $50,000, and the
   call started after the merge.

Rollback: set Main back to `agtvrsn_9101m2zv730xe9ss1h2yapgk7ga5`. The code can stay: the new
fields are only additions.
