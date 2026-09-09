-- Person-level dedup for the survey. Supersedes 008 as the current definition of survey_answers,
-- and adds survey_people on top of it.
--
-- WHY THIS EXISTS
-- The instrument's claim is about PEOPLE ("would callers rather use Robin"), but every number on
-- the dashboard counted CALLS. With 50-75 testers making 2-3 calls each that reports n=180 for
-- an opinion pool of 75, and the first person in the room who notices costs you the whole result.
-- README.md said "count one response per person, not per call" from the start; this is that rule
-- moved out of a doc and into the data.
--
-- HOW A PERSON IS IDENTIFIED
-- raw_payload -> data -> metadata -> phone_call -> external_number, the caller ID, present on all
-- 59 rows to date. It is hashed here and the raw number is NEVER selected by this view, so it
-- cannot reach /api/metrics, the CSV export, the page, or a screenshot of the page.
--
-- The salt is not a secret from anyone who can already read this database — the raw numbers are
-- sitting in raw_payload today. It exists so that the person_key published through the API is not
-- a bare md5 of a phone number, which is reversible in seconds against a 10-digit keyspace.
--
-- Known limit, worth saying out loud before quoting a person count: two testers sharing a desk
-- phone read as one person, and one tester calling from both a desk phone and a cell reads as two.
-- Neither is fixable without asking callers for an identifier, which costs response rate.
--
-- TEMPORARY: drop both views when the survey is removed after the customer wave.

drop view if exists survey_people;
drop view if exists survey_answers;

create view survey_answers as
with base as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    raw_payload -> 'data' -> 'analysis' -> 'data_collection_results'     as dc,
    raw_payload -> 'data' -> 'analysis' -> 'evaluation_criteria_results' as ev,
    nullif(btrim(raw_payload -> 'data' -> 'metadata' -> 'phone_call' ->> 'external_number'), '')
                                                                        as caller_number
  from ai_call_events
  where provider = 'elevenlabs'
),
flat as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    -- Hashed here and never selected raw. 8 hex chars is 4 billion buckets: collision odds across
    -- a 75-person wave are about one in fifty million, and it stays short enough to read on screen.
    case when caller_number is null then null
         else 'P-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8) end as person_key,
    (dc ? 'survey_offered')                                 as in_survey_era,
    (dc -> 'survey_offered' ->> 'value')::boolean           as survey_offered,
     dc -> 'survey_consent' ->> 'value'                     as survey_consent,
     dc -> 'offer_context'  ->> 'value'                     as offer_context,
     nullif(btrim(dc -> 'topic'           ->> 'value'), '') as topic,
     nullif(btrim(dc -> 'plan_topic'      ->> 'value'), '') as plan_topic,
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
  person_key,
  case when survey_offered then
    row_number() over (partition by person_key, survey_offered order by started_at)
  end as response_seq,
  in_survey_era, survey_offered, survey_consent, offer_context, survey_verdict,
  topic, plan_topic,
  satisfaction_raw, satisfaction_score,
  prefer_agent_raw, preference,
  would_recommend_raw, would_recommend,
  case when comments_redacted then null else left(open_comments_raw, 600) end as open_comments,
  comments_redacted
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era is derived from the presence of the survey_offered key, so pre-survey calls exclude themselves without a hardcoded cutover date. person_key is a salted hash of caller ID — the raw number is never selected. response_seq is 1 for a person''s first surveyed call. survey_verdict is the agent evaluation criterion''s own success/failure/unknown; unknown = ineligible. open_comments is PII-scrubbed: null with comments_redacted=true means something was said and dropped. Read survey_people for the per-person figures a decision should be quoted from.';

-- One row per PERSON. This is what leadership numbers are quoted from.
--
-- The response of record is a person's FIRST surveyed call. A second call measures a different
-- thing — how someone feels once they already know how Robin works — and averaging the two buries
-- that difference. changed_mind exposes it instead: it is the most interesting single fact this
-- instrument can produce, and it is invisible in a call-level average.
create view survey_people as
with surveyed as (
  select * from survey_answers where in_survey_era and survey_offered and person_key is not null
),
first_response as (
  select distinct on (person_key) *
  from surveyed
  order by person_key, started_at
),
agg as (
  select
    person_key,
    count(*)                                    as responses,
    min(started_at)                             as first_at,
    max(started_at)                             as last_at,
    count(distinct preference)
      filter (where preference is not null)     as distinct_preferences
  from surveyed
  group by person_key
)
select
  f.person_key,
  a.responses,
  a.responses > 1                as repeat_caller,
  a.distinct_preferences > 1     as changed_mind,
  a.first_at,
  a.last_at,
  f.conversation_id,
  f.started_at,
  f.duration_seconds,
  f.topic,
  f.plan_topic,
  f.satisfaction_raw,
  f.satisfaction_score,
  f.prefer_agent_raw,
  f.preference,
  f.would_recommend_raw,
  f.would_recommend,
  f.open_comments,
  f.comments_redacted
from first_response f
join agg a using (person_key);

comment on view survey_people is
  'One row per person: their FIRST surveyed call, plus how many times they called and whether their stated preference differed across calls. Quote decision numbers from here, not from survey_answers — the latter counts calls, and 75 testers making 2-3 calls each is 75 opinions, not 180.';
