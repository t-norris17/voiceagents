# BUILD LOG — Robin 50-User Experiment

**Slug:** robin-experiment
**Started:** 2026-07-23
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-08-05 — Session: the dashboard was spending $87/day and nobody could see it

**Time spent:** ~1 session
**Status after session:** on track — needs a promote

**What we did:**
- Traced a **$88.81 single-day Anthropic bill** ($87.05 of it Sonnet 5) to its actual source.
  Vercel runtime logs over 48h: **769 invocations of `/api/grade`** and 759 of `/api/metrics` on
  the broker, against **13** `/api/clean` on the cleaner. The dashboard's 30-second auto-grade
  loop — up to 6 batches of 10 calls per tick, a model call apiece — was the whole story. Roughly
  **20 full passes over 39 calls**, most of them nobody asked for.
- **Removed the auto-grade loop.** `/api/metrics` still refreshes on a timer (it's a DB read and
  costs nothing), but nothing on the page calls a model unless a button is pressed. Two buttons
  now: *Check them now* (unscored calls) and *Re-check them* (below the current grader rev), both
  running through one `runGrading()` that shows the cost climbing as it spends.
- **Dropped the grader from `effort: high` to `medium`.** Output is ~72% of the call's cost. The
  grader does arithmetic on quotes it's handed; the judgement lives in `scoreAnswer`/`scoreGap`,
  in code. High effort stays in the Knowledge Factory's critic, which has to find what *isn't*
  there.
- **Added prompt caching to `/api/grade`** — two breakpoints, on the system prompt (byte-identical
  every call) and the retrieved documents (five documents carry nearly all this project's
  retrieval traffic). Documents moved from the user turn into `system`, and are now sorted by
  title so the same set always renders byte-identical.
- **`/api/grade` reports what it spent**: `tokens` (input / output / cache_write / cache_read) and
  `est_cost_usd` at Sonnet 5 *list* rates, deliberately not the promotional ones.

**What broke / surprised us:**
- **My first estimate was 10× low** — I guessed transcripts at 4–8KB. Measured, they average
  **29,658 bytes** (max 78,937). Real per-call input is ~13.6k tokens, not ~7k. The lesson is the
  one this project keeps re-learning: measure before explaining.
- **Caching would have been a net loss as first written.** `Promise.allSettled` fires all ten
  calls of a batch concurrently, so all ten race the cache write, all ten pay the 1.25× premium,
  and none gets a read. Fixed by grading the first call alone to warm the cache, then fanning out
  the remaining nine — the same trick `cleaner/lib/validate.js` already used for its critic.
- The auto-loop's filter (`scored_at is null`) does drain correctly; it wasn't a runaway. The cost
  came from it racing *manual* re-grades — every time `scored_at` was cleared to force a re-grade,
  an open tab started grading the same 39 calls in parallel.

**Decisions made:**
- **A dashboard reports spend; it does not create it.** No model call on this page without a
  click. If unattended grading is wanted later it belongs in a Vercel cron (needs Pro for
  sub-daily) or the post-call webhook — *not* in a browser tab.
- Grading stays out of the `postcall` webhook. The ingest path must never block on a ~25s model
  call; a webhook that times out loses the call entirely, which is the exact failure this
  dashboard exists to surface.
- Cost estimates shown to a user are quoted at **list price**. An estimate that reads high is
  survivable; one that reads low is how you find out from the invoice.

**Next session:**
> **Promote the broker** — this change plus `a3d0017` (the Overview/Content/Questions/Calls tabs)
> are both sitting unpromoted, and the last re-grade ran against the build before them. Then press
> *Re-check them* once and read the `est_cost_usd` the run reports back: that's the first real
> measurement of a full 39-call pass at `effort: medium` with caching on, and it tells us whether
> the ~$3.90 → under-$1 estimate holds. Confirm `cache_read_input_tokens` is non-zero on calls 2-10
> of each batch — if it's zero the warm-up call isn't working and the caching is costing us 1.25×
> for nothing. Still open from before: `conv_3101kyms4vb3f90r085rbbr8kqmn` (20 turns, 36KB) fails
> every grading attempt and records no reason, and the `handled_correctly` threshold (handoff ≥ 3.5)
> was picked without evidence and shouldn't be shown to anyone until it has some.

---

### 2026-08-04 — Session: grade against the real KB; per-call scores; utilization

**Time spent:** ~1 session (continues the session below)
**Status after session:** on track — one deploy setting outstanding

**What we did:**
- **Found that the grader had been blind almost the whole time.** Ran the numbers on the 39 calls in
  `rlhybqslnqhggbykjrqg`: 38 of 39 retrieved something from the knowledge base, **3** could be
  graded against it, and **100 of 108 answers came back `no_source` — averaging 4.24/5 anyway.**
  An answer with no source has no claims, so it takes no grounding deductions and scores near 5 by
  default. The dashboard's "and got it right: 4.2/5" was computed almost entirely from answers
  nobody had checked.
- **Cause:** the grader resolved retrieved `document_id`s against our own `kb_articles` table, which
  only holds what the Knowledge Factory published. Five documents carried nearly all the traffic
  (30–37 calls each) and none were ours — uploaded straight into the ElevenLabs dashboard. The
  limitation was written down in `grade.js`'s header comment from the start; nobody had measured how
  much of the corpus it covered.
- **`lib/elevenlabs-kb.js`** reads document text from `GET /v1/convai/knowledge-base/{id}/content`,
  cached in `kb_document_cache` (migration 004). The grader now resolves kb_articles → cache →
  ElevenLabs, so it can see whatever Robin actually retrieved.
