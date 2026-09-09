-- A respondent is a CALLER AS A MEMBER, not a caller.
--
-- WHY THIS CHANGED
-- 009 keyed a respondent on caller ID alone. That is right when 75 employees each call from their
-- own phone, and wrong for how this instrument is actually exercised: a small test group calls many
-- times, as many different personas, from the same handset. Under the old key all of it collapsed
-- into one respondent, and survey_people kept only that respondent's FIRST surveyed call.
--
-- The cost was not cosmetic. On 2026-09-09 a tester called as Dana, hit a question Robin could not
-- answer, and said "I would rather do it with you, but you're not able to help me, so I guess I'll
-- wait for a person." The row was classified correctly as a preference for a person. The headline
-- never saw it, because the same handset had already answered as Priya the day before. The
-- cross-tab showed a single dot for four calls, for the same reason.
--
-- THE UNIT THAT MATTERS
-- That tester preferred Robin for a balance check and a person for RMDs. Those are two findings,
-- not one opinion to be averaged. The experiment asks which way callers lean in a given situation,
-- so the unit is the caller in a situation: caller ID plus the member they verified as.
--
-- This does mean one human trying several personas counts several times. That is understood and
-- expected here — the wave is a small group calling many times across many personas — so both
-- figures are published side by side rather than one standing in for the other: caller_key counts
-- distinct handsets, person_key counts distinct caller-as-member respondents.
--
-- Neither key exposes anything: the phone number is hashed and never selected, and subject_ref is
-- already a synthetic identifier for a synthetic test member.
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
                                                                        as caller_number,
    nullif(btrim(subject_ref), '')                                      as persona_ref
  from ai_call_events
  where provider = 'elevenlabs'
),
flat as (
  select
    conversation_id, started_at, duration_seconds, outcome, auth_outcome, overall_sentiment,
    -- The handset. Published so "N responses from M callers" can be stated without ever holding
    -- the number itself outside this view.
    case when caller_number is null then null
         else 'C-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8) end as caller_key,
    -- The respondent: this caller, as this member. Falls back to the caller alone when no member
    -- was verified, so an unverified call still groups sensibly rather than becoming its own
    -- respondent every time.
    case when caller_number is null then null
         when persona_ref is null
           then 'P-' || substr(md5('robin-survey-v1|' || caller_number), 1, 8)
         else 'P-' || substr(md5('robin-survey-v1|' || caller_number || '|' || persona_ref), 1, 8)
    end as person_key,
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
  in_survey_era, survey_offered, survey_consent, offer_context, survey_verdict,
  topic, plan_topic,
  satisfaction_raw, satisfaction_score,
  prefer_agent_raw, preference,
  would_recommend_raw, would_recommend,
  case when comments_redacted then null else left(open_comments_raw, 600) end as open_comments,
  comments_redacted,
  -- Worth a human listening to. Sentiment comes from the post-call analysis, so this catches a call
  -- the caller was unhappy with even when they still rated it politely — which is exactly what
  -- happened on the Dana call: a 3, a negative read, and a complaint about Robin remarking on the
  -- member's age.
  (overall_sentiment = 'negative' or satisfaction_score <= 2) as needs_review
from scored;

comment on view survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era is derived from the presence of the survey_offered key, so pre-survey calls exclude themselves without a hardcoded cutover date. person_key identifies a RESPONDENT = one caller as one member (hashed caller ID + subject_ref); caller_key is the handset alone, so "N responses from M callers" can be stated without holding a phone number. response_seq is 1 for a respondent''s first surveyed call. needs_review flags negative sentiment or a rating of 2 or less. open_comments is PII-scrubbed: null with comments_redacted=true means something was said and dropped.';

-- One row per RESPONDENT (caller as member). This is what figures are quoted from.
--
-- The response of record is their FIRST surveyed call under that persona. A second call as the same
-- persona measures a different thing - how someone feels once they already know how Robin works -
-- and averaging the two buries it. changed_mind exposes it instead, counting only the three real
-- preference buckets: 'unclassified' is a parse failure, not a reversal.
--
-- NOTE: read free text (open_comments) from survey_answers, not from here. This view keeps only a
-- respondent's first call, so a comment left on a later call is not in it.
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
  a.any_needs_review             as needs_review,
  a.first_at,
  a.last_at,
  f.conversation_id,
  f.started_at,
  f.duration_seconds,
  f.overall_sentiment,
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
  'One row per RESPONDENT - one caller as one member - being their FIRST surveyed call under that persona, plus how many times they called and whether their stated preference genuinely differed. A single tester exercising several personas is several respondents by design: they had several distinct experiences, and averaging them destroys the finding. caller_key is carried through so responses and distinct callers can both be reported. Quote figures from here, not from survey_answers, which counts calls.';
