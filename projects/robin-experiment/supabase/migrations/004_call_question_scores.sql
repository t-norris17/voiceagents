-- Per-question grading for each call. This drives the experiment dashboard:
-- which curated question was asked, what Robin answered, its quality + sentiment,
-- and a human-review flag for the review queue.
create table if not exists call_question_scores (
  id               uuid primary key default gen_random_uuid(),

  conversation_id  text        not null,               -- links to ai_call_events.conversation_id
  question_key     text        references curated_questions (question_key),
  question_text    text,                               -- denormalized snapshot at grading time

  asked            boolean     not null default true,
  answer_text      text,                               -- what Robin actually answered

  -- quality
  quality_rating   text        check (quality_rating in ('good','partial','wrong','unrated'))
                      default 'unrated',
  quality_score    integer     check (quality_score between 1 and 5),

  -- sentiment
  sentiment        text        check (sentiment in ('positive','neutral','negative')),
  sentiment_score  numeric,                            -- -1.0 .. 1.0

  -- provenance + review queue
  graded_by        text        check (graded_by in ('llm','human')) default 'llm',
  reviewed         boolean     not null default false,
  reviewer_note    text,

  created_at       timestamptz not null default now()
);

create index if not exists cqs_conversation_idx on call_question_scores (conversation_id);
create index if not exists cqs_question_idx      on call_question_scores (question_key);
create index if not exists cqs_review_idx        on call_question_scores (reviewed) where reviewed = false;

alter table call_question_scores enable row level security;

comment on table call_question_scores is 'Per-question grading of each call: answer, quality, sentiment, human-review flag. Primary data source for the experiment dashboard.';
