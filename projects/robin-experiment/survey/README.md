# Survey instrument — Robin viability test

A **temporary** two-question survey for one decision: would callers rather handle a
question with Robin, or hold for a person even if it takes longer? It runs on two
cohorts (bank employees, then customers), then it comes off.

This is not a permanent feature. The **grader** is the permanent quality system; the
survey exists only to produce a viability verdict. Do not let it drift into production.

## The two questions

1. *"Quick one to five, how was that for you?"* → `satisfaction`
2. *"And if you had a question like this again, would you rather do it this way with me,
   or hold for a person, even if it took longer?"* → `prefer_agent`

The "even if it took longer" clause is load-bearing. Without it people compare Robin to
an idealised human who answers instantly. **Do not reword between waves** — the two
cohorts must get an identical instrument or the comparison is dead.

## What it's made of

Three layers. Only the first two are new, and both are configuration, not code.

| Layer | What | Where |
|---|---|---|
| Asking | `survey-block.txt`, pasted into the system prompt | ElevenLabs agent config |
| Capturing | `data-collection-fields.json`, 5 fields | ElevenLabs, post-call analysis |
| Storing | already existed — post-call webhook → `/api/postcall` | Vercel broker → Supabase |

`robin-prompt-WITH-survey.txt` is the complete assembled prompt: production's live prompt
with the survey block inserted before `SOUNDING HUMAN`. That's the paste-ready text.

**ElevenLabs stores the answers on the conversation regardless.** You do not need the
broker or Supabase to capture data — only to chart it. If the parser isn't shipped, the
answers are still readable per conversation via the dashboard or API.

## The adherence check

`evaluation-criterion.json` runs on every real call and asks: on a call where the survey
should have fired, did it? Ineligible calls return `unknown`, so the pass rate is a true
adherence rate rather than being diluted by calls that were never in scope.

This is the answer to "a prompt instruction is flimsy." It is flimsy — it's probabilistic.
The criterion makes the probability *visible* instead of assumed. An 85% offer rate you
know about is a usable instrument; a 100% assumption is not.

## Testing

`simulation-tests.json` holds three scenarios, run against the **clone** via
`agents_run_tests` with `repeat_count`. Never run these against the live agent.

Two harness gotchas, both cost time to learn:
- `agents_run_tests` times out at the MCP layer after 60s, but the suite **starts
  server-side**. Poll `agents_list_test_runs` rather than re-running.
- Simulated callers hang up early and simulations time out. Read failure *causes*, not
  just the pass count — a scenario can read 3/20 while every evaluable criterion passed.

## What the tests found

Every defect below was found by the simulation suite, not by reading the prompt.

**Inherited defects, fixed in v3:**
- **The carve-out overrode the gate.** On a caller who failed verification, Robin ran the
  full survey on the way into the transfer, ~1 call in 10. Fixed by moving the eligibility
  gate above both ask paths and stating that it beats the transfer rule. Suppression went
  16/20 → 20/20 and has held there since.
- **She offered, then transferred before collecting**, 3 in 20. Fixed by forbidding
  `transfer_to_number` until both answers are in.

**A defect I introduced, fixed in v5:** the v3/v4 gate required the caller to have been
*verified*. On the most important scenario — someone who asks for a person straight away —
verification never runs at all, so the gate suppressed the survey entirely. Transfer
adherence collapsed to 4–5/20. The fix inverts the test: only a **failed** verification
disqualifies; never-verified is eligible.

The lesson worth keeping: the prompt gate and `evaluation-criterion.json` encode the same
eligibility rule in two places, and they silently disagreed for two versions. **Change them
in the same commit, every time.**

## Clone hygiene (not part of the survey)

Fixed on the clone while testing, and still outstanding on live:
- The Plan Questions procedure called `get_plan_details` against a dead host
  (`lumio-retirement.vercel.app`, returns `{"found":false}` with `is_error=false`). Repointed
  to `get_balance` and stripped a promise no tool can keep (a borrowing limit).
- All three Lumio tools detached. Verified via `agents_get_tool_dependents` that only Robin
  and this clone referenced them, so detaching breaks nothing else.
- Publishing a procedure is two steps: `agents_update_procedure_draft` writes a draft only,
  and `agents_compile_procedures` does **not** publish it. An `agents_update` on the agent
  does, minting a new procedure version.

## Removal

Every agent update mints a version. Record the version before and after, and revert when
the customer wave closes. Branch switching is untested against an assigned phone number;
version rollback has been observed working.

| | |
|---|---|
| Live Robin (untouched as of 2026-09-04) | `agent_8301kwj5qa8ve1atremxxwjjp9f8` |
| Survey-test clone | `agent_7401m1f4033qene9ybgt78d3saw4` |
| Clone version, survey v5 + criterion v2 | `agtvrsn_2901m1py7cyxeja9aw6hkjf5xhd3` |
| Clone Plan Questions procedure (repointed) | `agtprcv_4101m1pvmymyeq78h47px1fqbge0` |
| Production prompt capture | `../robin-system-prompt.LIVE-2026-09-01.txt` |

## Before the employee wave

- The branch parser expects `understood`; this uses `satisfaction`. `broker/lib/survey.js`
  needs the rename or it silently writes nulls.
- Count **one response per person**, not per call. 50–75 people making 2–3 calls each is
  50–75 opinions, not 200.
- Fix the live-agent defects first. Running 75 colleagues against an agent whose loan
  lookup silently fails gets you a "no" verdict on a dead webhook. Three of them: the dead
  `get_plan_details` host, the Account Recovery procedure's instruction to collect the last
  4 of an SSN (contradicts the prompt's hard no-SSN rule; verified not yet fired), and the
  three-way prompt fork with production as the odd copy out.
