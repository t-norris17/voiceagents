# BUILD LOG — Robin 50-User Experiment

**Slug:** robin-experiment
**Started:** 2026-07-23
**Status:** active — see Session 6 for the current handoff

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-09-09 — Session 6 (two live-call defects, and the repo caught up to live)

**What we did**

- Fixed the **age remark**. On `conv_7701m23fw5m6fy2vn5h15srv4j7g` Robin said "RMDs start at age
  seventy-three. Since you're well past that, I'm guessing you're either already taking them or
  want to know how they work," twice in one call. The caller named it in question four: "a little
  disrespectful." That call scored 3, went negative, and preferred a person. New
  **DON'T CHARACTERISE THE CALLER'S SITUATION** block, placed high in the prompt.
- Fixed the **dead air**. On `conv_0701m236q3cve3hr1rkftmamfkmz` the caller said "Um, five," Robin
  called `skip_turn`, and eight seconds later the caller repeated himself: "That was a five. What?"
  `skip_turn` has fired on **6 of 59 calls**, five times in one of them.
- Root cause was config, not prompt: **`skip_turn`'s description was empty**, so the model picked
  when to use it from its own prior. It now has one. The survey block's TAKE THE ANSWER AND MOVE ON
  line also names the short-answer case — restating the rule alone would not have helped, since the
  rule was already there and got ignored.

**What broke / surprised us**

- **A banned-word list would have contradicted the LOAN TRAP rule.** The first draft of the new
  block banned the tokens "only" and "already"; the prompt elsewhere *requires* "this plan allows
  only ONE loan outstanding" and "they already have a loan." Caught in the pre-ship read of the
  diff. The block names full phrases attached to a caller fact instead.
- **`agents_update` wrote a field that was never sent.** The call passed `prompt` only. The response
  came back with `built_in_tools.skip_turn.description` populated with the exact text drafted in
  this session — line breaks and all — and `metadata.updated_at` is identical across the update
  response and a following read, so it was one write, not two. The outcome is correct and verified,
  but the mechanism is **unexplained**. Session 4 left "merge-vs-replace semantics" open for partial
  updates; this is a data point that the connector may do more than pass through. Treat any partial
  `agents_update` as capable of touching fields you did not name, and read back after every write.
- **The update response omits `phone_numbers`** (returns `[]`) where the read includes it. Not a
  detachment — the following `agents_get` shows `+18335739530` still assigned. Don't panic on it.

**Repo vs live drift, now closed**

`survey/survey-block.txt` had question one as "Quick one to five, how was that for you?"; live Robin
asks "On a scale from one to five, how was this experience for you?".
`survey/robin-prompt-WITH-survey.txt` was staler still — it carried the abandoned TWO-question
survey. Both now match live exactly, verified by diff (`grep -v '^$'` on both sides, zero
differences). `elevenlabs-experiment-setup.md`'s paste-ready prompt would break Robin if pasted (it
still says "INTRUST 401(k) Plan") and is now marked stale, pointing at the file that is kept in step.

**Simulation results (79 runs against the updated live agent)**

- **Tone fix: verified.** 12/12 on the corrected test, and **zero** occurrences of "well past" in any
  agent response across 32 tone runs. Robin now says "Required Minimum Distributions must begin at age
  seventy-three. Since you are seventy-three this year, your RMDs are due now" — the corrected phrasing,
  and factually right where the old one was not.
- **skip_turn fix: verified.** `skip_turn` appears in agent responses **once** in 79 runs, and that one
  was after Robin's own plan-confirmation question, not after a short answer and not during the survey.
  Zero in all 20 runs of the one-word-answer test. Base rate before the fix was 6 of 59 real calls.
- **Eligibility gates: intact.** Suppressed-on-transfer 5/5, suppressed-on-failed-verification 5/5.
- **Survey adherence: NOT clean.** 2 runs reached a natural close on an eligible call and Robin never
  raised the survey, closing with "It was a pleasure assisting you today." The live evaluation criterion
  agrees: `survey_verdict` on real survey-era calls is 3 success / 1 failure. Small n, but the simulation
  and the real data point the same way. This is pre-existing, not caused by this session's change.

