-- Survey questions 3 (would recommend) and 4 (open comments). Applied 2026-09-08.
-- Supersedes 007 as the current definition of survey_answers.
--
-- Q4 is the ONLY free-text field in the instrument and the only one that can carry PII. An open
-- question in financial services invites account numbers, Social Security Numbers, and medical or
-- financial reasons for a hardship withdrawal. The scrub keeps the FACT that something was said
-- and drops the words: comments_redacted stays visible so the rate is auditable, while the text
-- never reaches a dashboard or a screenshot.
--
-- The scrub was wrong on its first pass and the tests caught it: \m is start-of-word in Postgres
-- and \M is end-of-word, and using \m for both boundaries meant none of the numeric patterns
-- anchored — a bare "my member id is 900031234" passed straight through. Verified against SSNs in
-- three spacings, bare 9+ digit runs, spaced and unspaced phone numbers, and card numbers.
--
-- TEMPORARY: drop this view when the survey is removed after the customer wave.
drop view if exists survey_answers;

create view survey_answers as
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
    (dc ? 'survey_offered')                                 as in_survey_era,
    (dc -> 'survey_offered' ->> 'value')::boolean           as survey_offered,
     dc -> 'survey_consent' ->> 'value'                     as survey_consent,
     dc -> 'offer_context'  ->> 'value'                     as offer_context,
     nullif(btrim(dc -> 'satisfaction'    ->> 'value'), '') as satisfaction_raw,
     nullif(btrim(dc -> 'prefer_agent'    ->> 'value'), '') as prefer_agent_raw,
     nullif(btrim(dc -> 'would_recommend' ->> 'value'), '') as would_recommend_raw,
     nullif(btrim(dc -> 'open_comments'   ->> 'value'), '') as open_comments_raw,
     ev -> 'survey_asked_when_eligible' ->> 'result'        as survey_verdict
  from base
),
scored as (
  select *,
    case
      when satisfaction_raw is null                then null
      when satisfaction_raw ~ '[1-5]'              then (regexp_match(satisfaction_raw, '([1-5])'))[1]::int
      when satisfaction_raw ~* '\mone\M'           then 1
      when satisfaction_raw ~* '\mtwo\M'           then 2
      when satisfaction_raw ~* '\mthree\M'         then 3
      when satisfaction_raw ~* '\mfour\M'          then 4
      when satisfaction_raw ~* '\mfive\M'          then 5
    end as satisfaction_score,
    case
      when prefer_agent_raw is null then null
      when prefer_agent_raw ~* '(either|no preference|dou?n.?t mind|doesn.?t matter|whatever|both)' then 'no_preference'
      when prefer_agent_raw ~* '(person|human|someone|somebody|real|rep|live|wait|hold)'            then 'person'
      when prefer_agent_raw ~* '(you|this|robin|assistant|automated|\mai\M|again|quicker|faster)'   then 'agent'
      else 'unclassified'
    end as preference,
    -- 'unclear' stays its own bucket rather than being folded into no — "I guess it depends" is
    -- not a refusal and must not be counted as one.
    case
      when would_recommend_raw is null then null
      when would_recommend_raw ~* '(\mnot\M|\mno\M|\mwould ?n.?t\M|\mnope\M|probably not|rather not)' then 'no'
      when would_recommend_raw ~* '(\myes\M|\myeah\M|\myep\M|\msure\M|absolutely|definitely|certainly|i would|for sure|of course)' then 'yes'
      else 'unclear'
    end as would_recommend,
    -- Errs toward redacting: losing a compliment costs nothing, storing a member's SSN costs a lot.
    (open_comments_raw is not null and (
          open_comments_raw ~ '\m\d{3}[-. ]?\d{2}[-. ]?\d{4}\M'      -- SSN, any spacing
       or open_comments_raw ~ '\m\d{7,}\M'                            -- account / member / phone runs
       or open_comments_raw ~ '\m\d{3}[-. ]\d{3}[-. ]\d{4}\M'         -- spaced phone number
       or open_comments_raw ~ '(\m\d{4}[-. ]){3}\d{4}\M'              -- card
       or open_comments_raw ~* '(social security|\mssn\M)'
    )) as comments_redacted
  from flat
)
select
  conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
  in_survey_era, survey_offered, survey_consent, offer_context, survey_verdict,
  satisfaction_raw, satisfaction_score,
  prefer_agent_raw, preference,
  would_recommend_raw, would_recommend,
  case when comments_redacted then null else left(open_comments_raw, 600) end as open_comments,
  comments_redacted
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload. in_survey_era is derived from the presence of the survey_offered key, so pre-survey calls exclude themselves without a hardcoded cutover date. survey_verdict is the agent evaluation criterion''s own success/failure/unknown; unknown = ineligible. open_comments is PII-scrubbed: null with comments_redacted=true means something was said and dropped.';
