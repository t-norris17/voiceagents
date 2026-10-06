-- A call that ended with an after-hours callback request gets outcome 'callback'.
--
-- Data Collection's outcome is a model's reading of the transcript, and "someone will call you back"
-- reads as 'transferred', the closest of its four labels. That would count every after-hours callback
-- in the transfer numbers on Interactions and Quality. So the broker decides it from evidence instead:
-- when the post-call webhook finds a service_requests row for the conversation (Robin filed it, or the
-- safety net did), it sets outcome = 'callback' (api/postcall.js, lib/request-link.js markCallback).
--
-- Additive: one more allowed value. No existing row changes here; the backfill of the calls that
-- already filed requests is a separate statement, run once after this.
alter table public.ai_call_events drop constraint ai_call_events_outcome_check;
alter table public.ai_call_events add constraint ai_call_events_outcome_check
  check (outcome in ('resolved', 'transferred', 'abandoned', 'unknown', 'callback'));