**Gate fix: a transfer they turned down is not a transfer**

Diagnosed from `conv_2601m218pga3fgc809erb1q619hp`, the only real adherence miss. Robin entered the
transfer path at t=68, Marcus declined at t=80, and she closed at t=91 with no survey. Gate (a) had no
clause saying a declined offer is not a transfer. Clause added, live as
`agtvrsn_0701m240shshe47arv4tdf4a3099`.

- **Suppression is unharmed**, which was the risk: suppressed-on-failed-verification 8/8,
  suppressed-on-transfer 6/6.
- **The desired behaviour does occur.** On a declined-transfer call Robin now says "Before I go, please
  answer the following questions. On a scale from one to five, how was this experience for you?"
- **NOT verified as a rate.** The survey fired in 2 of 7 usable pre-fix runs and 3 of 5 post-fix. Right
  direction, sample far too small to call it. Those runs were also Gemini-served (see `_model_note`).
  The real verification is the live `survey_asked_when_eligible` criterion on the next batch of calls,
  which already runs on every call and costs nothing extra.

**⚠️ The post-call webhook ID changed and nobody meant to change it**

At 1788983254 the agent carried `post_call_webhook_id: 4deed01a5a2d420f8781ecdb1d7fa804`. After an
update that sent ONLY the prompt field, it reads `933e9fc471ac45349b6a5768edab3cbb`. This is the second
time an `agents_update` came back having altered a field that was not sent (the first was
`skip_turn.description`). **Confirm in the ElevenLabs dashboard that the post-call webhook still points
at the broker's `/api/postcall` before the wave.** If it does not, calls stop reaching `ai_call_events`
and the survey silently collects nothing. Last confirmed good delivery: the 21:10 call on 2026-09-09.

**New defect found while reading transcripts**

Robin sometimes speaks her filler wrapped in literal quotation marks. On real call
`conv_9901kymzs07yfg0vat8pqg2eg2rb` at t=85s her entire turn was `"Okay...". "Right..."...`. The prompt's
closing line already forbids this ("Speak ONLY the words meant to be heard"). One turn in 762 recorded,
so rare, but it is real and it is on a Haiku-served production call, not a simulation artifact.

**Still open**

- The live **Data Collection `satisfaction`** description still quotes the old question-one wording.
  Cosmetic — both scores parsed — but live is internally inconsistent until it changes.
- The **RMD coverage gap** behind that 3-star call: Robin answered an RMD question with no
  `get_balance`, said "yes, you'd need to be taking them" (close to the tax-advice line the prompt
  forbids), offered a transfer, and on refusal just repeated the age-73 fact. RMDs are in none of
  the five KB documents. This is why that call went badly; the tone fix does not address it.
- Neither prompt change has been **verified behaviourally**. `survey/simulation-tests.json` exists
  and could be run against the updated agent.

