-- changed_mind must mean "changed their mind", not "we failed to parse them".
--
-- THE BUG: 009 computed it as
--     count(distinct preference) filter (where preference is not null) > 1
-- and `preference` has FOUR values, not three — the fourth is 'unclassified', which is the view's
-- own admission that it could not bucket what the caller said. So a tester who answered "I'd rather
-- do it with you" on call one and something the regex missed on call two was reported as having
-- CHANGED THEIR MIND. Same opinion, different wording, presented as a reversal.
--
-- That number is not a footnote: the dashboard prints it in an alert tile and tells the reader it
-- is "the one thing an average cannot show you", pointing them at the transcripts. A false positive
-- there sends leadership chasing a reversal that never happened, and the transcript they open
-- disproves the dashboard in front of them.
--
-- THE FIX: count only the three real buckets. An unparsed answer moves nothing, in either
-- direction — it cannot create a change of mind, and it cannot hide one either, because a genuine
-- agent -> person flip still shows two real buckets.
--
-- Verified against a simulated pair before applying: same-opinion-different-wording now reads
-- false where it read true, and a genuine agent -> person flip still reads true.
--
-- create or replace is safe here: column names, order and types are unchanged.
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
    -- 'unclassified' deliberately excluded — see the note above.
    count(distinct preference)
      filter (where preference in ('agent','person','no_preference'))  as distinct_preferences
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
  'One row per person: their FIRST surveyed call, plus how many times they called and whether their stated preference genuinely differed across calls. changed_mind counts only agent/person/no_preference — an ''unclassified'' answer is a parse failure, not a reversal. Quote decision numbers from here, not from survey_answers, which counts calls. NOTE: read free text (open_comments) from survey_answers, not from here — this view keeps only a person''s FIRST call, so a comment left on a later call is not in it.';
