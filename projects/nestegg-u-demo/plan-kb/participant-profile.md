# Participant profile — Michael Reynolds (Vertex Manufacturing 401(k))

> ⚠️ **This is NOT a Knowledge Base article — do NOT upload it to the ElevenLabs KB.**
> Per-person account data is served by a **tool** (`get_plan_details`), never the shared KB, so one
> caller's balance can't leak into another caller's answer. This file documents the synthetic
> record the tool returns and the tool contract. **Synthetic demo data — invalid-by-design SSN.**

Ties our happy-path caller to the Vertex plan so plan questions can be answered with **his** numbers.

## The synthetic participant record

| Field | Value |
|---|---|
| Name | Michael Reynolds |
| Date of birth | April 12, 1968 (age 58) |
| SSN (last 4) | 0123 |
| `subject_ref` | `poc-subject-001` |
| Employer / plan | Vertex Manufacturing 401(k) (Plan 001) |
| Hire date | March 2015 → **fully vested** (past the 3-year cliff) |
| Current deferral | 8% pre-tax |
| Total balance | $142,350 |
| Vested balance | $142,350 (100%) |
| Outstanding loan | **None** |
| Max loan available | ~$50,000 (lesser of $50,000 or 50% of $142,350) |
| Investment | NestEgg Target Retirement 2035 |
| Email on file | present (demo inbox) |

This makes the three demo questions answer *specifically*:
- **Loan** → "You have no loan outstanding and you're fully vested, so you could borrow up to about
  **$50,000** (the lesser of $50,000 or half your vested balance)."
- **Rollover in** → generic plan rule + "your account is set up to accept a roll-in today."
- **Leaving** → "You're **58** and fully vested with **$142,350** — above the $7,000 threshold, so
  you could leave it in the plan, roll it over, or (because you're over 55) take a distribution
  from this plan without the 10% penalty, though it's still taxed."

## Tool contract — `get_plan_details` (add to the mock backend)

```
POST /api/poc/get_plan_details   { subject_ref }
->
{
  plan: "Vertex Manufacturing 401(k)",
  fully_vested: true,
  balance: 142350,
  vested_balance: 142350,
  outstanding_loan: false,
  max_loan_available: 50000,
  deferral_pct: 8,
  age: 58,
  investment: "NestEgg Target Retirement 2035"
}
```

The agent calls this **after `verify_caller`** (reusing `subject_ref`) when the caller asks a
question that needs their own numbers. Plan **rules** still come from the KB via RAG; the tool only
supplies **this caller's figures**. A second synthetic participant (`poc-subject-002`) can return a
smaller/loan-outstanding record to demo the "you already have a loan" path.