**Next session:**
> Decide on the RMD coverage gap: either a KB article or an explicit "we don't cover RMDs, here's a
> transfer" path. It is the substantive defect behind the only negative call in the survey era.
>
> Then run `survey/simulation-tests.json` against live Robin to confirm the two prompt changes
> actually hold under pressure — neither has been tested past a config read.
>
> Rollback point for this session's live change: version `agtvrsn_6901m23g5bpgfq1arvgqzpnecwdr`
> (pre-change). Current is `agtvrsn_5301m23vc77yfxqrdqnz01yyt0gy`.
>
> Carried over, still open: the three pre-existing live-agent defects (dead `get_plan_details` host,
> the Account Recovery procedure's SSN instruction, the prompt fork), the `survey_people` /
> `person_key` rename, and whether `needs_review` should include 3s.

---

### 2026-09-04 — Session 5 (the survey, built and measured)

**What we did**

- Built the **viability survey** on a clone (`agent_7401m1f4033qene9ybgt78d3saw4`), never on
  live Robin. Everything is in [`survey/`](./survey/) — block, fields, tests, criterion,
  architecture, and the paste-ready assembled prompt.
- Cut it from four questions to **two**: a 1-5 satisfaction rating and the preference question
  with Tanner's "even if it took longer" clause, which is load-bearing.
- Wrote **three simulation tests** and ran them at `repeat_count` 20. Sixty simulated calls,
  no phone involved.
- Added a **per-call evaluation criterion** (`survey_asked_when_eligible`) so adherence is
  measured on every real call rather than assumed.

**What broke / surprised us**

- **The tests found two defects that reading the prompt would not have.** The pre-transfer
  carve-out overrode the verification-failed gate about 1 call in 10 — Robin ran the whole
  survey on someone she had just failed to identify. Separately, 3 in 20 she *offered* the
  questions and then fired `transfer_to_number` before collecting the answers, spending the
  ask and recording nothing. Both fixed in v3 by hoisting the gate above both ask paths and
  forbidding the transfer call until both answers are in.
- **Reading pass counts without reading failure causes is a trap.** The resolved-call scenario
  read 3/20, which looks like disaster. All 17 failures were harness: 12 simulation timeouts,
  5 simulated callers hanging up. Every criterion that could be evaluated passed, with the
  judge quoting Robin verbatim.
- **The stale Lumio host is live and quantified.** Across 60 runs the agent hit
  `lumio-retirement.vercel.app` 26 times (`document_resolution` 18, `get_plan_details` 7,
  `send_reset_email` 1). `get_plan_details` returns `{"found":false}` with no error and is the
  prime suspect for those 12 turn timeouts.
- **The branch is not the gate we thought.** ElevenLabs stores Data Collection results on the
  conversation itself — verified by reading two real calls. Fields + prompt is enough to
  *capture* data. `claude/robin-survey` gates the dashboard, not the collection.

**Decisions made**

- The survey is a **temporary instrument**, the grader is the permanent system. They write
  different tables and don't interact — confirmed by reading `grader/lib/judge.js`, which only
  scores questions the *caller* asks, so survey turns never enter the eval set.
- **Ask on transfers too.** A transfer is often a win (5 of 10 transfer-ending calls in the
  history carried positive sentiment), and the moment before a handoff is the most informative
  place to ask the preference question.
- **Don't suppress on frustration.** That rule deleted exactly the responses worth having.
- Field writes through the connector are a **full replace, not a merge**.

**Next session:**
> Read the re-run of the 60-call suite and confirm both defects are gone. Then, in order:
> (1) fix the live-agent defects — `get_plan_details`, the Account Recovery procedure's SSN
> instruction, and the prompt fork; (2) rename `understood` → `satisfaction` in
> `broker/lib/survey.js` or the parser writes nulls; (3) add the `members.cohort` column and
> the `postcall` join so waves stay separable.
>
> Tanner's calls, still open: settle the prompt fork, sign off the two questions, merge
> `claude/robin-survey`, set the verdict thresholds, decide whether any non-employees can be
> recruited, and place one real widget call before the wave.

---

### 2026-09-01 — Session 4 (the connector answers, and the prompt has forked)

**Task 1 from the Session 3 handoff is done. Both halves of it answered yes.**

**Can the connector write Data Collection fields? Yes — and it does the new thing too.**
The read-only `agents_get` shows fields under `platform_settings.data_collection`, and a write
through `agents_update` (raw `body` escape hatch) created all 8 survey fields on the first try.
More usefully, the API also minted 8 matching `analysis_items.data_collection` entries
(`aitem_…m1f41…`), which is the newer structure the dashboard actually reads — so this is a real
create, not a write into a legacy field the UI ignores. **No hand-entry in the Analysis tab is
needed.** Count went 11 → 19.

- One wrinkle: `data_collection_scopes` still lists only the original 11. The new fields carry
  `"scope":"conversation"` on their `analysis_items` entries, so this is probably a vestigial map,
  but it is unverified — check the 8 fields actually populate on the first real call.
- The full 19-field set was sent deliberately, so merge-vs-replace semantics never mattered. That
  question is still open if anyone wants to send a partial update later.

**Survey-test clone is live and configured:** `agent_7401m1f4033qene9ybgt78d3saw4`
("Robin — survey test"). Prompt + all 19 fields set. **No phone number attached** (duplication
doesn't carry one), so it is web-widget only until someone assigns one. Live Robin
(`agent_8301kwj5qa8ve1atremxxwjjp9f8`) was not touched.

**What broke / surprised us**

- **The system prompt has forked three ways, and production is the odd one out.** Session 3 left
  two copies with a drift test. There are actually three, and the live agent matches neither: it
  carries a condensed `A SPOKEN NAME IS NOT IDENTIFICATION` block, where `claude/robin-survey` has
  the fuller `GET A NAME BEFORE YOU VERIFY` flow, the `A SPOKEN NAME IS NEVER IDENTIFICATION`
  wording, and a `USE THE NAME ON THE RECORD ONCE VERIFIED` rule (use `first_name` from
  `verify_caller`) that production **does not have at all**. Live was last updated ~2026-08-06,
  three days *after* the branch — so someone edited the dashboard from an older base and dropped
  the branch's name-handling work.
  Neither copy is a superset. **This is a decision, not a merge**, and it is Tanner's:
  does production keep its condensed rule, or take the branch's name-first flow?
  Captured production verbatim to `robin-system-prompt.LIVE-2026-09-01.txt` so the live text exists
  somewhere other than the dashboard. The clone was built by appending *only* the survey block to
  that live text, so testing the survey does not smuggle in the name-flow change.
- **Three tools on the live agent still point at `lumio-retirement.vercel.app`** —
  `get_plan_details`, `send_reset_email`, `document_resolution` — while `verify_caller` and
  `get_balance` point at `voiceagents-seven.vercel.app`. `get_plan_details` is the dangerous one: it
  overlaps `get_balance`, the prompt never mentions it, and nothing stops the model reaching for it
  and getting figures from a different deployment. The setup doc's §2 note already says the
  experiment dropped `send_reset_email` and `document_resolution`; they are still attached.
- **The clone inherited production's post-call webhook** (`post_call_webhook_id`
  `4deed01a…`). Test calls on the clone will POST to the *production* `/api/postcall` and write
  real `ai_call_events` rows. Harmless for the survey (prod has no parser, so survey fields are
  ignored) but it means clone traffic is not isolated from the experiment's data.

**Next session:**
> **Task 1 is finished except the part that needs a human**: place a web-widget call to the clone and
> confirm Robin (a) offers the survey after a resolved question, (b) does NOT offer it on a transfer
> or a failed verification, and (c) that the 8 fields populate. Use Priya — Member ID `90003`,
> DOB 1974-06-08 — per Session 3; Marcus routes to a transfer and suppresses the survey by design.
> Nothing will be *recorded* until Task 2 ships, so this call tests prompt behaviour and field
> extraction only.
>
> **Then Task 2, unchanged and still the blocker:** get `claude/robin-survey` to production.
>
> Two new items, both small and both live-config risks: **detach or repoint the three
> `lumio-retirement` tools**, and **settle the prompt fork** (see above) before anything is pasted
> into the live agent.

---

### 2026-08-03 — Session 3 (survey + a broken grader)

**HANDOFF: read this block first, then the two "Start here" tasks at the bottom.**

**Where things stand**

Two branches, neither merged. `main` does not have any of this.

| Branch | Contents |
|---|---|
| `claude/repo-familiarization-h6dd80` | edit fact-check on save, grader stuck-detection, dashboard tile split, name-first prompt, outbound-calling reference |
| `claude/robin-survey` | branched off the above, so it contains **all of it** plus the survey. 11 commits ahead of `main`. |

`claude/robin-survey` is the one to work from — it has the complete prompt.

**Three switches, and only one is on.** The survey needs all three:

| Piece | Where | State |
|---|---|---|
| `call_surveys` table | Supabase | ✅ applied (migrations 007, 008) |
| `postcall.js` survey write + `GET /api/surveys` | Vercel prod | ❌ unmerged branch |
| Survey prompt block | ElevenLabs system prompt | ❌ not pasted |
| 8 Data Collection fields | ElevenLabs Analysis tab | ❌ not created |

⚠️ **Paste the prompt without deploying the branch and Robin asks all three questions while nothing
is recorded** — production `postcall` has no parser. Order: deploy → fields → prompt.

**The survey, as designed.** Asks about the agent, not the outcome:
1. "How well did I understand what you were asking?" (1-5) → `understood`
2. "Would you rather sort this out with me, or wait for a person?" → `prefer_agent`
3. "Anything I could have done better?" (open) → `improve_verbatim`, PII-scrubbed
4. Callback consent + window → the seed for outbound

There is deliberately **no "did we solve it" question** — the grader already computes resolution per
question from the transcript. `csat` remains as a column and parses if it comes up, but is no longer
asked directly.

**What broke / surprised us**

- **The grader had been silently dead for weeks.** `call_question_scores.question_key` still had a
  foreign key to `curated_questions`, left behind by the answer-key removal. Observed keys are
  kebab-case (`loan-eligibility-401k`); curated keys are underscored. Every score row for a call
  where Robin actually answered threw 23503, the error went to `console.error`, `scored_at` was
  never stamped, and the same ten calls were re-graded on every 30-second dashboard refresh —
  paying for the model each time and writing nothing. Only calls where she answered *nothing* got
  through, because those write no score rows. That is why 3 of 30 looked graded.
  Fixed by migration `drop_call_question_scores_curated_fk`; backlog drained to 30/30.
- **The real numbers were nothing like the stale ones.** After the fix: 130 questions asked across
  30 calls, **100 answered (77%)**, 13 fixable by writing an article, 17 not content problems at all
  (10 out of scope, 7 correct declines).
- **Only 8 of 97 answers could be fact-checked**, because the Vertex documents were hand-loaded and
  have no `kb_articles` row. Of those 8, **6 made a claim the source didn't support.** Tiny sample,
  points the wrong way, worth watching as coverage grows.
- **Gap closure is wired to fail.** The dashboard's "Ask for this" button posts no `plan_id`, so
  rows land with `plan_id=''`, while `resolveGapsFor()` queries by the article's real `plan_id`
  (`intrust-401k-plan-1`). It has never fired, and when it does it will match nothing. **Not fixed.**
- **Three copies of the system prompt existed and one had rotted** — the setup doc still said INTRUST
  months after the move to Vertex and was missing every rule added from live-call testing. Now two
  copies with `test/prompt-sync.test.mjs` failing on drift.

**Decisions made**

- Survey collected via **Data Collection, not a mid-call tool** — answers are in the transcript,
  nothing needs them during the call, and a tool adds latency plus a new way for the conversation to
  break.
- Ratings outside 1-5 are **discarded, not clamped**; unknown stays `null`, never `false`.
- `call_surveys` has **no `plan_id` column**, deliberately — we cannot populate one from a call, and
  `gap_requests` just showed what an always-empty tenant column costs.
- Outbound survey calls are **gated on TCPA**, not engineering. The API exists (below); consent is
  the blocker and needs a human at INTRUST.

**Environment gotchas that cost time**

- `elevenlabs.io` and `*.vercel.app` are **blocked by the agent proxy**. Use
  `mcp__Vercel__web_fetch_vercel_url` for Vercel URLs; for ElevenLabs docs, `github.com/elevenlabs/skills`
  is reachable and first-party.
- **Vercel builds only what is inside a project root** — `content-cleaner/cleaner` and
  `robin-experiment/broker` are separate projects and cannot import from each other. That is why the
  PII scan is reimplemented in `broker/lib/survey.js` instead of reusing `deterministicScan`.
- Migrations are applied via Supabase MCP **and** mirrored into `supabase/migrations/`.

**Demo credentials (synthetic)**

- **Marcus — Member ID `90002`, DOB 1998-09-30.** Not fully vested, **has an outstanding loan** →
  best for demoing the loan trap, but the loan-limit gap routes to a transfer, and the prompt
  forbids offering the survey mid-transfer.
- **Priya — Member ID `90003`, DOB 1974-06-08.** Fully vested, no loan → nothing triggers a
  transfer, so the survey actually fires. **Use Priya to demo the survey.**

**Outbound calling — verified, for when TCPA clears**

`POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` with `agent_id`,
`agent_phone_number_id`, `to_number` (E.164), plus
`conversation_initiation_client_data.dynamic_variables` — that last one is how an outbound agent
knows who it is calling and why. Batch endpoint exists too but its body schema is **not** first-party
verified. See `docs/elevenlabs-reference.md`. The caller's number already arrives on every inbound
call at `metadata.phone_call.external_number`.

**Open unknowns, cheapest probe first**

| Unknown | Probe |
|---|---|
| Does the ElevenLabs API return KB **document text**? If yes, hand-loaded Vertex docs become gradeable and the `no_source` problem disappears | `broker/api/kb_probe.js` — **written, never run** |
| Does the ElevenLabs MCP connector expose **Data Collection field** creation? | one read-only `agents_get` |
| Is 6-of-8 unsupported real or noise? | needs more checkable answers |
| Does multi-tenancy work with two live plans? | seed a second `plan_id`, run one call |

**Next session:**
> **Start here (1) — ElevenLabs, with the connector live.** It was announced this session but
> disconnected before it could be used. First call is **read-only `agents_get`** on the Robin agent to
> see what the config payload actually exposes — specifically whether Data Collection fields can be
> written, which is unconfirmed. If yes: use `agents_duplicate` to clone Robin into a survey-test
> agent so the live agent stays untouched, put the survey prompt + 8 fields on the clone
> (`elevenlabs-experiment-setup.md` §2 and §7), and test through the web widget. If field creation is
> not exposed, set the prompt and add the fields by hand.
>
> **Start here (2) — get the code to production.** Nothing records until `claude/robin-survey` is
> deployed. Merge it or open the PR; it carries 11 commits, so if only the survey is wanted, rebase
> the two survey commits onto `main` on a clean branch instead.
>
> Then: fix the `plan_id` bug in the dashboard's gap request (2 lines, currently guarantees gap
> closure matches nothing), run `kb_probe`, and start the TCPA conversation — it has the longest lead
> time and the outbound dialer waits on it, while the consented population only accumulates once the
> survey is live.

