-- Survey v2: NPS 0-10 and voice naturalness replace the 1-5 satisfaction rating.
--
-- WHY THIS CHANGED
-- The instrument now asks four questions in this order: the preference question (moved to FIRST, so
-- it survives a caller who stops part way and so nothing asked before it colours the answer), an NPS
-- 0-10, a voice-naturalness 0-10, and the open comment. The 1-5 satisfaction question and the yes/no
-- recommend question are retired.
--
-- The old columns are KEPT, not dropped. Four respondents answered under the old instrument before
-- the wave; their rows still carry satisfaction_raw and would_recommend and there is no reason to
-- destroy that. New rows simply leave them null, because the live Data Collection fields for both
-- are marked RETIRED and instructed to stay empty.
--
-- PARSING 0-10 IS NOT PARSING 1-5 WITH A BIGGER RANGE
-- Two hazards the old satisfaction parser never had to survive:
--   1. "10" is two digits. A naive first-digit match reads it as 1 — a promoter silently recorded as
--      a detractor, which is the worst single error this view could make.
--   2. Callers say the scale back: "eight out of ten", "8/10". Matching 10 first then reads that as
--      a 10. So the scale reference is stripped BEFORE any digit is matched.
-- parse_survey_0_10() below does both, and is shared by nps and voice_naturalness so the two can
-- never drift apart.
--
-- TEMPORARY: drop the views and this function when the survey is removed after the customer wave.

-- Shared so nps and voice_naturalness cannot diverge. IMMUTABLE: depends only on its input.
create or replace function parse_survey_0_10(raw text)
returns int
language sql
immutable
as $$
  with cleaned as (
    -- Strip the scale reference first: "8 out of 10", "8/10", "eight out of ten" must not match 10.
    select regexp_replace(coalesce(raw, ''), '\s*(/|\mout\s+of\M)\s*(10|ten)\M', ' ', 'gi') as t
  ),
  worded as (
    -- Number words become digits so the FIRST number spoken wins. A CASE ladder over the words
    -- cannot do this: it tests ten, then nine, then eight..., so "seven or eight" returns 8 and
    -- every hedged answer rounds UP. On an NPS that is a systematic inflation of the score.
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           regexp_replace(t,
             '\mten\M',  '10','gi'), '\mnine\M', '9','gi'), '\meight\M','8','gi'),
             '\mseven\M','7','gi'),  '\msix\M',  '6','gi'), '\mfive\M', '5','gi'),
             '\mfour\M', '4','gi'),  '\mthree\M','3','gi'), '\mtwo\M',  '2','gi'),
             '\mone\M',  '1','gi'),  '\mzero\M', '0','gi') as w
    from cleaned
  )
  -- Alternation puts 10 before [0-9] so a leading "10" is never truncated to 1.
  select case
    when raw is null or btrim(raw) = ''  then null
    when w ~ '\m(10|[0-9])\M'            then (regexp_match(w, '\m(10|[0-9])\M'))[1]::int
  end
  from worded;
$$;

comment on function parse_survey_0_10(text) is
  'Parse a spoken 0-10 answer. Strips the scale reference ("out of ten", "/10") so "eight out of ten" is 8, not 10; converts number words to digits and takes the FIRST number spoken, so "seven or eight" is 7 rather than rounding up; and matches two-digit 10 ahead of single digits so a promoter is never recorded as a 1. Returns null when nothing parseable was said. Verified against 23 spoken-answer cases.';

drop view if exists survey_people;
drop view if exists survey_answers;

