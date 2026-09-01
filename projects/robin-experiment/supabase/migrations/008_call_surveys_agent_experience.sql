-- Re-point the survey at the conversational experience rather than at the outcome.
--
-- `fcr` is dropped, not kept: the grader already determines from the transcript whether she
-- resolved each question, and with what reason when she didn't. Asking the caller spent their
-- patience re-collecting a fact we compute for free. The table was empty, so nothing was lost.
--
-- csat stays as the headline number for reporting; it is no longer the only number.
alter table call_surveys drop column if exists fcr;

alter table call_surveys
  -- "How well did I understand what you were asking?" — the #1 failure mode in voice AI, and
  -- unlike a call-quality score it is about the agent rather than the outcome.
  add column if not exists understood smallint
    check (understood is null or (understood between 1 and 5)),
  -- "Next time, would you rather sort this out with me, or wait for a person?"
  add column if not exists prefer_agent text
    check (prefer_agent is null or prefer_agent in ('agent','person','no_preference')),
  -- "Anything we could do better next time?" — the only field that can surface something we did
  -- not already know to measure.
  add column if not exists improve_verbatim text,
  -- True when the answer tripped the PII scan and was dropped. Keeps the RATE visible without
  -- keeping the words: an open question in financial services invites account numbers and health
  -- reasons, and this is the one survey field that can carry them.
  add column if not exists improve_redacted boolean not null default false;

comment on column call_surveys.understood is
  'Caller''s own 1-5 rating of how well the agent understood them. Compare against the grader''s grounding: felt-understood plus unsupported claims is the confidently-wrong quadrant.';
comment on column call_surveys.improve_verbatim is
  'Open-ended answer, PII-scrubbed before storage. Null with improve_redacted=true means something was said and dropped.';