---

### 2026-07-23 — Session 2

**Time spent:** ~1 session
**Status after session:** on track

**What we did:**
- Loaded **50 synthetic members** into Supabase (member_id + synthetic DOB + synthetic balances;
  varied vesting/loans/consent; zero real PII).
- Built the **broker** (`broker/`): dependency-free Vercel functions `verify_caller`,
  `get_balance`, `postcall` (HMAC-verified webhook → idempotent `ai_call_events`), with tolerant
  spoken member-id/DOB parsing (unit-tested).
- Ingested the **INTRUST enrollment packet** → 3 RAG KB docs + 25 curated questions (seeded).
- Built the **grader** (`grader/`): deterministic security scan + **claude-opus-4-8** LLM judge
  (structured output) grading quality vs. ideal answers, sentiment, and security; writes
  `call_question_scores` + call-level verdict. Added migrations 005 (security_flag/detail) + 006
  (scored_at).
- Dashboard reached its final **reductive (Rams/Vignelli)** design with by-question/by-category
  grouping + per-question answer drill-down (`dashboard/`, sample data).

**What broke / surprised us:**
- Enrollment packet reveals the real INTRUST login uses SSN — reinforced Robin's hard no-SSN rule.
- Loan limits absent from the packet → grader flags invented limits as `wrong`.

