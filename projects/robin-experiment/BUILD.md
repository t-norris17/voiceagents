# BUILD LOG — Robin 50-User Experiment

**Slug:** robin-experiment
**Started:** 2026-07-23
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

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
