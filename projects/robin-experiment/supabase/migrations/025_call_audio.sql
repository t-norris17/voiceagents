-- 025: call audio in Birdnest (robin-portal/audio/SPEC.md, revised 2026-10-07 for the shared password).
--
-- Additive only: one private Storage bucket and two new tables. Nothing existing is altered, and
-- nothing reads these until the broker's CALL_AUDIO_ENABLED switch is on.
--
-- The bucket is a CACHE. ElevenLabs keeps the recording; Birdnest keeps a copy only of calls someone
-- has played, and a daily sweep deletes copies nobody has played in 30 days.

-- Private: no storage.objects policy is created, so only the service role (the broker) can read or
-- write it. The browser plays from a short-lived signed URL the broker issues.
-- 50 MB is far above a 600 s call (the cap on Robin's calls) at any speech bitrate.
insert into storage.buckets (id, name, public, file_size_limit)
values ('call-audio', 'call-audio', false, 52428800);

-- One row per cached recording, so "what are we holding" and "what is idle" are one query each.
create table public.call_audio_cache (
  conversation_id text primary key,
  bytes           integer not null check (bytes > 0),
  content_type    text not null,
  fetched_at      timestamptz not null default now(),
  last_played_at  timestamptz not null default now()
);
create index call_audio_cache_idle on public.call_audio_cache (last_played_at);

-- Every play. The shared password cannot say who listened, so actor is 'birdnest', the same word the
-- request history uses. first_fetch marks the play that pulled the recording from ElevenLabs.
create table public.call_audio_listens (
  id              bigint generated always as identity primary key,
  conversation_id text not null,
  at              timestamptz not null default now(),
  actor           text not null,
  first_fetch     boolean not null default false
);
create index call_audio_listens_conversation on public.call_audio_listens (conversation_id, at);

-- The listen log is an audit trail: append-only for everyone, the service role included (RLS does
-- not bind the service role; a trigger does). Same pattern as service_request_events (023).
create function public.call_audio_listens_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'call_audio_listens is append-only (% refused)', tg_op;
end;
$$;

create trigger call_audio_listens_no_update_delete
  before update or delete on public.call_audio_listens
  for each row execute function public.call_audio_listens_append_only();

create trigger call_audio_listens_no_truncate
  before truncate on public.call_audio_listens
  for each statement execute function public.call_audio_listens_append_only();

alter table public.call_audio_cache enable row level security;
alter table public.call_audio_listens enable row level security;
