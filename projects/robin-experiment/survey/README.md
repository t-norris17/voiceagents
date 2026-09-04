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

**Asked only at the end of a normal call.** A call ending in a transfer gets nothing — see
"Why there is no pre-transfer survey" below.

## What it's made of

Three layers. Only the first two are new, and both are configuration, not code.

| Layer | What | Where |
|---|---|---|
| Asking | `survey-block.txt`, pasted into the system prompt | ElevenLabs agent config |
| Capturing | `data-collection-fields.json`, 5 fields | ElevenLabs, post-call analysis |
| Storing | already existed — post-call webhook → `/api/postcall` → `raw_payload` | Vercel broker → Supabase |
| Reading | `read-results.sql` | SQL against `ai_call_events` |

`robin-prompt-WITH-survey.txt` is the complete assembled prompt: production's live prompt
with the survey block inserted before `SOUNDING HUMAN`. That's the paste-ready text.

## Getting the data out

**There is nothing to build.** `broker/api/postcall.js` already stores the entire ElevenLabs
webhook event in `ai_call_events.raw_payload`, and every Data Collection field rides along
inside it. Verified 2026-09-04: 56 of 56 rows carry
`raw_payload -> 'data' -> 'analysis' -> 'data_collection_results'`.

So the answers land in Supabase the moment the fields exist on the agent — no parser, no
migration, no deploy. `read-results.sql` is the whole pipeline: a view plus the four queries
that answer the experiment.

Ignore the `call_surveys` table on the unmerged `claude/robin-survey` branch. Its columns
encode an older survey (`understood` / `fcr` / `callback_consent`), and its read endpoint
`api/surveys.js` selects `fcr`, which migration 008 dropped.

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

Three harness gotchas, all of which cost time to learn:
- `agents_update` **silently drops the `prompt` parameter when `body` is also passed.** The
  criterion updated and the prompt did not, with no error. Push prompt and body changes as
  separate calls, and read the returned config back to confirm.
- `agents_run_tests` times out at the MCP layer after 60s, but the suite **starts
  server-side**. Poll `agents_list_test_runs` rather than re-running.
- Simulated callers hang up early and simulations time out. Read failure *causes*, not
  just the pass count — a scenario can read 3/20 while every evaluable criterion passed.

## What the tests found

Every defect below was found by the simulation suite, not by reading the prompt.

**Inherited defects, fixed in v3:** the pre-transfer carve-out overrode the eligibility gate,
so Robin ran the full survey on a caller she had just failed to identify (~1 in 10); and she
offered the survey then fired `transfer_to_number` before collecting answers (3 in 20).

**A defect I introduced, fixed in v5:** the v3/v4 gate required the caller to have been
*verified*. On a transfer-on-request call verification never runs, so the gate suppressed the
survey entirely and transfer adherence collapsed to 4/20. Only a **failed** verification
should disqualify.

The lesson worth keeping: the prompt gate and `evaluation-criterion.json` encode the same
eligibility rule in two places, and they silently disagreed for two versions. **Change them
in the same commit, every time.**

## Why there is no pre-transfer survey

Removed at v6, after four rounds of trying to make it work. Best result was 9/20: seven times
Robin never raised it, and four times she raised it and fired `transfer_to_number` before the
caller could answer. That second mode is worse than never asking — you interrupt someone to
ask a question and then cut them off mid-answer, on the call where they already wanted a human.

The reasoning that killed it: **question two is hypothetical.** "If you had a question like
this again, would you rather do it this way with me, or hold for a person?" You do not need to
catch someone mid-transfer to ask that. The earlier design note calling the transfer moment
"the single most useful moment for question two" was intuition; the measured cost of acting on
it was a 45%-reliable instrument and a hostile failure mode.

Dropping it also collapses the gate into one list with no ordering hazard, which is where both
of the bugs above came from.

Two of the three simulation tests now assert **suppression** rather than firing. A survey that
fires where it shouldn't is the failure that costs you a caller; that asymmetry should show up
in the test coverage.

## v6 results — the instrument is done

20 repeats per scenario, run against the clone at `agtvrsn_6401m1pz2amnfmtths2yh81gth3g`.

| Scenario | Result |
|---|---|
| Suppressed on failed verification | **20/20** |
| Suppressed on a transfer | **20/20** |
| Fires on a resolved call | **18/20** |

Read the resolved-call number carefully: 11 runs passed outright and 7 more were scored as
failures by the harness's 60s turn timeout — but in all 7, both questions were asked AND
answered before the clock ran out. Robin has `end_call` disabled, so after the survey closes
she cannot end the call and the harness waits for a turn that never comes. 2 runs are genuine
misses, where she never raised the survey.

So: ~90% offer rate on the path that matters, and zero leakage into transfers or failed
verifications. That is a shippable instrument, and the adherence criterion measures the real
rate on live calls rather than assuming it.

For comparison, the pre-transfer ask peaked at 9/20 across four attempts.

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
| Clone version, survey v6 + criterion v3 | `agtvrsn_6401m1pz2amnfmtths2yh81gth3g` |
| Clone Plan Questions procedure (repointed) | `agtprcv_4101m1pvmymyeq78h47px1fqbge0` |
| Production prompt capture | `../robin-system-prompt.LIVE-2026-09-01.txt` |

## Before the employee wave

- Count **one response per person**, not per call. 50–75 people making 2–3 calls each is
  50–75 opinions, not 200.
- Fix the live-agent defects first. Running 75 colleagues against an agent whose loan
  lookup silently fails gets you a "no" verdict on a dead webhook. Three of them: the dead
  `get_plan_details` host, the Account Recovery procedure's instruction to collect the last
  4 of an SSN (contradicts the prompt's hard no-SSN rule; verified not yet fired), and the
  three-way prompt fork with production as the odd copy out.
