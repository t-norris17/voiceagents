-- 021 spelled Rudisill's first name from Tanner's note ("Jonathon"); the roster says Jonathan.
-- Same rows, corrected canonical.

insert into public.respondent_aliases (heard, canonical, note) values
  (public.survey_name_norm('Jonathan Rudifield'),  'Jonathan Rudisill',  'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Jonathon Rudifield'),  'Jonathan Rudisill',  'Roster spelling, Tanner 2026-09-25.')
on conflict (heard) do update set canonical = excluded.canonical, note = excluded.note;
