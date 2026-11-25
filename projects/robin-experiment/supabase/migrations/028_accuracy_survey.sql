-- 028: the wave 2 survey in survey_answers. Wave 2 (from 2026-12-10) tests Robin's ACCURACY, not
-- whether callers prefer her (Tanner, 2026-11-25: "we know they prefer Robin"). Its Data Collection
-- (robin_data_collection_fields.csv, the enterprise Robin) asks:
--   Q1 answered_fully          "Did I fully answer your question today?"  yes | partly | no   (NEW)
--   Q2 ease_of_understanding   "Zero to ten, how easy was I to understand?"                    (NEW)
--   Q3 nps                      unchanged name and scale
--   Q4 open_comments            unchanged
-- prefer_agent and voice_naturalness are retired (always empty), and offer_context gains a legitimate
-- 'pre_transfer' (surveyed before a hand-off), which wave 1 treated as a defect.
--
-- This appends five columns to survey_answers and changes nothing else:
--   in_accuracy_era      the call's Data Collection carries answered_fully: the wave 2 instrument.
--                        Detected by the field, like in_nps_era, not by date.
--   answered_fully_raw   the caller's answer as recorded
--   answered_fully       'yes' | 'partly' | 'no' | 'unclear' (null when not asked)
--   ease_raw             the caller's 0-10 answer as recorded
--   ease_score           0-10, parsed exactly like nps_score (parse_survey_0_10)
--
-- HOW: the view is long and every stage lists its columns, so instead of restating it by hand (and
-- risking a changed column wave 1 depends on), the DO block reads the LIVE definition, appends the five
-- columns to its final SELECT, and re-creates it. It refuses to run unless the definition ends exactly
-- as it did when this was written (`is_staff` then `FROM scored;`). survey_people is untouched: it
-- selected its own column list at creation and does not gain these.

create or replace function public.survey_dc(p_conversation_id text) returns jsonb
language sql stable set search_path = '' as $$
  select e.raw_payload -> 'data' -> 'analysis' -> 'data_collection_results'
  from public.ai_call_events e
  where e.provider = 'elevenlabs' and e.conversation_id = p_conversation_id
  limit 1
$$;

create or replace function public.survey_dc_text(p_conversation_id text, p_key text) returns text
language sql stable set search_path = '' as $$
  select nullif(btrim(public.survey_dc(p_conversation_id) -> p_key ->> 'value'), '')
$$;

-- The model is told to map the caller's words to yes | partly | no, so most values arrive as one of
-- those; the patterns catch the rest. "not fully" is partly, checked before the plain negatives.
create or replace function public.survey_answered_fully(raw text) returns text
language sql immutable set search_path = '' as $$
  select case
    when raw is null then null
    when raw ~* '(part|mostly|\msome\M|kind of|sort of|not (fully|completely|entirely|all))' then 'partly'
    when raw ~* '(\mno\M|\mnope\M|\mnot\M|did ?n.?t|\mwrong\M|\mnah\M)' then 'no'
    when raw ~* '(\myes\M|\myeah\M|\myep\M|fully|completely|totally|absolutely|definitely|\mall\M)' then 'yes'
    else 'unclear'
  end
$$;

do $$
declare
  d text := pg_get_viewdef('public.survey_answers'::regclass, true);
  tail constant text := E'    is_staff\n   FROM scored;';
begin
  if right(d, length(tail)) <> tail then
    raise exception 'survey_answers no longer ends with "is_staff FROM scored;": re-read it and update 028 before applying';
  end if;
  d := left(d, length(d) - length(tail)) || E'    is_staff,\n'
    || E'    public.survey_dc(conversation_id) ? ''answered_fully'' AS in_accuracy_era,\n'
    || E'    public.survey_dc_text(conversation_id, ''answered_fully'') AS answered_fully_raw,\n'
    || E'    public.survey_answered_fully(public.survey_dc_text(conversation_id, ''answered_fully'')) AS answered_fully,\n'
    || E'    public.survey_dc_text(conversation_id, ''ease_of_understanding'') AS ease_raw,\n'
    || E'    public.parse_survey_0_10(public.survey_dc_text(conversation_id, ''ease_of_understanding'')) AS ease_score\n'
    || E'   FROM scored;';
  execute 'create or replace view public.survey_answers as ' || d;
end $$;

comment on view public.survey_answers is
  'Survey answers projected from ai_call_events.raw_payload, one row per CALL. in_survey_era = the survey fields are present AND started_at is on or after the first non-internal wave (survey_wave_start()); in_nps_era from the nps key; in_accuracy_era from the answered_fully key (the wave 2 instrument, migration 028). wave = the experiment_waves row whose window holds the call, or null. is_staff = the respondent is in experiment_staff. response_seq numbers a respondent''s surveyed calls inside the era. person_key identifies a RESPONDENT = the person by the name they gave (migration 015); respondent_name is the name to show. nps_score, voice_score and ease_score are 0-10; nps_band applies the standard 0-6 / 7-8 / 9-10 split. answered_fully is yes | partly | no | unclear. prefer_agent_raw/preference and voice_* are not asked from wave 2 on; satisfaction_* and would_recommend_* are RETIRED v1 columns. needs_review flags negative sentiment, an NPS detractor, or an old 1-5 rating of 2 or less. open_comments is PII-scrubbed.';
