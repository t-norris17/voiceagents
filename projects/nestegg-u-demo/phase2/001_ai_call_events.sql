-- Migration: ai_call_events
-- Project: lumio-retirement-voice (RETIREMENT repo — NOT wealth-command's migration set)
-- Purpose: system-of-record for AI voice-agent call outcomes ingested from the
--          ElevenLabs post-call webhook. Powers the supervisor metrics dashboard.
--
-- Notes:
--  * Vendor-neutral by design: `provider` is a column, not baked into the shape.
--  * Stores an opaque `subject_ref`, never raw caller PII.
--  * `raw_payload` retained for audit/replay; access-controlled (service role only).
--  * Idempotent on (provider, conversation_id) so webhook retries are safe.

create table if not exists ai_call_events (
  id                uuid primary key default gen_random_uuid(),

  -- provenance
  provider          text        not null default 'elevenlabs',
  conversation_id   text        not null,                 -- provider's call/conversation id

  -- timing
  started_at        timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer,

  -- outcome (from ElevenLabs Data Collection / analysis)
  topic             text,                                 -- mapped to the single-sourced taxonomy
  outcome           text        not null default 'unknown'
                      check (outcome in ('resolved','transferred','abandoned','unknown')),
  transfer_reason   text,                                 -- null unless outcome = 'transferred'
  auth_outcome      text        not null default 'not_attempted'
                      check (auth_outcome in ('verified','failed','not_attempted')),

  -- identity (opaque — NOT raw PII)
  subject_ref       text,

  -- economics
  cost_cents        integer,

  -- audit / replay (access-controlled)
  raw_payload       jsonb       not null,

  created_at        timestamptz not null default now(),

  constraint ai_call_events_provider_conversation_uniq
    unique (provider, conversation_id)
);

-- dashboard query paths
create index if not exists ai_call_events_started_at_idx  on ai_call_events (started_at desc);
create index if not exists ai_call_events_topic_idx       on ai_call_events (topic);
create index if not exists ai_call_events_outcome_idx      on ai_call_events (outcome);

comment on table  ai_call_events               is 'AI voice-agent call outcomes ingested from the provider post-call webhook. System of record for the supervisor metrics dashboard.';
comment on column ai_call_events.subject_ref   is 'Opaque reference to the verified caller identity. Never store raw PII here.';
comment on column ai_call_events.raw_payload   is 'Full provider webhook body for audit/replay. Service-role access only; scrub PII before persisting if the provider includes it.';
comment on column ai_call_events.provider      is 'Voice vendor (e.g. elevenlabs). Kept as a column to avoid vendor lock-in in the schema.';

-- RLS: enable and restrict. Dashboard reads go through the app's role gating;
-- webhook writes use the service role (bypasses RLS). Tighten to supervisor role
-- once the retirement app's auth roles exist.
alter table ai_call_events enable row level security;

-- (Policies intentionally omitted here — define against the retirement app's role
--  model when it exists. Until then, only the service role can read/write.)
