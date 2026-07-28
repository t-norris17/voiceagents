-- Demo personas for the COO/CRO demo track. Plan is Vertex Manufacturing because that is what
-- is actually loaded in the ElevenLabs knowledge base; get_balance must agree with the KB. WHOLLY SYNTHETIC — no real member, no real balance.
-- Member IDs 90001/90002 sit outside the 10001-10050 experiment range so nothing here collides
-- with a tester's record. Already applied to the live project (rlhybqslnqhggbykjrqg); kept here so
-- the demo is reproducible and so the rows are reviewable in source control.
--
-- Why these exist: the 50 experiment testers carry $1.5k-$134k balances under plan_name
-- 'NestEgg U Retirement Plan'. Neither reads credibly when Robin says it aloud to INTRUST executives.
insert into members (member_id, dob, first_name, plan_name, balance_cents, vested_balance_cents,
                     fully_vested, outstanding_loan, max_loan_cents, deferral_pct, consented, consented_at)
values
  -- Card A - Dana, 73 this year: makes "when do I have to start taking money out" a real question.
  ('90001','1953-04-12','Dana','Vertex Manufacturing 401(k)', 48721344, 48721344, true,  false, 5000000, 8.00, true, now()),
  -- Card B - Marcus, 28: total vs vested differ (profit sharing pre-cliff), and he has a loan.
  ('90002','1998-09-30','Marcus','Vertex Manufacturing 401(k)',  2731815,  1912270, false, true,        0, 6.00, true, now()),
  -- Card C - Priya, 52: catch-up contributions land because of her age, and she's fully vested.
  ('90003','1974-06-08','Priya','Vertex Manufacturing 401(k)',  21490562, 21490562, true,  false, 5000000,10.00, true, now())
on conflict (member_id) do update set
  dob=excluded.dob, first_name=excluded.first_name, plan_name=excluded.plan_name,
  balance_cents=excluded.balance_cents, vested_balance_cents=excluded.vested_balance_cents,
  fully_vested=excluded.fully_vested, outstanding_loan=excluded.outstanding_loan,
  deferral_pct=excluded.deferral_pct, consented=excluded.consented, consented_at=excluded.consented_at;
