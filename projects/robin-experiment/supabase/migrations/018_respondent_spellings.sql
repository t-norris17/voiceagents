-- Spellings from Tanner's roster, 2026-09-24. Data only: rows in respondent_aliases, which the
-- survey views apply before grouping (migration 015), so each person's calls collapse under the
-- name their colleagues know them by. "Nick" on its own is not aliased; the same-phone rule already
-- merges it with the full spellings, and a bare first name is not safe to alias globally.

insert into public.respondent_aliases (heard, canonical, note) values
  (public.survey_name_norm('Cherie Ann Holbrook'),         'Sheree Holbrook',     'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Cherie Anne Holbrook'),        'Sheree Holbrook',     'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Nick Maziaski'),               'Nick Museousky',      'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Nick Mazioski'),               'Nick Museousky',      'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Robin Paff'),                  'Robert Pfaff',        'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Robin Path'),                  'Robert Pfaff',        'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Maddie Walton'),               'Maddie Bolton',       'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Jennifer Berdamati'),          'Jennifer Bertematti', 'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Jennifer Bertamani'),          'Jennifer Bertematti', 'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Ian Massey'),                  'Ian Burroughs',       'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Ian Matthew McCall Burrows'),  'Ian Burroughs',       'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Derek Paris'),                 'Derek Parris',        'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Colin Stevens'),               'Colin Stephens',      'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Collin Stevens'),              'Colin Stephens',      'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Colin James Stephens'),        'Colin Stephens',      'Roster spelling, Tanner 2026-09-24.'),
  (public.survey_name_norm('Ady Robles'),                  'Adie Robles',         'Spelling seen on her other calls; Katie Rubless already maps here (015).')
on conflict (heard) do update set canonical = excluded.canonical, note = excluded.note;
