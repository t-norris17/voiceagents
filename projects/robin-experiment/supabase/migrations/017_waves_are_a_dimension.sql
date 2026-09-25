-- Waves become a dimension of every call, staff become a flag, and the live page does not change.
--
-- Until now experiment_waves held one row and worked as a cutoff: the survey views admitted calls on
-- or after the active wave's start. The Quality page is gaining a slicer (first wave, second wave,
-- internal testing, this week, a custom range), so a call needs to KNOW its wave rather than be
-- admitted or not by one. This migration:
--
--   1. Gives experiment_waves a display label and an `internal` flag, closes the first wave at
--      midnight Central after 2026-09-23, re-keys it 'first', and records the internal testing wave
--      (2026-09-08, the first surveyed call, to the first wave's start) as a wave of its own.
--   2. Redefines survey_wave_start() as the earliest NON-internal wave start, with no "active"
--      clause. Closing the first wave would otherwise reopen the survey era to every call since
--      September 8 on the live page. With this definition the live cutoff stays exactly where it
--      is, 2026-09-21 00:00 Central, until a slicer asks for something else.
--   3. Adds experiment_staff, the people who work on Robin and call her to check things. The
--      slicer hides their calls by default. Tanner's spelling of Steve's name (Castro-Miller) also
--      settles four transcriptions of it, so those become alias rows here.
--   4. Appends `wave` and `is_staff` to survey_answers, and `is_staff` and `wave` to survey_people.
--      Appended, so every existing column keeps its position and nothing reading the views by
--      name or by position changes.
--
-- Verified on apply: survey_wave_start() unchanged; survey_people and surveyed-call counts
-- unchanged with staff shown (30 / 61 on 2026-09-24); the four Steve spellings resolve to one
-- respondent flagged is_staff.

alter table public.experiment_waves add column if not exists label text;
alter table public.experiment_waves add column if not exists internal boolean not null default false;

update public.experiment_waves
   set wave = 'first',
       label = 'First wave',
       ended_at = ('2026-09-24 00:00:00'::timestamp at time zone 'America/Chicago'),
       note = 'Employee testers, Sep 21 to 23 2026, all verifying as Priya (90003). Closed at midnight Central after the 23rd.'
 where wave = 'customer';

insert into public.experiment_waves (wave, label, internal, started_at, ended_at, note) values
  ('internal', 'Internal testing', true,
   ('2026-09-08 00:00:00'::timestamp at time zone 'America/Chicago'),
   ('2026-09-21 00:00:00'::timestamp at time zone 'America/Chicago'),
   'The build team exercising the survey before the first wave. Two instruments: 1-5 satisfaction until Sep 10, 0-10 NPS after.')
on conflict (wave) do update
  set label = excluded.label, internal = excluded.internal,
      started_at = excluded.started_at, ended_at = excluded.ended_at, note = excluded.note;

comment on table public.experiment_waves is
  'One row per wave of the experiment. A call belongs to the wave whose [started_at, ended_at) contains it (survey_answers.wave), or to none. internal = the build team''s own testing; the survey era on the live page starts at the earliest non-internal wave (survey_wave_start()). To add a wave: insert a row. To close one: set ended_at. Nothing is deleted.';

-- The survey era: from the first non-internal wave onward. No "active" clause, so closing a wave
-- never widens the era. -infinity if no wave is defined, which shows everything (the pre-014 state).
create or replace function public.survey_wave_start() returns timestamptz
language sql stable as $$
  select coalesce(min(started_at), '-infinity'::timestamptz)
  from public.experiment_waves
  where not internal
$$;

create table if not exists public.experiment_staff (
  name_norm  text primary key,   -- survey_name_norm() of the name as it should appear
  display    text not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.experiment_staff enable row level security;
comment on table public.experiment_staff is
  'People who work on Robin and call her to check things. Matched by the normalised respondent name (after respondent_aliases), so add an alias first if the transcriber misheard them. The Quality page hides their calls unless asked.';

insert into public.experiment_staff (name_norm, display, note) values
  (public.survey_name_norm('Tanner Norris'),       'Tanner Norris',       'Builder.'),
  (public.survey_name_norm('Scott Farber'),        'Scott Farber',        'Per Tanner, 2026-09-24. Not yet heard by name.'),
  (public.survey_name_norm('Steve Castro-Miller'), 'Steve Castro-Miller', 'Per Tanner, 2026-09-24. Heard as Castro / Castrol / Kestrel / Cattrall Miller.')
on conflict (name_norm) do update set display = excluded.display, note = excluded.note;

insert into public.respondent_aliases (heard, canonical, note) values
  (public.survey_name_norm('Steve Castro Miller'),    'Steve Castro-Miller', 'Spelling from Tanner 2026-09-24; staff.'),
  (public.survey_name_norm('Steve Castrol Miller'),   'Steve Castro-Miller', 'Spelling from Tanner 2026-09-24; staff.'),
  (public.survey_name_norm('Steve Kestrel Miller'),   'Steve Castro-Miller', 'Spelling from Tanner 2026-09-24; staff.'),
  (public.survey_name_norm('Steve Cattrall Miller'),  'Steve Castro-Miller', 'Spelling from Tanner 2026-09-24; staff.')
on conflict (heard) do update set canonical = excluded.canonical, note = excluded.note;

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
    coalesce(c.canonical_name, a.name_for_identity) as respondent_name,
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
    )) as comments_redacted,
    -- The wave whose window holds the call; the latest-starting one if windows ever overlap.
    -- i.started_at, qualified: experiment_waves has a started_at of its own and a bare name would
    -- bind to it inside the subquery, making every call a member of every wave.
    (select w.wave from public.experiment_waves w
      where i.started_at >= w.started_at and (w.ended_at is null or i.started_at < w.ended_at)
      order by w.started_at desc limit 1) as wave,
    exists (select 1 from public.experiment_staff st
             where st.name_norm = public.survey_name_norm(i.respondent_name)) as is_staff
  from identified i
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
  respondent_name,
  wave,
  is_staff
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era = the survey fields are present AND started_at is on or after the first non-internal wave (survey_wave_start()); in_nps_era from the nps key. wave = the experiment_waves row whose window holds the call, or null. is_staff = the respondent is in experiment_staff. response_seq numbers a respondent''s surveyed calls inside the era. caller_key is the handset alone. person_key identifies a RESPONDENT = the person by the name they gave (migration 015); respondent_name is the name to show (aliases applied, fullest spelling); caller_name is the name as heard on that call. nps_score and voice_score are 0-10; nps_band applies the standard 0-6 / 7-8 / 9-10 split. satisfaction_* and would_recommend_* are RETIRED v1 columns. needs_review flags negative sentiment, an NPS detractor, or an old 1-5 rating of 2 or less. open_comments is PII-scrubbed.';

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
    (array_agg(respondent_name order by length(respondent_name) desc, started_at) filter (where respondent_name is not null))[1]
                                                as caller_name,
    bool_or(is_staff)                            as is_staff
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
  a.caller_name,
  a.is_staff,
  f.wave
from first_response f
join agg a using (person_key);

comment on view survey_people is
  'One row per RESPONDENT - the person by the name they gave Robin - being their FIRST surveyed call inside the survey era. caller_name is the name to show (respondent_aliases applied, fullest spelling). is_staff marks the build team; wave is the wave of that first call. The Quality page derives people per slice from survey_answers instead; this view serves the CSV and the Ask box.';
