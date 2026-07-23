-- Per-call outcomes ingested from the ElevenLabs post-call webhook.
-- Reuses the phase-2 metrics shape; adds call-level sentiment + normalized transcript.
create table if not exists ai_call_events (
  id                uuid primary key default gen_random_uuid(),

  -- provenance
  provider          text        not null default 'elevenlabs',
  conversation_id   text        not null,

  -- timing
  started_at        timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer,

  -- outcome (from ElevenLabs Data Collection / analysis)
  topic             text,
  outcome           text        not null default 'unknown'
                      check (outcome in ('resolved','transferred','abandoned','unknown')),
  transfer_reason   text,
  auth_outcome      text        not null default 'not_attempted'
                      check (auth_outcome in ('verified','failed','not_attempted')),

  -- identity (opaque -- references members.id, never raw member_id/PII)
  subject_ref       text,

  -- experiment signals
  overall_sentiment text        check (overall_sentiment in ('positive','neutral','negative','mixed')),

  -- economics
  cost_cents        integer,

  -- transcript + audit
  transcript        jsonb,                       -- normalized turns for the dashboard
  raw_payload       jsonb       not null,        -- full webhook body (service-role only)

  created_at        timestamptz not null default now(),

  constraint ai_call_events_provider_conversation_uniq unique (provider, conversation_id)
);

create index if not exists ai_call_events_started_at_idx on ai_call_events (started_at desc);
create index if not exists ai_call_events_outcome_idx    on ai_call_events (outcome);
create index if not exists ai_call_events_subject_idx    on ai_call_events (subject_ref);

alter table ai_call_events enable row level security;

comment on table  ai_call_events             is 'AI voice-agent call outcomes from the post-call webhook. System of record for the experiment dashboard. Idempotent on (provider, conversation_id).';
comment on column ai_call_events.subject_ref is 'Opaque reference to members.id. Never store raw PII here.';
comment on column ai_call_events.raw_payload is 'Full provider webhook body for audit/replay. Service-role access only.';
