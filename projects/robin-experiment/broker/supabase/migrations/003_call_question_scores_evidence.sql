-- The evidence behind each scored answer: every checkable claim with its verdict and the verbatim
-- source span that supports or contradicts it, plus the grader's three judgments in words. The
-- portal's Grade results render these; the score alone was a run-on sentence nobody could act on.
-- Additive and nullable. The grader writes it when the column exists and drops it when it does not.
alter table public.call_question_scores
  add column if not exists evidence jsonb;

comment on column public.call_question_scores.evidence is
  'Grader evidence: {claims:[{claim, source_quote, verdict}], answered_the_question, complete, appropriately_routed, note}. Verbatim source spans so a reader can check the verdict.';
