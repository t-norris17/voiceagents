-- How to read the survey results.
--
-- There is nothing to build. `broker/api/postcall.js` already stores the ENTIRE ElevenLabs
-- webhook event in `ai_call_events.raw_payload`, and every Data Collection field rides along
-- inside it. Verified 2026-09-04: 56 of 56 rows carry
-- raw_payload -> 'data' -> 'analysis' -> 'data_collection_results'.
--
-- So the survey answers land in Supabase the moment the fields exist on the agent. No parser,
-- no migration, no deploy. The queries below are the whole data pipeline.
--
-- Project: robin-experiment (rlhybqslnqhggbykjrqg)
--
-- NOTE on the `call_surveys` table: it exists only on the unmerged `claude/robin-survey` branch,
-- its columns encode an OLDER survey (understood / fcr / callback_consent), and its read endpoint
-- `api/surveys.js` selects `fcr`, which migration 008 dropped. Do not revive it for this wave.


-- ---------------------------------------------------------------------------------------------
-- TWO views, defined ONCE in supabase/migrations/009_survey_person_dedup.sql and already applied:
--   survey_people   one row per RESPONDENT (one caller as one member), their first surveyed call
--                   under that persona. Quote decisions from here.
--   survey_answers  one row per CALL. Use it for adherence, for ALL free text, and for repeats.
--
-- A respondent is caller ID plus the member they verified as (migration 011), so one tester
-- exercising several personas is several respondents on purpose - they had several distinct
-- experiences. caller_key counts distinct handsets alongside it. Neither exposes a phone number.
--
-- Free text is the exception to "quote from survey_people": that view keeps only a first call, so
-- comments must be read from survey_answers or later ones vanish.
--
-- It is deliberately not redefined here. An earlier version of this file carried its own copy of
-- the parsing and eligibility logic, which is the same trap that let the prompt gate and the
-- evaluation criterion drift apart for two versions during testing. One definition, one place.
-- The dashboard at /api/metrics reads the same view, so the SQL below and the page always agree.
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- 1. THE HEADLINE. Would they rather use Robin, or hold for a person?
--
-- `prefer_agent_raw` is free text on purpose — the caller's own words are auditable, a bare enum
-- is not. `preference` is the view's crude bucketing of it. Always read query 5 alongside this
-- before quoting a number, and hand-check anything in 'unclassified'.
-- ---------------------------------------------------------------------------------------------
select
  preference,
  count(*)                                                                  as n,
  round(100.0 * count(*) / sum(count(*)) over (), 1)                        as pct
from survey_people
where preference is not null
group by preference
order by n desc;


-- ---------------------------------------------------------------------------------------------
-- 2. Satisfaction, 1-5. `needs_hand_reading` counts answers given in words we could not score
--    ("pretty good"). Watch it: a rising count means the mean covers a shrinking slice of what
--    was actually said.
-- ---------------------------------------------------------------------------------------------
select
  count(*)                                            as answered,
  count(satisfaction_score)                           as parsed,
  count(*) - count(satisfaction_score)                as needs_hand_reading,
  round(avg(satisfaction_score), 2)                   as mean_score,
  count(*) filter (where satisfaction_score >= 4)     as four_or_five
from survey_people
where satisfaction_raw is not null;


-- ---------------------------------------------------------------------------------------------
-- 3. ADHERENCE — RUN THIS FIRST, AND EARLY. Did Robin actually ask when she was supposed to?
--
-- This is the number that decides whether the instrument worked, and the one a prompt-only design
-- puts at risk. If it is low, every figure above is drawn from a biased slice. Check it after the
-- first ~10 calls, not at the end of the wave.
--
-- The denominator comes from the agent's own evaluation criterion, not a rule re-derived here.
-- 'unknown' = the criterion ruled the call ineligible (transferred, failed verification, no real
-- exchange, caller in a hurry), so those are excluded rather than counted as misses.
-- ---------------------------------------------------------------------------------------------
select
  count(*) filter (where survey_verdict in ('success','failure'))          as eligible,
  count(*) filter (where survey_verdict = 'success')                      as asked_when_eligible,
  round(100.0 * count(*) filter (where survey_verdict = 'success')
        / nullif(count(*) filter (where survey_verdict in ('success','failure')), 0), 1)
                                                                          as adherence_pct,
  count(*) filter (where survey_verdict = 'unknown')                      as ineligible,
  count(*) filter (where survey_offered)                                  as offered,
  count(*) filter (where survey_consent = 'declined')                     as declined
from survey_answers
where in_survey_era;


-- ---------------------------------------------------------------------------------------------
-- 4. LEAK CHECK. Should return zero rows, always.
--
-- The pre-transfer survey was removed at prompt v6: she is instructed never to ask on the way into
-- a transfer. Anything here means the gate leaked and the old failure mode is back — offering two
-- questions and then cutting the caller off mid-answer. Listen to these calls.
-- ---------------------------------------------------------------------------------------------
select conversation_id, started_at, offer_context, survey_consent, prefer_agent_raw
from survey_answers
where in_survey_era and offer_context = 'pre_transfer'
order by started_at desc;


-- ---------------------------------------------------------------------------------------------
-- 5. Every answer, raw. Read this before quoting any number above.
--
-- Note the source: survey_answers, not survey_people. Counts are per person; WORDS ARE NOT.
-- survey_people keeps only a person's first surveyed call, so reading free text from it silently
-- drops anything said on a later call.
-- ---------------------------------------------------------------------------------------------
select
  started_at::date  as day,
  person_key,
  response_seq,
  conversation_id,
  satisfaction_raw,
  satisfaction_score,
  prefer_agent_raw,
  preference,
  would_recommend_raw,
  would_recommend,
  open_comments,
  comments_redacted
from survey_answers
where in_survey_era and survey_offered
order by started_at desc;


-- ---------------------------------------------------------------------------------------------
-- 6. REPEAT CALLERS AND CHANGED MINDS.
--
-- The single most interesting thing this instrument can produce, and the one a call-level average
-- destroys: somebody who wanted Robin on their first call and a human on their third, or the
-- reverse. Read those transcripts before quoting any headline.
-- ---------------------------------------------------------------------------------------------
select person_key, responses, changed_mind, first_at, preference as first_answer
from survey_people
where repeat_caller
order by changed_mind desc, responses desc;
