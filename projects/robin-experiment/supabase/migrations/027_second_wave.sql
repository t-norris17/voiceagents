-- 027: declare the second wave of testing, from Monday 2026-12-07 (midnight Central), still open.
--
-- Wave 2 runs on a different Robin, in an enterprise ElevenLabs workspace, whose post-call webhook
-- points at the same broker. Its agent id comes in through the broker's ROBIN_AGENT_IDS setting, not
-- this migration. All wave 2 data is synthetic (Tanner, 2026-11-25).
--
-- A wave is a date window (migration 017): Quality slices by it, and since 2026-11-25 Interactions and
-- Requests filter by it too (broker lib/waves.js). Data only: one row, nothing altered.
--
-- APPLY AFTER the broker that defaults Quality to "All time" is in production. The broker before it
-- opens Quality on the newest non-internal wave, which would be this empty one until Dec 7.
-- survey_wave_start() (the earliest non-internal start) is unchanged: still the first wave's.
-- To close the wave later: update experiment_waves set ended_at = ... where wave = 'second'.

insert into public.experiment_waves (wave, label, internal, started_at, ended_at, note) values
  ('second', 'Second wave', false,
   ('2026-12-07 00:00:00'::timestamp at time zone 'America/Chicago'),
   null,
   'Synthetic testers on the enterprise Robin (separate number and ElevenLabs workspace). Open-ended until closed.')
on conflict (wave) do nothing;
