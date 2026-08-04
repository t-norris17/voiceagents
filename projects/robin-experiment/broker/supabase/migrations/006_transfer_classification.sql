-- A transfer is not one thing, and scoring it as one thing is wrong in both directions.
--
-- Counting every transfer as a failure punishes the agent for doing exactly the right thing —
-- "agent cannot handle estate matters" is a correct decision, not a defect. But counting every
-- transfer as a success is worse, because it buries the ones that shouldn't have happened. In this
-- project's first 14 transfers, all three kinds are present:
--
--   by design      "agent cannot handle estate matters"
--                  "RMD calculation and setup — beyond voice agent scope"
--   knowledge gap  "cannot provide employer match details"  <- the match IS in the Plan Overview
--                  "detailed guidance on opting out of automatic enrollment"  <- also in the KB
--   tool gap       "needs loan balance and vesting confirmation"  <- get_balance returns these
--   breakdown      "caller requested a supervisor due to a rude agent"
--
-- Those four need four different fixes: nothing, write an article, wire a tool, and investigate.
-- One bucket called "transferred" can't ask for any of them.
--
-- The second half of this is the measure that actually matters for a voice agent whose job ends at
-- a human: not whether she transferred, but how much of the call she carried before she did.
alter table ai_call_events add column if not exists transfer_class     text;
alter table ai_call_events add column if not exists transfer_note      text;
alter table ai_call_events add column if not exists handoff_score      numeric;
alter table ai_call_events add column if not exists handoff_steps      jsonb;
alter table ai_call_events add column if not exists handled_correctly  boolean;
alter table ai_call_events add column if not exists excused_questions  integer;

alter table ai_call_events drop constraint if exists ai_call_events_transfer_class_check;
alter table ai_call_events add constraint ai_call_events_transfer_class_check
  check (transfer_class is null or transfer_class in
    ('by_design','caller_request','knowledge_gap','tool_gap','breakdown'));

comment on column ai_call_events.transfer_class is
  'Why the call went to a human. by_design = the task genuinely requires one (moving money, estate, RMD setup). caller_request = they simply asked for a person. knowledge_gap = an article would have prevented it. tool_gap = a tool would have (balances, vesting, transactions). breakdown = she got stuck, confused, or the caller escalated. The first two are successes; the last three each name a different fix.';

comment on column ai_call_events.handoff_score is
  'How much of the call she carried before handing off, 1-5. The point of a voice agent whose job ends at a human is to arrive at that human with the work done — caller verified, everything answerable answered, context collected, next step explained. A 5/5 call can end in a transfer.';

comment on column ai_call_events.handoff_steps is
  'The handoff checklist, per step: caller_verified, answered_what_it_could, collected_context, explained_next_step, warm_handoff. Kept as evidence so the score is arguable rather than asserted.';

comment on column ai_call_events.handled_correctly is
  'The headline. True when the call was resolved, OR transferred for a reason that needed a human AND handed off cleanly. This is the number that must not punish a correct transfer.';

comment on column ai_call_events.excused_questions is
  'Questions the caller asked that no article or tool could have answered — out of scope, or correctly declined. Excluded from the quality denominator, so a call is never marked down for refusing to do something it should refuse to do.';

create index if not exists ai_call_events_transfer_class_idx on ai_call_events (transfer_class)
  where transfer_class is not null;
