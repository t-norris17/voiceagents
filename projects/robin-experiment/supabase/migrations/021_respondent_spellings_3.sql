-- Roster spellings from Tanner, 2026-09-25, second batch. Data only: rows in respondent_aliases,
-- which the survey views apply before grouping (migration 015). Every spelling the transcriber
-- produced for each person is listed, so the person stays one person under the roster name.
-- "Kissy Goss" already collapsed into Casey Goss by the same-phone rule; it is re-pointed here so
-- the alias table says the same thing the roster does.

insert into public.respondent_aliases (heard, canonical, note) values
  (public.survey_name_norm('Michelle Agson'),      'Michelle Aggson',    'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Jacob Horse'),         'Jacob Horsch',       'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Brian Petrie'),        'Brian Petri',        'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Jonathan Rudifield'),  'Jonathon Rudisill',  'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Jonathon Rudifield'),  'Jonathon Rudisill',  'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Casey Goss'),          'Kacey Goss',         'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Kissy Goss'),          'Kacey Goss',         'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Lynn Kesterson'),      'Carin Kesterson',    'Roster spelling, Tanner 2026-09-25.'),
  (public.survey_name_norm('Kelly Benjamin'),      'Kelli Benjamin',     'Roster spelling, Tanner 2026-09-25.')
on conflict (heard) do update set canonical = excluded.canonical, note = excluded.note;
