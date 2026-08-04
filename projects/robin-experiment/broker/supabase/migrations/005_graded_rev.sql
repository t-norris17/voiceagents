-- Which generation of the grader scored this call?
--
-- The re-grade path selected calls with `accuracy_score is null`, on the assumption that a null
-- means "not yet checked against a source". It doesn't. A call where the caller asked nothing —
-- an auth failure, a straight transfer, a wrong number — has no answers to check, so its accuracy
-- is legitimately null and stays null however many times it is re-graded. 11 of this project's
-- first 39 calls are that shape.
--
-- Selecting on null therefore never terminates: those calls are picked again every round, pile up
-- at the head of the oldest-first queue, and once ten of them accumulate the loop re-grades the
-- same ten forever — at a model call apiece — while the calls behind them are never reached.
--
-- A version stamp is the honest marker. It records what it actually means ("this call was scored
-- by grader generation N"), it terminates because every graded call gets stamped whether or not it
-- produced a score, and it makes the next migration of the grader a one-line bump instead of
-- another bespoke backfill.
alter table ai_call_events add column if not exists graded_rev integer;

comment on column ai_call_events.graded_rev is
  'Generation of the grader that last scored this call. Bumped when grading semantics change; the re-grade path selects rows below the current revision, so it terminates even for calls that legitimately have no score. Null = graded before revisions were tracked.';

create index if not exists ai_call_events_graded_rev_idx on ai_call_events (graded_rev) where transcript is not null;