**Decisions made:**
- Judge model is stronger than Robin (Opus 4.8 vs Haiku); grade vs. stored ideal answers.
- Security is deterministic-first and hard-fails the Security verdict.

**Next session:**
> DONE since: broker **deployed & live** at `https://voiceagents-seven.vercel.app` (verify_caller +
> get_balance verified working against Supabase); **ElevenLabs setup guide written**
> (`elevenlabs-experiment-setup.md`) with the real broker URL baked in.
> NEW TODO (Tanner's ask): a **boss-facing Q&A test artifact** (Phase 1) — paste ~25 questions,
> LLM RAGs the KB (3 docs, small enough to stuff), outputs Q+A readably, each with a "resend" button
> for answer-variation testing. Likely a broker `/api/ask` endpoint + a static artifact frontend.
> Remaining: (1) ~~deploy broker~~ ✅; (2) **configure ElevenLabs** for the experiment
> (system prompt for member_id+DOB verify + no-SSN rule + INTRUST plan, upload 3 KB docs, point
> verify_caller/get_balance webhook tools at the broker, post-call webhook → /api/postcall, add
> Data Collection fields) — I write the paste-ready guide; (3) **wire the dashboard to live
> Supabase** (read-only view + publishable key); (4) run the **grader calibration** set once real
> transcripts exist; (5) generate **tester credential cards** (last). Confirm verdict thresholds.

### 2026-07-23 — Session 1

**Time spent:** ~1 session
**Status after session:** on track

**What we did:**
- Scoped the experiment (`SCOPE.md`) and locked decisions: synthetic balances, opt-in tester
  consent, verify by **Member ID + DOB** (no SSN), dedicated Supabase project.
- Provisioned Supabase **`robin-experiment`** (ref `rlhybqslnqhggbykjrqg`, us-east-2, ~$10/mo) and
  applied 4 migrations: `members`, `ai_call_events`, `curated_questions`, `call_question_scores`
  (RLS on, service-role-only). Mirrored in `supabase/migrations/`.
- Turned the 2025 INTRUST enrollment packet into **3 RAG-ready KB docs** (`kb/`) and the
  **25-question eval set** (`curated-questions.md`), seeded into `curated_questions`.
- Built the **experiment dashboard** through 3 design passes → reductive (Rams/Vignelli) verdict-first
  monitor with by-question/by-category grouping and per-question answer drill-down
  (`dashboard/robin-dashboard.html`, sample data).
- Agreed the **grading design** (see `SPEC.md`): async LLM-judge graded vs. ground-truth ideal
  answers, transcript sentiment, deterministic-first security checks, calibration + human review.
- Wrote **`SPEC.md`** capturing the full system.

**What broke / surprised us:**
- The enrollment packet reveals the **real INTRUST login uses SSN as User ID + last-4 as password**.
  Reinforced the hard rule: Robin verifies on Member ID + DOB and must never ask for/echo an SSN.
- The packet gives a **$100 loan fee but no loan limits/terms** → Robin must route loan specifics to
  a specialist, not invent them (the grader flags invented facts as `wrong`).
- Local PDF tooling was broken (`cryptography`/poppler); used **PyMuPDF** to extract the packet text.

**Decisions made:**
- Verify on synthetic Member ID + DOB — verification DB holds **zero real PII**.
- Grade quality **against the stored `ideal_answer`**, not open-ended; judge model stronger than Robin.
- **Security flag hard-fails the experiment Security verdict** (compliance event, not per-call).
- KB = the guide (Robin reasons/RAGs); the 25 Q&A = the eval set/yardstick.

**Next session:**
> Build the **broker tools against Supabase**: (1) generate 50 synthetic `members` rows + printable
> tester credential cards (member_id + synthetic DOB + synthetic balance) and load them; (2) write
> `verify_caller { member_id, dob }` and `get_balance { subject_ref }` as Vercel functions hitting
> Supabase (service key in env), reusing the mock-backend pattern; (3) the `postcall` webhook
> receiver that writes `ai_call_events`. Then draft the grader prompt + JSON schema and run the
> calibration set once real transcripts exist. Confirm the success thresholds for the verdict tiles.
