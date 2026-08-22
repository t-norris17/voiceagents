-- One row per call where Robin offered the survey. Calls where she never offered write nothing,
-- so this table is a record of survey moments; ai_call_events remains the denominator for "all calls".
--
-- Purely additive: nothing else reads it, so creating it cannot disturb testing in flight.
create table if not exists call_surveys (
  conversation_id   text primary key,
  -- The verified member, when there was one. Deliberately NOT a plan_id column: we cannot populate
  -- one from a call, and gap_requests already taught us what an always-empty tenant column costs —
  -- it silently stopped matching anything. Plan comes from members via subject_ref when needed.
  subject_ref       uuid,
  survey_offered    boolean not null default false,
  survey_consent    text not null default 'not_offered'
                    check (survey_consent in ('accepted','declined','not_offered')),
  csat              smallint check (csat is null or (csat between 1 and 5)),
  fcr               boolean,
  callback_consent  boolean,
  -- Free text in the caller's words ("weekday mornings"). Only stored when consent was given.
  callback_window   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The dialer's query, once outbound clears compliance: who said yes and hasn't been called back.
create index if not exists call_surveys_callback_idx
  on call_surveys (callback_consent, created_at desc)
  where callback_consent is true;

create index if not exists call_surveys_subject_idx on call_surveys (subject_ref);

alter table call_surveys enable row level security;

comment on table call_surveys is
  'Spoken survey answers captured by Robin at the end of a call, extracted from the transcript via ElevenLabs Data Collection. callback_consent is the record of permission for an outbound survey call; it is the only lawful basis for dialling and must never be inferred.';
comment on column call_surveys.callback_window is
  'Caller''s own words for when to call back. Null unless callback_consent is true.';
