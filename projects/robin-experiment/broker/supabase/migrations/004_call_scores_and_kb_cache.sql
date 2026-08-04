-- Grade every call against the knowledge base Robin ACTUALLY has, and score the call as a call.
--
-- What this fixes, measured on the 39 calls in this project before the change:
--
--   38 of 39 calls retrieved something from the knowledge base.
--    3 of 39 could be graded against it.
--  100 of 108 graded answers came back `no_source` — and still averaged 4.24/5, because with no
--      source there are no claims, so there are no grounding deductions to take.
--
-- The cause: the grader resolved a retrieved `document_id` against our own `kb_articles` table,
-- which only holds documents WE published. Five documents carried essentially all the retrieval
-- traffic (30-37 calls each) and none of them were ours — they were uploaded straight into the
-- ElevenLabs dashboard. So the headline "and got it right: 4.2/5" was computed almost entirely
-- from answers that had never been checked against anything.
--
-- Two changes here:
--   1. kb_document_cache — our copy of any KB document text, fetched from the ElevenLabs API
--      (GET /v1/convai/knowledge-base/{id}/content) regardless of who uploaded it.
--   2. Call-level scores + a KB-answered flag, so the dashboard can report a score per call and a
--      utilization figure that means "answered out of the knowledge base", not "answered at all".

-- 1) Whatever Robin retrieved, we can now read.
create table if not exists kb_document_cache (
  document_id   text        primary key,          -- ElevenLabs KB document id
  name          text,
  body          text,                             -- full document text; null when the fetch failed
  chars         integer,
  source        text        not null default 'elevenlabs'
                  check (source in ('elevenlabs','kb_articles')),
  fetch_error   text,                             -- why we couldn't read it, if we couldn't
  fetched_at    timestamptz not null default now()
);

comment on table kb_document_cache is
  'Text of every ElevenLabs KB document the grader has needed, whoever uploaded it. Cached so a grading run costs one fetch per document, not one per call. A row with a null body and a fetch_error is a document we know about but could not read — visible, never silently skipped.';

create index if not exists kb_document_cache_fetched_idx on kb_document_cache (fetched_at desc);
alter table kb_document_cache enable row level security;

-- 2) A score for the call, not just for each question in it.
--    quality  = did she answer what was asked, completely, and hand off when she should have
--    accuracy = was what she said actually supported by the documents she read
--    They are separate because they fail separately: a confident wrong answer scores well on one
--    and badly on the other, and averaging them into one number hides exactly that case.
alter table ai_call_events add column if not exists quality_score    numeric;
alter table ai_call_events add column if not exists accuracy_score   numeric;
alter table ai_call_events add column if not exists kb_answered      boolean;
alter table ai_call_events add column if not exists questions_asked  integer;
alter table ai_call_events add column if not exists questions_kb     integer;

comment on column ai_call_events.quality_score   is 'Call-level 1-5: did she answer what was asked, completely, and route when she should have. Mean of the per-answer quality scores.';
comment on column ai_call_events.accuracy_score  is 'Call-level 1-5: was what she said supported by the documents she actually retrieved. Null when no answer on the call could be checked against a source.';
comment on column ai_call_events.kb_answered     is 'True when at least one answer on this call was grounded in a retrieved KB article. The numerator of utilization.';
comment on column ai_call_events.questions_asked is 'Plan questions the caller asked on this call (answered or not).';
comment on column ai_call_events.questions_kb    is 'How many of those were answered out of the knowledge base.';

-- Per-answer: was this specific answer grounded in a KB article? The column already exists on
-- call_questions but nothing was writing it.
comment on column call_questions.kb_grounded is
  'True when this question was answered with at least one claim supported by a retrieved KB document. Distinct from `answered`, which is only "she said something substantive".';

alter table call_question_scores add column if not exists kb_answered boolean;
comment on column call_question_scores.kb_answered is
  'True when a retrieved KB document supported at least one claim in this answer. Utilization counts these, not merely non-empty answers.';

-- 3) A fifth grounding verdict: `no_claims`.
--
-- "We could read her sources and she said nothing checkable" is not the same as "we checked her
-- and she was right", and it isn't `no_source` either. It's what an answer looks like when the
-- figure came from a tool (a balance), or when she correctly routed to a person. Folding it into
-- `grounded` overstates what was verified — the exact habit that let 100 unchecked answers report
-- an average of 4.24/5.
alter table call_question_scores drop constraint if exists call_question_scores_grounding_check;
alter table call_question_scores add constraint call_question_scores_grounding_check
  check (grounding is null or grounding in ('grounded','unsupported','contradicted','no_source','no_claims'));
