# BUILD LOG — Robin 50-User Experiment

**Slug:** robin-experiment
**Started:** 2026-07-23
**Status:** active — see Session 3 for the current handoff

---

## Session log

<!-- Add new sessions at the top, newest first -->

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
