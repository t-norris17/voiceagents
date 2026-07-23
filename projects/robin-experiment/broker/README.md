# Broker — Robin experiment

Dependency-free Vercel functions between ElevenLabs (Robin) and Supabase. Deploy this folder to a
throwaway Vercel project; set env vars from `.env.example` in the project settings.

**Deployed:** `https://voiceagents-seven.vercel.app` (Vercel project `voiceagents`, root directory
`projects/robin-experiment/broker`). `verify_caller` + `get_balance` are live; `postcall` activates
once `ELEVENLABS_WEBHOOK_SECRET` is set (see `../elevenlabs-experiment-setup.md` §6).

| Endpoint | Method | In → Out |
|---|---|---|
| `/api/verify_caller` | POST | `{ member_id, dob }` → `{ verified, subject_ref, first_name, consented }` |
| `/api/get_balance` | POST | `{ subject_ref }` → `{ found, plan_name, balance, vested_balance, fully_vested, outstanding_loan, deferral_pct }` |
| `/api/postcall` | POST | ElevenLabs post-call webhook (HMAC-verified) → upsert `ai_call_events` |

## Register in ElevenLabs

- **Webhook tools** (Agent → Tools) → `verify_caller`, `get_balance` pointing at the deployed URLs.
- **Post-call webhook** (Developers → Webhooks, Transcription) → `/api/postcall`; copy the signing
  secret into `ELEVENLABS_WEBHOOK_SECRET`.
- To read `subject_ref` back on `postcall`, add a **Data Collection** field `subject_ref` (plus
  `topic`, `outcome`, `transfer_reason`, `auth_outcome`) so outcomes land structured.

## Security model

- **Service role key is server-only** (`lib/supabase.js`). Never in the browser or the ElevenLabs
  tool config. RLS-on tables are reachable only via this broker.
- Tools return the **opaque `subject_ref`** (members.id), never the member_id or DOB.
- `get_balance` intentionally omits any loan limit — the guide has none, so Robin routes
  loan-amount questions to a specialist instead of quoting a figure.
- `postcall` **rejects unsigned/mis-signed** payloads (HMAC-SHA256 over `t.rawBody`).

## Verification model

Callers verify with **assigned Member ID + synthetic DOB** (see `../seed/` for the tester cards).
No SSN anywhere. `parse.js` tolerates spoken input ("N E one zero zero zero one", "January 1st 1962").
