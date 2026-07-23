-- The ~25 curated questions = the experiment eval set (ground truth).
-- question_text is what a caller might ask; ideal_answer is the enrollment-guide-grounded
-- reference the grader scores Robin's actual answer against.
create table if not exists curated_questions (
  id             uuid primary key default gen_random_uuid(),
  question_key   text        not null unique,          -- e.g. 'loan_eligibility'
  category       text,                                 -- e.g. 'enrollment','loans','rollovers','balance'
  question_text  text        not null,
  ideal_answer   text,                                 -- ground truth from the enrollment guide
  active         boolean     not null default true,
  sort_order     integer,
  created_at     timestamptz not null default now()
);

create index if not exists curated_questions_active_idx on curated_questions (active, sort_order);

alter table curated_questions enable row level security;

comment on table curated_questions is 'The ~25 curated test questions with ideal answers. Eval set for grading Robin''s responses; also seeds dashboard columns.';
