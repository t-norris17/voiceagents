-- After-hours callback requests (Birdnest "Requests"). Spec: projects/robin-portal/requests/SPEC.md.
--
-- When the call center is closed, Robin files a callback request instead of transferring. The call
-- center works the queue in Birdnest the next business morning. Facts and workflow stay separate, as
-- gap_requests does for call_questions: the call itself stays in ai_call_events; the request and its
-- history live here.
--
-- Two writers, one key. file_request (mid-call tool) is the primary writer: it runs before the
-- conversation id is known to the broker, so its row starts with conversation_id null and the
-- post-call webhook links it from the transcript's tool result. If the caller hangs up before the tool
-- runs, the webhook inserts the row itself (source = 'postcall'). The unique key on conversation_id is
-- what stops the two from producing two rows for one call; Postgres allows many nulls under it.
--
-- Additive only: no existing table is touched. RLS on, no policies, the same posture as every table
-- here: only the broker's service role reads or writes.

create table public.service_requests (
  id                      uuid primary key default gen_random_uuid(),
  conversation_id         text unique,
  agent_id                text,
  source                  text not null check (source in ('tool', 'postcall')),
  request_type            text not null check (request_type in
                            ('loan', 'distribution', 'contribution_change', 'beneficiary',
                             'account_access', 'speak_to_person', 'other')),
  request_detail          text,
  -- members.id when the caller verified on this call, else null. Not a foreign key on purpose: a
  -- bad value from the model must not make the insert fail and leave Robin unable to file. The broker
  -- checks it against members before writing.
  subject_ref             text,
  verified                boolean not null default false,
  caller_name             text,
  callback_number         text,
  -- 'caller_id': the number the call came from (phone_call.external_number in the post-call payload).
  -- 'stated': a different number the caller asked to be called on.
  callback_number_source  text check (callback_number_source in ('caller_id', 'stated')),
  callback_window         text,
  -- The callback time the broker gave Robin to read ("by Monday, October 5 at 4 PM Central"). What she
  -- actually said is in the transcript.
  promised_text           text,
  filed_at                timestamptz not null default now(),
  -- Computed by the broker from lib/hours.js in both paths. Nothing the model passes sets it.
  due_at                  timestamptz not null,
  status                  text not null default 'open' check (status in ('open', 'closed')),
  closed_at               timestamptz,
  closed_by               text,
  -- True for rows filed by a test agent or a preview deployment. The queue and the morning email
  -- leave them out, so testing never puts a fake member in front of the call center.
  is_test                 boolean not null default false,
  constraint service_requests_closed_consistent
    check ((status = 'closed') = (closed_at is not null))
);

create index service_requests_open_due on public.service_requests (due_at) where status = 'open';
create index service_requests_filed_at on public.service_requests (filed_at desc);

create table public.service_request_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.service_requests (id) on delete restrict,
  at          timestamptz not null default now(),
  -- 'robin', 'system', or 'birdnest' (the shared-password portal cannot say which person).
  actor       text not null,
  kind        text not null check (kind in
                ('filed', 'linked', 'emailed', 'reached', 'voicemail', 'no_answer', 'note', 'closed', 'reopened')),
  note        text
);

create index service_request_events_request on public.service_request_events (request_id, at);

-- History is the audit trail, so it is append-only for everyone, the service role included (RLS does
-- not bind the service role; a trigger does).
create function public.service_request_events_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'service_request_events is append-only (% refused)', tg_op;
end;
$$;

create trigger service_request_events_no_update_delete
  before update or delete on public.service_request_events
  for each row execute function public.service_request_events_append_only();

create trigger service_request_events_no_truncate
  before truncate on public.service_request_events
  for each statement execute function public.service_request_events_append_only();

alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;

-- One action on a request, in one transaction: the history row and, for close and reopen, the status
-- change happen together or not at all. A request is never closed without its 'closed' event, and a
-- logged attempt never lands on a request that does not exist. Returns the request row.
-- Only the broker's service role may call it (functions are executable by PUBLIC by default).
create function public.service_request_act(p_id uuid, p_kind text, p_actor text, p_note text default null)
returns public.service_requests
language plpgsql set search_path = '' as $$
declare
  r public.service_requests;
begin
  select * into r from public.service_requests where id = p_id for update;
  if not found then
    raise exception 'service request % not found', p_id using errcode = 'P0002';
  end if;
  if p_kind = 'closed' then
    if r.status = 'closed' then return r; end if;
    update public.service_requests set status = 'closed', closed_at = now(), closed_by = p_actor
      where id = p_id returning * into r;
  elsif p_kind = 'reopened' then
    if r.status = 'open' then return r; end if;
    update public.service_requests set status = 'open', closed_at = null, closed_by = null
      where id = p_id returning * into r;
  elsif p_kind not in ('reached', 'voicemail', 'no_answer', 'note') then
    raise exception 'service_request_act: % is not an action a person takes', p_kind using errcode = '22023';
  end if;
  insert into public.service_request_events (request_id, actor, kind, note) values (p_id, p_actor, p_kind, p_note);
  return r;
end;
$$;

revoke execute on function public.service_request_act(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.service_request_act(uuid, text, text, text) to service_role;