create view survey_answers as
with base as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    raw_payload -> 'data' -> 'analysis' -> 'data_collection_results'     as dc,
    raw_payload -> 'data' -> 'analysis' -> 'evaluation_criteria_results' as ev,
    nullif(btrim(raw_payload -> 'data' -> 'metadata' -> 'phone_call' ->> 'external_number'), '')
                                                                        as caller_number,
    nullif(btrim(subject_ref), '')                                      as persona_ref
  from ai_call_events
  where provider = 'elevenlabs'
),
flat as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    case when caller_number is null then null
         else 'C-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8) end as caller_key,
    case when caller_number is null then null
         when persona_ref is null
           then 'P-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8)
         else 'P-' || substr(md5('robin-survey-v1|' || caller_number || '|' || persona_ref), 1, 8)
    end as person_key,
    (dc ? 'survey_offered')                                    as in_survey_era,
    -- v2 rows carry the nps key. Lets the page separate instruments without a hardcoded date, the
    -- same trick in_survey_era already uses for the pre-survey era.
    (dc ? 'nps')                                               as in_nps_era,
    (dc -> 'survey_offered' ->> 'value')::boolean              as survey_offered,
     dc -> 'survey_consent' ->> 'value'                        as survey_consent,
     dc -> 'offer_context'  ->> 'value'                        as offer_context,
     nullif(btrim(dc -> 'topic'             ->> 'value'), '')  as topic,
     nullif(btrim(dc -> 'plan_topic'        ->> 'value'), '')  as plan_topic,
     nullif(btrim(dc -> 'prefer_agent'      ->> 'value'), '')  as prefer_agent_raw,
     nullif(btrim(dc -> 'nps'               ->> 'value'), '')  as nps_raw,
     nullif(btrim(dc -> 'voice_naturalness' ->> 'value'), '')  as voice_raw,
     nullif(btrim(dc -> 'open_comments'     ->> 'value'), '')  as open_comments_raw,
    -- Retired in v2, retained so the four pre-wave respondents keep their answers.
     nullif(btrim(dc -> 'satisfaction'      ->> 'value'), '')  as satisfaction_raw,
     nullif(btrim(dc -> 'would_recommend'   ->> 'value'), '')  as would_recommend_raw,
     ev -> 'survey_asked_when_eligible' ->> 'result'           as survey_verdict
  from base
),
scored as (
  select *,
    parse_survey_0_10(nps_raw)   as nps_score,
    parse_survey_0_10(voice_raw) as voice_score,
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
    case
      when would_recommend_raw is null then null
      when would_recommend_raw ~* '(\mnot\M|\mno\M|\mwould ?n.?t\M|\mnope\M|probably not|rather not)' then 'no'
      when would_recommend_raw ~* '(\myes\M|\myeah\M|\myep\M|\msure\M|absolutely|definitely|certainly|i would|for sure|of course)' then 'yes'
      else 'unclear'
    end as would_recommend,
    (open_comments_raw is not null and (
          open_comments_raw ~ '\m\d{3}[-. ]?\d{2}[-. ]?\d{4}\M'
       or open_comments_raw ~ '\m\d{7,}\M'
       or open_comments_raw ~ '\m\d{3}[-. ]\d{3}[-. ]\d{4}\M'
       or open_comments_raw ~ '(\m\d{4}[-. ]){3}\d{4}\M'
       or open_comments_raw ~* '(social security|\mssn\M)'
    )) as comments_redacted
  from flat
)
select
  conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
  caller_key, person_key,
  case when survey_offered then
    row_number() over (partition by person_key, survey_offered order by started_at)
  end as response_seq,
  in_survey_era, in_nps_era, survey_offered, survey_consent, offer_context, survey_verdict,
  topic, plan_topic,
  prefer_agent_raw, preference,
  nps_raw, nps_score,
  -- Standard NPS bands. Named rather than left as a number so the page never has to re-derive them
  -- and get the boundaries wrong: 0-6 detractor, 7-8 passive, 9-10 promoter.
  case
    when nps_score is null then null
    when nps_score <= 6    then 'detractor'
    when nps_score <= 8    then 'passive'
    else                        'promoter'
  end as nps_band,
  voice_raw, voice_score,
  case when comments_redacted then null else left(open_comments_raw, 600) end as open_comments,
  comments_redacted,
  satisfaction_raw, satisfaction_score,
  would_recommend_raw, would_recommend,
  -- Worth a human listening to. Covers both instruments on purpose: an NPS detractor under v2, a
  -- 1-5 rating of 2 or less under v1, and negative post-call sentiment under either. Sentiment is
  -- what caught the Dana call, where the caller rated politely and was still unhappy.
  -- coalesce, because SQL three-valued logic makes this null rather than false on a clean call:
  -- 'positive'='negative' is false, but nps_score <= 6 with a null score is NULL, and false or null
  -- is null. A review flag must distinguish "no concern" from "unknown"; null reads as both.
  coalesce(overall_sentiment = 'negative' or nps_score <= 6 or satisfaction_score <= 2, false)
    as needs_review
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era is derived from the presence of the survey_offered key and in_nps_era from the nps key, so each instrument version selects itself without a hardcoded cutover date. person_key identifies a RESPONDENT = one caller as one member (hashed caller ID + subject_ref); caller_key is the handset alone. nps_score and voice_score are 0-10; nps_band applies the standard 0-6 / 7-8 / 9-10 split. satisfaction_* and would_recommend_* are RETIRED v1 columns, kept because four respondents answered under the old instrument. needs_review flags negative sentiment, an NPS detractor, or an old 1-5 rating of 2 or less. open_comments is PII-scrubbed: null with comments_redacted=true means something was said and dropped.';

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
      filter (where preference in ('agent','person','no_preference'))  as distinct_preferences,
    bool_or(needs_review)                        as any_needs_review
  from surveyed
  group by person_key
)
select
  f.person_key,
  f.caller_key,
  a.responses,
  a.responses > 1                as repeat_caller,
  a.distinct_preferences > 1     as changed_mind,
  coalesce(a.any_needs_review, false) as needs_review,
  a.first_at,
  a.last_at,
  f.conversation_id,
  f.started_at,
  f.duration_seconds,
  f.overall_sentiment,
  f.in_nps_era,
  f.topic,
  f.plan_topic,
  f.prefer_agent_raw,
  f.preference,
  f.nps_raw,
  f.nps_score,
  f.nps_band,
  f.voice_raw,
  f.voice_score,
  f.open_comments,
  f.comments_redacted,
  f.satisfaction_raw,
  f.satisfaction_score,
  f.would_recommend_raw,
  f.would_recommend
from first_response f
join agg a using (person_key);

comment on view survey_people is
  'One row per RESPONDENT - one caller as one member - being their FIRST surveyed call under that persona. A single tester exercising several personas is several respondents by design. in_nps_era says which instrument that respondent answered, so v1 and v2 answers are never averaged together. Quote figures from here, not from survey_answers, which counts calls. Read free text from survey_answers: this view keeps only a first call.';
