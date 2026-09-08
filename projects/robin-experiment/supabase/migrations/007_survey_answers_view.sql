-- Survey answers, projected out of the frozen webhook payload. Applied 2026-09-08.
--
-- There is no survey table and there should not be one. postcall.js already stores the entire
-- ElevenLabs webhook event in ai_call_events.raw_payload, and every Data Collection field rides
-- along inside it, so this view IS the survey pipeline — no parser, no extra table, no deploy.
--
-- `in_survey_era` is derived rather than a hardcoded cutover date: a call is in the era iff its
-- data_collection_results carries the `survey_offered` key at all. The 56 calls that completed
-- before the fields existed lack the key entirely, so they drop out of every denominator on their
-- own and nothing needs maintaining when the survey comes off.
--
-- Adherence is NOT re-derived here. `survey_verdict` is the agent's own evaluation criterion
-- (success / failure / unknown), where unknown means it ruled the call ineligible — transferred,
-- failed verification, no substantive exchange, caller in a hurry. Only success+failure form the
-- adherence denominator. Encoding eligibility a second time in SQL is exactly how the prompt gate
-- and the criterion drifted apart during testing; one source of truth, deliberately.
--
-- TEMPORARY: drop this view when the survey is removed after the customer wave.
create or replace view survey_answers as
with base as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    raw_payload -> 'data' -> 'analysis' -> 'data_collection_results'     as dc,
    raw_payload -> 'data' -> 'analysis' -> 'evaluation_criteria_results' as ev
  from ai_call_events
  where provider = 'elevenlabs'
),
flat as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    (dc ? 'survey_offered')                                as in_survey_era,
    (dc -> 'survey_offered' ->> 'value')::boolean          as survey_offered,
     dc -> 'survey_consent' ->> 'value'                    as survey_consent,
     dc -> 'offer_context'  ->> 'value'                    as offer_context,
     nullif(btrim(dc -> 'satisfaction' ->> 'value'), '')   as satisfaction_raw,
     nullif(btrim(dc -> 'prefer_agent' ->> 'value'), '')   as prefer_agent_raw,
     ev -> 'survey_asked_when_eligible' ->> 'result'       as survey_verdict
  from base
)
select
  *,
  -- 1-5 out of free text ("five", "4 out of 5"). Anything outside 1-5 stays null rather than being
  -- clamped: a "7" means the question was misheard, and inventing a 5 from it inflates the score.
  case
    when satisfaction_raw is null                then null
    when satisfaction_raw ~ '[1-5]'              then (regexp_match(satisfaction_raw, '([1-5])'))[1]::int
    when satisfaction_raw ~* '\mone\M'           then 1
    when satisfaction_raw ~* '\mtwo\M'           then 2
    when satisfaction_raw ~* '\mthree\M'         then 3
    when satisfaction_raw ~* '\mfour\M'          then 4
    when satisfaction_raw ~* '\mfive\M'          then 5
  end as satisfaction_score,
  -- Crude bucketing of a deliberately free-text answer. Order matters: a person-answer often
  -- contains a you-word ("I'd rather a person than you"), so person is tested before agent, and
  -- "either" wins over both. 'unclassified' stays visible rather than being folded into a bucket —
  -- a growing unclassified count means the wording needs a human read.
  case
    when prefer_agent_raw is null then null
    when prefer_agent_raw ~* '(either|no preference|dou?n.?t mind|doesn.?t matter|whatever|both)' then 'no_preference'
    when prefer_agent_raw ~* '(person|human|someone|somebody|real|rep|live|wait|hold)'            then 'person'
    when prefer_agent_raw ~* '(you|this|robin|assistant|automated|\mai\M|again|quicker|faster)'   then 'agent'
    else 'unclassified'
  end as preference
from flat;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload. in_survey_era is derived from the presence of the survey_offered key, so pre-survey calls exclude themselves without a hardcoded cutover date. survey_verdict is the agent evaluation criterion''s own success/failure/unknown; unknown = ineligible.';
