-- One more roster spelling from Tanner, 2026-09-25. Data only: a row in respondent_aliases, which
-- the survey views apply before grouping (migration 015). The transcriber heard "Carla Lechliter";
-- the roster says Karla Leckliter. One call, one person, no key changes.

insert into public.respondent_aliases (heard, canonical, note) values
  (public.survey_name_norm('Carla Lechliter'), 'Karla Leckliter', 'Roster spelling, Tanner 2026-09-25.')
on conflict (heard) do update set canonical = excluded.canonical, note = excluded.note;
