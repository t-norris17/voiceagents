-- Follow-up to 015, applied the same day. 015 merged "Katie Rubless" into Adie Robles for identity
-- but survey_people still labelled her "Katie Rubless": the label was the longest caller_name as
-- HEARD, and the alias only ever reached person_key. So the name a reader sees is now a column of
-- its own, respondent_name: the alias-resolved canonical name of the person on that call, the same
-- string for every call that 015 groups together. survey_people labels from it, and so does the
-- broker (respondentLabels in broker/lib/survey-data.js). caller_name stays the name as heard.
--
-- Postgres lets create or replace view append a column, so respondent_name is added at the end
-- and every existing column keeps its position.

create or replace view survey_answers as
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
    caller_number, persona_ref,
    case when caller_number is null then null
         else 'C-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8) end as caller_key,
    ((dc ? 'survey_offered') and started_at >= public.survey_wave_start()) as in_survey_era,
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
     nullif(btrim(dc -> 'satisfaction'      ->> 'value'), '')  as satisfaction_raw,
     nullif(btrim(dc -> 'would_recommend'   ->> 'value'), '')  as would_recommend_raw,
     nullif(btrim(dc -> 'caller_name'       ->> 'value'), '')  as caller_name,
     ev -> 'survey_asked_when_eligible' ->> 'result'           as survey_verdict
  from base
),
-- IDENTITY, unchanged from 015. A person is the name they gave Robin. The phone number is used for
-- one thing: deciding that two SPELLINGS heard on the same phone are the same person (first or
-- last name within an edit distance of 2). respondent_aliases corrects what no rule gets right.
named as (
  select f.*,
    coalesce(al.canonical, f.caller_name) as name_for_identity,
    public.survey_name_norm(coalesce(al.canonical, f.caller_name)) as name_norm
  from flat f
  left join public.respondent_aliases al on al.heard = public.survey_name_norm(f.caller_name)
),
parts as (
  select *,
    split_part(name_norm, ' ', 1) as fn,
    case when position(' ' in name_norm) > 0 then regexp_replace(name_norm, '^.* ', '') else '' end as ln
  from named
),
anchored as (
  select a.*,
    case when a.name_norm is null then null else (
      select min(b.started_at) from parts b
      where b.caller_number is not distinct from a.caller_number and b.name_norm is not null
        and (levenshtein(b.fn, a.fn) <= 2 or (a.ln <> '' and b.ln <> '' and levenshtein(b.ln, a.ln) <= 2))
    ) end as anchor_at
  from parts a
),
canon as (
  select caller_number, anchor_at,
    (array_agg(name_for_identity order by length(name_for_identity) desc, started_at))[1] as canonical_name
  from anchored where anchor_at is not null
  group by caller_number, anchor_at
),
identified as (
  select a.*,
    c.canonical_name,
    case
      when c.canonical_name is not null
        then 'P-' || substr(md5('robin-survey-v2|' || public.survey_name_norm(c.canonical_name)), 1, 8)
      when a.caller_number is null then null
      when a.persona_ref is null
        then 'P-' || substr(md5('robin-survey-v1|' || a.caller_number), 1, 8)
      else 'P-' || substr(md5('robin-survey-v1|' || a.caller_number || '|' || a.persona_ref), 1, 8)
    end as person_key
  from anchored a
  left join canon c on c.caller_number is not distinct from a.caller_number and c.anchor_at = a.anchor_at
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
  from identified
)
select
  conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
  caller_key, person_key,
  case when survey_offered and in_survey_era then
    row_number() over (partition by person_key, survey_offered, in_survey_era order by started_at)
  end as response_seq,
  in_survey_era, in_nps_era, survey_offered, survey_consent, offer_context, survey_verdict,
  topic, plan_topic,
  prefer_agent_raw, preference,
  nps_raw, nps_score,
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
  coalesce(overall_sentiment = 'negative' or nps_score <= 6 or satisfaction_score <= 2, false)
    as needs_review,
  caller_name,
  -- The person's name as it should be shown: alias applied, fullest spelling on that phone.
  coalesce(canonical_name, name_for_identity) as respondent_name
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era = the survey fields are present AND started_at is on or after the active wave in experiment_waves (see survey_wave_start()); in_nps_era from the nps key. response_seq numbers a respondent''s surveyed calls inside the wave. caller_key is the handset alone. person_key identifies a RESPONDENT = the person by the name they gave (see migration 015: same-phone spellings within edit distance 2 merge; respondent_aliases corrects the rest); calls with no name keep the phone + persona key. caller_name is the name as heard on that call; respondent_name is the name to show (alias applied, fullest spelling). nps_score and voice_score are 0-10; nps_band applies the standard 0-6 / 7-8 / 9-10 split. satisfaction_* and would_recommend_* are RETIRED v1 columns. needs_review flags negative sentiment, an NPS detractor, or an old 1-5 rating of 2 or less. open_comments is PII-scrubbed.';

create or replace view survey_people as
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
    bool_or(needs_review)                        as any_needs_review,
    -- The name to show: alias applied, fullest spelling across the person's calls.
    (array_agg(respondent_name order by length(respondent_name) desc, started_at) filter (where respondent_name is not null))[1]
                                                as caller_name
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
  f.would_recommend,
  a.caller_name
from first_response f
join agg a using (person_key);

comment on view survey_people is
  'One row per RESPONDENT - the person by the name they gave Robin - being their FIRST surveyed call inside the active wave. caller_name is the name to show for them (respondent_aliases applied, fullest spelling across their wave calls). Quote figures from here, not from survey_answers, which counts calls.';
