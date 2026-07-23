# Supabase — robin-experiment

Dedicated, isolated Postgres for the 50-user Robin experiment. Provisioned 2026-07-23.

| | |
|---|---|
| **Project name** | `robin-experiment` |
| **Project ref** | `rlhybqslnqhggbykjrqg` |
| **API URL** | `https://rlhybqslnqhggbykjrqg.supabase.co` |
| **Region** | `us-east-2` |
| **Org** | DeepDraft (Pro) · ~$10/mo |

## Tables (see `migrations/`)

| Table | Purpose |
|---|---|
| `members` | 50 synthetic participants. Verification = `member_id` + `dob`. Synthetic balances. Opt-in `consented` flag. |
| `ai_call_events` | Per-call outcomes from the ElevenLabs post-call webhook. Idempotent on `(provider, conversation_id)`. |
| `curated_questions` | The ~25 curated questions + ideal answers (the eval set / ground truth). |
| `call_question_scores` | Per-question grading: what Robin answered, quality, sentiment, human-review flag. Dashboard's main source. |

## Security model

- **RLS is enabled on every table with NO policies** by design. Only the **service role** (used
  server-side by the Vercel broker) can read/write; anon/public is denied. The security advisor's
  `rls_enabled_no_policy` INFO notices are expected, not a defect.
- **ElevenLabs never connects to Supabase directly.** The Vercel broker holds the service key and
  is the only thing that queries the DB.
- **Keys live in env vars only, never in this repo.** The broker needs:
  - `SUPABASE_URL=https://rlhybqslnqhggbykjrqg.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY=...`  (server-side only — never ship to the browser or the agent)
- **No real PII by design:** member IDs and DOBs are synthetic (issued on tester credential cards),
  balances are synthetic. Real-tester transcripts may still contain incidental PII, so treat
  `ai_call_events.raw_payload` / `transcript` as sensitive (service-role only) and set a retention
  window.

## Applying / re-applying

Migrations were applied via the Supabase MCP in order (`001` → `004`). To reproduce on a fresh
project, run the four files in `migrations/` in filename order. They are idempotent
(`create table if not exists`).
