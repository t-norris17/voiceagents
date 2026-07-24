-- Idempotency for the grader (api/grade.js): one score row per (call, question).
-- Lets the grader upsert on_conflict=conversation_id,question_key instead of duplicating rows
-- when a call is re-graded. Applied to project rlhybqslnqhggbykjrqg.
alter table call_question_scores
  add constraint call_question_scores_conv_qkey_uniq unique (conversation_id, question_key);
