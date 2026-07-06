# Phase 2 — Multi-tenant plan Q&A (150+ employer plans)

**Status:** design note (phase 2). The demo uses a single plan (Vertex Manufacturing) in the
ElevenLabs Knowledge Base; that's fine for a stage demo but does **not** represent production,
where NestEgg records **~150 employer plans**, each with its own rules. This note captures the
architecture that scales.

## The problem with the demo shape
- **Prompt shouldn't name a plan.** A caller belongs to exactly one of 150 plans; the agent must
  learn *which* from the caller's record, never assume "Vertex." (Fixed in the demo prompt — it now
  refers to "the caller's plan," resolved from `get_plan_details`.)
- **One shared Knowledge Base doesn't isolate tenants.** Dumping all 150 plans' documents into the
  agent's KB means RAG can retrieve the *wrong* employer's rule (e.g., a match formula from a
  different plan). Loans/vesting/rollover rules differ per plan — a cross-tenant answer is a
  compliance problem, not just a UX one.

## Target architecture: retrieval scoped by `plan_id`
1. **Identify the plan at verification.** `verify_caller` (or a directory lookup) returns the
   caller's **`plan_id`** and plan name from the participant record. Every downstream call carries
   `plan_id`.
2. **Answer plan questions through a retrieval TOOL, not the shared KB.** Add a server tool
   `answer_plan_question({ plan_id, subject_ref, question })` that:
   - runs vector search over **only that plan's documents** (each plan's SPD chunked, embedded, and
     tagged with `plan_id`), and
   - returns grounded snippets (or a drafted answer) for the agent to speak.
   Because retrieval is filtered to `plan_id`, a caller can only ever get **their own plan's** rules.
3. **Personal figures stay in `get_plan_details`** (keyed by `subject_ref`) — unchanged from the demo.
4. **Prompt stays plan-agnostic** — "answer from the caller's plan," resolved from data.

## Store
- **Supabase Postgres + `pgvector`** (fits the existing Lumio stack from `PROGRAM-SPEC.md`): a
  `plan_documents` table `{ plan_id, doc_id, chunk, embedding, source, effective_date }`, with
  **row-level security by `plan_id`** so retrieval can't cross tenants. A managed vector DB is an
  alternative; Postgres+pgvector keeps it on one stack.
- **Ingestion pipeline:** onboarding a new employer = **upload their SPD** → chunk → embed → tag
  `plan_id`. No agent or prompt change per client. Re-ingest on plan amendments; keep
  `effective_date` so answers cite the current plan year.

## Why a tool instead of ElevenLabs' native KB at scale
- Native KB is great for **one or a few** plans (what the demo uses). At 150 tenants you need
  **hard per-tenant isolation** on retrieval, which a `plan_id`-filtered store guarantees and a
  shared KB does not. It's also **vendor-neutral** — the retrieval store is ours, portable across
  voice providers (consistent with the program's "vendor at the edge" decision).
- If ElevenLabs adds per-document **metadata filtering** by a runtime variable (`plan_id`), that
  becomes a viable alternative to a custom tool — but the isolation requirement stands either way.

## Guardrails that carry over
- **Identity gate** first (already in the demo): no plan/employer/account details before
  `verify_caller`.
- **One plan per answer:** retrieval filtered to the verified caller's `plan_id`; never blend plans.
- **Education, not advice**; defer personal tax/legal to an advisor or the participant line.
- Ties into the phase-2 metrics: log `plan_id` (opaque) on `ai_call_events` for per-employer reporting.

## Demo vs. production, at a glance
| | Demo (today) | Production (phase 2) |
|---|---|---|
| Plans | 1 (Vertex, native KB) | ~150, `plan_id`-scoped store |
| Retrieval | ElevenLabs KB (RAG) | `answer_plan_question` tool → pgvector filtered by `plan_id` |
| Prompt | plan-agnostic | plan-agnostic (same) |
| Onboarding a client | upload docs to KB | upload SPD → ingest pipeline |
| Isolation | n/a (one plan) | RLS by `plan_id` — no cross-tenant answers |
