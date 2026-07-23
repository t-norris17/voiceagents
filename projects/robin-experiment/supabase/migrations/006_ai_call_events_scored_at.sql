alter table ai_call_events add column if not exists scored_at timestamptz;
comment on column ai_call_events.scored_at is 'When the grader last scored this call. Null = ungraded; the grader skips non-null rows unless a conversation_id is passed explicitly.';