- **Two scores per call, never blended.** *Accuracy* = was what she said supported by the documents
  she read. *Quality* = did she answer what was asked, fully, and hand off when she should have.
  They fail separately and the dangerous call is where they diverge. **Accuracy is null when nothing
  could be checked** — unknown, not good — and a null is never averaged in.
- **Utilization redefined at the call level**, per the ask: calls with at least one KB-grounded
  answer / calls where a plan question was asked. Grounded in an article is stricter than "she said
  something" — otherwise the number measures Robin's fluency, not the library's coverage. Each call
  lists which of its questions the KB didn't answer and why.
- `POST /api/grade?regrade=1` re-scores calls stamped before the KB was readable. Surfaced as a
  dashboard button, not automatic — it costs a model call per call.
- Migrations **003** (webhook_ingest_log) and **004** (kb_document_cache, call-level score columns,
  `kb_answered`, plus a fifth `grounding` value `no_claims`) applied to `rlhybqslnqhggbykjrqg`.
- 36 broker tests, up from 10.

**What broke / surprised us:**
- The old grader tests **passed the whole time** — they pinned that an answer with no source scores
  5 and reads `no_source`. Both halves were true and the combination was the bug. A test can lock in
  a defect if it only ever asserts the behaviour and never asks whether the behaviour is right.
- `grounding` has a CHECK constraint. Adding `no_claims` without the constraint change would have
  400'd **every** score write — the grader would have gone silently to zero output. Caught by
  reading the constraint before writing the code, not after.
- `no_claims` earned its place: "we read her sources and she said nothing checkable" (a balance from
  a tool, a correct hand-off) is not `grounded` and not `no_source`.

**Decisions made:**
- **An unknown is never rendered as a good number.** Null accuracy, null averages, "not checked" on
  the tile. Same rule as the pipeline strip's "?" for unknown rejections.
- **Utilization counts KB-grounded answers, not non-empty ones.** Otherwise it measures the wrong
  thing and always looks good.
- Re-grading spends money, so a human presses the button.

**Next session:**
> **Set `ELEVENLABS_API_KEY` on the Vercel broker project** — until then the grader still can't read
> the five dashboard-uploaded documents, accuracy stays null, and utilization can't be computed.
> `/api/health` reports this as a fatal problem and the dashboard shows it. Then open the dashboard,
> press **Re-check them** to re-score the 39 existing calls against the real KB, and read the first
> honest accuracy and utilization figures. Expect accuracy to come in well below the old fake 4.24.

---

### 2026-08-04 — Session: "calls are coming in but not showing up"

**Time spent:** ~1 session
**Status after session:** on track

**What we did:**
- Traced the report. A call becomes a dashboard number only by surviving three hops —
  **webhook accepted → row with a transcript → graded** — and the dashboard rendered only what
  survived all three. So a webhook rejecting every call, a provider sending transcript-less events,
  and a genuinely quiet afternoon all produced the same empty page.
- **Two ordering bugs, both of which hide a call that really arrived.** `/api/metrics` ordered on
  the provider's `started_at` with nulls last and then sliced the top 20 — a call with a null start
  time sat at position 21 of 21 and never appeared, while plainly existing in the database. And a
  call with no transcript was counted as "waiting to be graded" forever, so the queue looked like it
  never drained. Ordering is now by arrival (`created_at`, which always exists) and un-gradable
  calls are reported as such.
- **`webhook_ingest_log`** (migration `broker/supabase/migrations/003_webhook_ingest_log.sql`):
  `postcall` now records every attempt, accepted or turned away, with a reason. No payload, no
  caller data — a rejected body is unverified input and isn't kept. Until the migration is run the
  dashboard reports rejections as *unknown*, never as zero.
- **`/api/health`**: which env vars are set (presence only, never values), which tables are
  readable, and a list of fixable problems. This is what catches the most likely cause of all —
  a missing or mismatched `ELEVENLABS_WEBHOOK_SECRET`, which turns away 100% of calls silently.
- **Dashboard: "Where your calls are"** — arrived / checked / waiting / can't-be-checked / turned
  away, with a plain-English line per stuck bucket saying what to do. Each row in Recent calls now
  carries its own state.
- **Grading loop**: a failing `/api/grade` was swallowed by an empty `catch`, so calls piled up
  unchecked in silence. It's now reported. Grading also keeps going while a backlog exists instead
  of clearing ten per 30 seconds.
- Extracted the pipeline logic to `broker/lib/pipeline.js` and pinned it with
  `broker/test/pipeline.test.mjs` (11 tests) — it was only exercisable by placing a real call.

**What broke / surprised us:**
- Nothing new broke. The surprise was how much of "unreliable" was **unreported** rather than
  wrong: three separate silent-failure paths (401 on bad signature, transcript-less rows, swallowed
  grade errors), each individually reasonable, adding up to a dashboard that couldn't explain itself.

**Decisions made:**
- **Absence of evidence is never rendered as evidence of absence.** Where the dashboard can't see
  something (no ingest log table), it says "unknown", not "zero".
- The ingest log stores **no payload** — diagnosing a rejected webhook is not worth persisting
  unverified input.

**Next session:**
> **Run migration `broker/supabase/migrations/003_webhook_ingest_log.sql`** against project
> `rlhybqslnqhggbykjrqg` — until then the "turned away" count reads as unknown. Then open the
> dashboard and check the "Where your calls are" strip against reality: if it shows turned-away
> calls, the fix is almost certainly re-copying the signing secret from ElevenLabs. Consider moving
> grading off the open browser tab (a cron hitting `/api/grade`) so a closed dashboard doesn't mean
> an unchecked backlog.

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
