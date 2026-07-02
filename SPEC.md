# SPEC — Lumio Retirement Voice Line

**Slug:** lumio-retirement-voice
**Status:** draft
**Last updated:** 2026-07-01

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Matches Lumio's `/api` + dashboard; shared types |
| Runtime | ElevenLabs Conversational AI (managed voice agent) + Node 22 on Vercel serverless (OTP + webhook) + React 19 dashboard | Voice stack is bought; the glue and UI run on the existing Lumio stack |
| Key libraries | `@supabase/supabase-js`, OTP/SMS provider SDK, Tailwind (dashboard) | Inherited from Lumio + one new OTP provider |
| Storage | Supabase Postgres — `ai_call_events` (metrics + audit) | Existing project; Lumio owns the system of record |
| Scheduler / trigger | Event-driven: inbound SIP call (Talkdesk→ElevenLabs); ElevenLabs post-call webhook (→Lumio). No cron. | Everything is call-triggered |
| Outputs / delivery | (1) Voice answers to caller; (2) normalized metric rows → supervisor dashboard | The two deliverables |

## Architecture

Talkdesk stays the front door and switchboard; ElevenLabs is one routing destination; Lumio owns the metrics record.

```
Caller ──PSTN──▶ Talkdesk (1-800 + Navigator: intent at the door)
                   ├─ AI-eligible topic ──SIP──▶ ElevenLabs voice agent
                   │                               • OTP tool  → Lumio /api
                   │                               • KB (KCS KBAs) via free-form procedures
                   │                               • transfer_to_number (SIP REFER) ─┐
                   └─ human-only topic ─────────▶ Talkdesk human queue ◀─────────────┘  (warm transfer w/ context)
                                                        │
ElevenLabs ──post-call webhook──▶ Lumio /api (HMAC verify) ──▶ Supabase ai_call_events ──▶ Supervisor dashboard
```

**Flow:** Navigator classifies → AI-eligible calls dial ElevenLabs over SIP (intent + known context passed as custom SIP headers) → agent runs OTP verify, then answers from the matched free-form procedure grounded in the KCS KB → on out-of-scope / low-confidence / failed-auth / "agent please", agent calls `transfer_to_number` (SIP REFER) back into a Talkdesk queue with context → on call end, ElevenLabs fires the post-call webhook to Lumio, which verifies the signature and persists a normalized row → supervisors view aggregates.

**Feasibility (verified against ElevenLabs docs, 2026-07):** SIP trunking (inbound+outbound, existing telephony) ✅; custom SIP headers for context ✅; KB + **free-form** procedures (structured can't use KB) ✅; `transfer_to_number` + SIP REFER ✅; post-call webhook + LLM Data Collection for structured fields ✅. OTP has **no native support** — built as a custom server tool. Trigger-matching internals are undocumented (black box) — mitigated by a conservative, default-to-transfer system prompt.

## File / folder structure

```
lumio-retirement-voice/
  (docs)  docs/projects/lumio-retirement-voice/{SCOPE,SPEC,BUILD}.md
  (code — on the Lumio app repo/stack, TBD exact paths)
  api/voice/postcall.ts     # ElevenLabs post-call webhook receiver (HMAC verify → upsert)
  api/otp/start.ts          # send one-time code (SMS/email)
  api/otp/verify.ts         # verify code → { verified, subject_ref }
  src/.../VoiceMetrics.tsx  # supervisor dashboard view (reuses Metrics panel patterns)
  config/topic-taxonomy.ts  # single source: Navigator routing + agent procedure triggers
  supabase/migrations/NNN_ai_call_events.sql
  (external config — not in repo)
  ElevenLabs: agent, KB (KCS KBAs), free-form procedures, transfer + SIP config
  Talkdesk: Navigator flow, SIP trunk, human queues
```

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| Talkdesk | 1-800, Navigator front-door routing, human queues, SIP trunk | Talkdesk-side SIP (digest auth) | Existing — team owns; trunk provisioning TBD |
| ElevenLabs Conversational AI | Voice agent, KB, procedures, transfers, post-call webhooks | `ELEVENLABS_API_KEY` (server); webhook HMAC secret | New — buy |
| Supabase | `ai_call_events` store + realtime dashboard | anon (browser) + service role (server) | Existing stack |
| Vercel `/api` | OTP tool endpoints + post-call webhook receiver | Project-level env | Existing stack |
| OTP delivery (SMS/email) | Send one-time codes | provider API key (server) | New — provider TBD |

## Key decisions

- **Talkdesk is the front door; ElevenLabs is one destination.** Keeps the switchboard and human queues native and simplifies transfer.
- **Metrics land in Lumio, not (only) ElevenLabs' native analytics.** We need a custom dashboard regardless; pointing the webhook at Lumio is near-free and buys ownership + vendor portability + cross-cut metrics.
- **Vendor at the edge.** ElevenLabs/Talkdesk specifics stay isolated; the ingestion schema (`provider` is a column), OTP contract, and topic taxonomy are written to generalize — this is the seed of a reusable Call Center flavor.
- **Single-source the topic taxonomy.** Navigator's AI-eligible list and the agent's procedure triggers come from one authored config; drift routes callers to the AI for things it then bounces back.
- **Answer-only, transfer-to-transact (v1).** No account-changing actions until compliance approves a higher-assurance auth model.
- **Warm transfers only.** Topic + verified-identity status + summary carried to the human.
- **Store opaque `subject_ref`, not raw PII**, in the metrics table; retain `raw_payload` (access-controlled) for audit/replay.
- **Idempotent webhook** on `(provider, conversation_id)` to absorb retries.

## Open questions

- [ ] Auth placement: before Navigator (shared with human path) or AI-path only? (Lean: up front, shared.)
- [ ] What may the AI *do* after OTP? (v1 answer-only; confirm allowed low-risk actions + required assurance with compliance.)
- [ ] Pilot topic set (3–5): highest-volume, lowest-risk, best KBA coverage.
- [ ] KBA→KB freshness: manual re-upload vs sync; owner + cadence.
- [ ] Transfer target granularity: one queue vs per-topic skill queues.
- [ ] Recording consent/disclosure wording + retention (compliance-owned).
- [ ] Exact PII contents of the ElevenLabs webhook payload — scrub before persisting `raw_payload`.
- [ ] SIP trunk provisioning owner + custom-header contract for context hand-off.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| AI confidently answers out-of-scope / wrong | High | Conservative prompt; aggressive default-to-transfer; single-sourced taxonomy; monitor false-answer rate; start with 3–5 well-covered topics |
| Two intent classifiers (Navigator + triggers) drift | High | Single-source taxonomy as config; feed both; review together on every change |
| Procedures are Alpha; trigger matching is a black box | Medium | Keep KBA answers free-form (can't convert types later); tune triggers with real transcripts; isolate vendor config |
| OTP insufficient for transactional requests | High | v1 answer-only; transactional requests transfer; revisit assurance with compliance before enabling actions |
| Regulatory/compliance exposure (financial services) | High | Compliance from day one; recording disclosure; opaque `subject_ref`; access-controlled `raw_payload` audit trail |
| Vendor lock-in to ElevenLabs | Medium | Metrics owned in Lumio; `provider` is a column; ingestion schema vendor-neutral |
| Cold/awkward transfer erodes caller trust | Medium | Warm transfer with context + verified-identity via SIP headers / agent message |
| Webhook duplicates or drops | Medium | Idempotency on `(provider, conversation_id)`; verify HMAC; retain `raw_payload` for replay |

---

*Spec last updated: 2026-07-01*
