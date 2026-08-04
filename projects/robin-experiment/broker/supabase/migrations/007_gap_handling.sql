-- Stop punishing helpfulness — without deleting the evidence.
--
-- An unanswered question scored 1, the same value as "confidently told the member something false".
-- That isn't a low score, it's a measurement error, and it held Robin at 2.94 while every visible
-- row on the dashboard read 4-5.
--
-- The tempting fix is to drop unanswered questions from the score. That's wrong three ways:
--   · it hides `not_retrieved` — the article existed and she missed it, 10 of this project's 51
--     gaps, and the only category unambiguously hers;
--   · it makes not-answering free and answering risky, so the metric quietly pays her to attempt
--     less — the classic way deflection metrics rot a contact centre;
--   · it deletes the compliance win. Refusing to give investment advice is the most valuable thing
--     a regulated agent does; 17 of those declines were being scored as failures.
--
-- So a gap is neither excluded nor flatly penalised. It is split: the WHY belongs to whoever owns
-- it (content, retrieval, or nobody), and the HOW is always hers.
alter table call_questions add column if not exists handling text;
alter table call_questions add column if not exists fault    text;
alter table call_questions add column if not exists gap_note text;

alter table call_questions drop constraint if exists call_questions_handling_check;
alter table call_questions add constraint call_questions_handling_check
  check (handling is null or handling in ('declined_correctly','acknowledged_and_routed','bluffed','dropped'));

alter table call_questions drop constraint if exists call_questions_fault_check;
alter table call_questions add constraint call_questions_fault_check
  check (fault is null or fault in ('none','content','robin'));

comment on column call_questions.handling is
  'How she handled a question she could not answer. declined_correctly = refused something she should refuse. acknowledged_and_routed = said she did not have it and offered a person. bluffed = answered anyway, ungrounded. dropped = stalled or left the caller with nothing. The one part of a content gap that is entirely hers.';

comment on column call_questions.fault is
  'Who owns this gap. none = she did the right thing (a win, not an absence). content = an article would fix it; it goes to the writing queue and NOT against her score. robin = hers — she invented, stalled, or missed an article that exists.';

-- Per-call rollups, so the manager view is a work queue rather than an average.
alter table ai_call_events add column if not exists correct_declines int;
alter table ai_call_events add column if not exists content_gaps     int;
alter table ai_call_events add column if not exists retrieval_misses int;
alter table ai_call_events add column if not exists robin_defects    int;
alter table ai_call_events add column if not exists bluffs           int;

comment on column ai_call_events.quality_score is
  'Robin score, 1-5: how well she handled what was asked of her. Answers she gave, plus how she handled the ones she could not. Never charged for a missing article; still charged for inventing one, for missing an article that exists, and for leaving a caller with nothing.';
comment on column ai_call_events.correct_declines is 'Questions she was RIGHT to refuse or route. A win — in a regulated product, the most valuable thing she does.';
comment on column ai_call_events.content_gaps     is 'Questions no article covers. Goes to the writing queue, not against her score.';
comment on column ai_call_events.retrieval_misses is 'Questions an article DOES cover that she failed to use. Hers, and the failure that grows silently as the KB grows.';
comment on column ai_call_events.bluffs           is 'Questions she could not answer and answered anyway, ungrounded. The worst thing in this table.';

-- excused_questions is superseded: gaps are now scored rather than removed from the denominator.
comment on column ai_call_events.excused_questions is
  'DEPRECATED (grader rev 3). Gaps are scored by scoreGap() rather than excluded, so nothing is removed from the denominator. Retained for older rows.';
