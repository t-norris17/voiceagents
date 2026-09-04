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
-- The view everything else reads. Create once.
-- ---------------------------------------------------------------------------------------------
create or replace view survey_answers as
select
  conversation_id,
  started_at,
  duration_seconds,
  (raw_payload -> 'data' -> 'analysis' -> 'data_collection_results') as dc,
  (raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'survey_offered' ->> 'value')::boolean
                                                                    as survey_offered,
   raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'survey_consent' ->> 'value'
                                                                    as survey_consent,
   raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'offer_context'  ->> 'value'
                                                                    as offer_context,
   raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'satisfaction'   ->> 'value'
                                                                    as satisfaction_raw,
   raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'prefer_agent'   ->> 'value'
                                                                    as prefer_agent_raw,
   raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'auth_outcome'   ->> 'value'
                                                                    as auth_outcome,
   raw_payload -> 'data' -> 'analysis' -> 'data_collection_results' -> 'outcome'        ->> 'value'
                                                                    as outcome
from ai_call_events
where provider = 'elevenlabs';


-- ---------------------------------------------------------------------------------------------
-- 1. THE HEADLINE. Would they rather use Robin, or hold for a person?
--
-- `prefer_agent` is free text on purpose — the caller's own words are auditable, a bare enum is
-- not. The bucketing below is deliberately crude; always read `prefer_agent_raw` alongside it
-- before quoting a number, and hand-check anything that lands in 'unclassified'.
-- ---------------------------------------------------------------------------------------------
with classified as (
  select
    prefer_agent_raw,
    case
      when prefer_agent_raw is null or btrim(prefer_agent_raw) = ''       then null
      when prefer_agent_raw ~* '(either|no preference|dou?n.?t mind|doesn.?t matter|whatever|both)'
                                                                          then 'no_preference'
      when prefer_agent_raw ~* '(person|human|someone|somebody|real|rep|live|wait|hold)'
                                                                          then 'person'
      when prefer_agent_raw ~* '(you|this|robin|assistant|automated|ai|again|quicker|faster)'
                                                                          then 'agent'
      else 'unclassified'
    end as preference
  from survey_answers
)
select
  preference,
  count(*)                                                  as n,
  round(100.0 * count(*) / sum(count(*)) over (), 1)        as pct
from classified
where preference is not null
group by preference
order by n desc;


-- ---------------------------------------------------------------------------------------------
-- 2. Satisfaction, 1-5. Also free text ("five", "4 out of 5", "pretty good"), so pull the digit
--    and keep the unparseable ones visible rather than dropping them silently.
-- ---------------------------------------------------------------------------------------------
with rated as (
  select
    satisfaction_raw,
    case
      when satisfaction_raw ~ '[1-5]'      then (regexp_match(satisfaction_raw, '([1-5])'))[1]::int
      when satisfaction_raw ~* '\mone\M'   then 1
      when satisfaction_raw ~* '\mtwo\M'   then 2
      when satisfaction_raw ~* '\mthree\M' then 3
      when satisfaction_raw ~* '\mfour\M'  then 4
      when satisfaction_raw ~* '\mfive\M'  then 5
    end as score
  from survey_answers
  where satisfaction_raw is not null and btrim(satisfaction_raw) <> ''
)
select
  count(*)                                        as answered,
  count(score)                                    as parsed,
  count(*) - count(score)                         as needs_hand_reading,
  round(avg(score), 2)                            as mean_score,
  count(*) filter (where score >= 4)              as four_or_five
from rated;


-- ---------------------------------------------------------------------------------------------
-- 3. ADHERENCE. Did Robin actually ask? This is the number that tells you whether the
--    instrument worked, and it is the one the prompt-only design puts at risk.
--    Denominator excludes calls the gate legitimately suppressed.
-- ---------------------------------------------------------------------------------------------
select
  count(*) filter (where survey_offered)                          as offered,
  count(*) filter (where survey_consent = 'accepted')             as accepted,
  count(*) filter (where survey_consent = 'declined')             as declined,
  count(*)                                                        as eligible_calls,
  round(100.0 * count(*) filter (where survey_offered) / nullif(count(*), 0), 1) as offer_rate_pct
from survey_answers
where auth_outcome is distinct from 'failed'
  and outcome is distinct from 'abandoned';


-- ---------------------------------------------------------------------------------------------
-- 4. Does the answer differ before a transfer vs. at the end of a resolved call?
--    This is the cut that matters most: someone about to be handed to a human is the
--    hardest audience for question two.
-- ---------------------------------------------------------------------------------------------
select
  offer_context,
  count(*)                                                     as n,
  count(*) filter (where prefer_agent_raw ~* '(person|human|wait|hold)') as chose_person,
  count(*) filter (where prefer_agent_raw ~* '(you|this|robin|again|faster|quicker)') as chose_robin
from survey_answers
where survey_consent = 'accepted'
group by offer_context
order by n desc;


-- ---------------------------------------------------------------------------------------------
-- 5. Every answer, raw. Read this before quoting any number above.
-- ---------------------------------------------------------------------------------------------
select
  started_at::date as day,
  conversation_id,
  offer_context,
  survey_consent,
  satisfaction_raw,
  prefer_agent_raw
from survey_answers
where survey_offered
order by started_at desc;
