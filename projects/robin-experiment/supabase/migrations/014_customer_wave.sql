-- The customer wave. Applied 2026-09-20.
--
-- Until now the survey selected its own calls: a call was "in the survey" if Robin's post-call
-- payload carried the survey fields. That was right for one continuous testing period and wrong for
-- the thing the Quality page is for tomorrow: showing leadership ONLY what the 25 test participants
-- said. Nothing is deleted. The 52 testing-wave calls stay in ai_call_events, the grader's rows stay
-- attached to them, and clearing this table's row shows them on the page again.
--
-- The seam that makes a plain date filter wrong: a respondent is a person's FIRST surveyed call.
-- Filter after the fact and an internal tester who called during testing has a first call the page
-- hides and a second call that never counts. So the wave start is applied INSIDE the view, and the
-- per-person call numbering restarts inside the wave.
--
-- caller_name: Robin asks for the full name in her first sentence; the new Data Collection field of
-- that name (added in the dashboard, not here) captures it after each call. Null until it exists.

create table if not exists public.experiment_waves (
  wave       text primary key,
  started_at timestamptz not null,
  ended_at   timestamptz,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.experiment_waves enable row level security;
comment on table public.experiment_waves is
  'Which calls the survey counts. The active wave (ended_at null) sets the earliest started_at the survey views admit. Move started_at to move the cutoff; delete the row to show everything again. Calls and the grader are not affected.';

insert into public.experiment_waves (wave, started_at, note) values
  ('customer',
   ('2026-09-21 00:00:00'::timestamp at time zone 'America/Chicago'),
   '25-tester loan wave. Everything before midnight Central on 2026-09-21 is the internal testing wave.')
on conflict (wave) do update set started_at = excluded.started_at, note = excluded.note;

-- The cutoff as one function so the view reads one place. -infinity when no wave is active, which
-- is the pre-wave behaviour exactly.
create or replace function public.survey_wave_start() returns timestamptz
language sql stable as $$
  select coalesce(min(started_at), '-infinity'::timestamptz)
  from public.experiment_waves
  where ended_at is null or ended_at > now()
$$;

-- Same view as migration 012 with three changes: in_survey_era also requires started_at on or after
-- the wave start; response_seq restarts inside the wave; caller_name is appended (last, so
-- create-or-replace keeps survey_people valid).
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
    case when caller_number is null then null
         else 'C-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8) end as caller_key,
    case when caller_number is null then null
         when persona_ref is null
           then 'P-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8)
         else 'P-' || substr(md5('robin-survey-v1|' || caller_number || '|' || persona_ref), 1, 8)
    end as person_key,
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
  caller_name
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era = the survey fields are present AND started_at is on or after the active wave in experiment_waves (see survey_wave_start()); in_nps_era from the nps key. response_seq numbers a respondent''s surveyed calls inside the wave. person_key identifies a RESPONDENT = one caller as one member (hashed caller ID + subject_ref); caller_key is the handset alone. caller_name is the full name the caller gave, from the caller_name Data Collection field; null before that field existed. nps_score and voice_score are 0-10; nps_band applies the standard 0-6 / 7-8 / 9-10 split. satisfaction_* and would_recommend_* are RETIRED v1 columns. needs_review flags negative sentiment, an NPS detractor, or an old 1-5 rating of 2 or less. open_comments is PII-scrubbed.';

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
    -- The name as most recently given, so a first-call mishearing is corrected by a later call.
    (array_agg(caller_name order by started_at desc) filter (where caller_name is not null))[1]
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
  'One row per RESPONDENT - one caller as one member - being their FIRST surveyed call inside the active wave. A single tester exercising several personas is several respondents by design. caller_name is the name most recently given across their wave calls. Quote figures from here, not from survey_answers, which counts calls.';
