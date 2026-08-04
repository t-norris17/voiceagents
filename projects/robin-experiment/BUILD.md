# BUILD LOG — Robin 50-User Experiment

**Slug:** robin-experiment
**Started:** 2026-07-23
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

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
