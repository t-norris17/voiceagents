-- Why a call can "come in" and never show up on the dashboard.
--
-- The post-call webhook is the only way a call becomes a row. Until now, every way it could fail
-- was silent: a signature mismatch returned 401 and vanished, a payload with no conversation_id
-- returned 400 and vanished, a database write error was logged to a Vercel function log nobody
-- reads. The dashboard could only ever show what made it through, so a webhook that was rejecting
-- everything looked exactly like a quiet afternoon.
--
-- This table records the ATTEMPT, accepted or not, so "calls are coming in but not showing up" is
-- a question the dashboard can answer instead of a mystery.
--
-- It deliberately stores NO payload and NO caller data — just what happened to the request. A
-- rejected body is unverified input; we don't keep it.
create table if not exists webhook_ingest_log (
  id              bigserial   primary key,
  received_at     timestamptz not null default now(),

  provider        text        not null default 'elevenlabs',
  endpoint        text        not null default 'postcall',

  accepted        boolean     not null,
  -- Short machine-readable reason. 'stored' on success; otherwise what stopped it.
  reason          text        not null
                    check (reason in ('stored','bad_signature','no_secret','unparseable',
                                      'no_conversation_id','write_failed','wrong_method')),
  detail          text,       -- one line of human-readable context; never a payload

  -- Only ever set for a request that PASSED signature verification.
  conversation_id text,
  event_type      text,       -- e.g. post_call_transcription vs post_call_audio
  had_transcript  boolean,

  had_signature   boolean,
  bytes           integer
);

create index if not exists webhook_ingest_log_received_idx on webhook_ingest_log (received_at desc);
create index if not exists webhook_ingest_log_accepted_idx on webhook_ingest_log (accepted, received_at desc);

alter table webhook_ingest_log enable row level security;

comment on table webhook_ingest_log is
  'One row per post-call webhook attempt, accepted or rejected. Diagnostic only: no payload, no caller data. Powers the dashboard''s "where are my calls" panel.';

-- Keep it from growing forever; nothing here is worth more than a couple of weeks.
-- Run manually, or wire to pg_cron if the project has it:
--   delete from webhook_ingest_log where received_at < now() - interval '14 days';
