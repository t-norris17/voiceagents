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

-- ---------------------------------------------------------------------------------------------
-- Marcus's loan detail (Card B). Requires migration 013_member_loans.sql.
--
-- Robin previously said "I can see that you have a loan outstanding, but I don't have the specific
-- details like the balance, payment amount, or how much time is left on it" and transferred. These
-- figures are what closes that. The schedule is a real amortisation, computed and checked rather
-- than picked: $8,000 at 8.50% APR over 130 biweekly payroll deductions from 2024-11-15 amortises
-- at $75.64 and zeroes out exactly at payment 130. As of 2026-09-10, 47 payments are made, leaving
-- $5,490.37 of principal, $2,509.63 principal + $1,045.45 interest repaid. Maturity is 2029-11-09,
-- not 11-15: 130 biweekly payments is 1,820 days, six short of five calendar years.
--
-- NOTE these are point-in-time values, not a live schedule. balance_cents and payments_made do not
-- advance on their own, so they drift as the demo date moves past 2026-09-10. One payment of drift
-- every two weeks. Re-run the amortisation if the demo slips a month or more.
insert into member_loans (
  subject_ref, loan_number, purpose, status,
  principal_cents, balance_cents, interest_rate_pct, origination_fee_cents,
  payment_cents, payment_frequency, payments_total, payments_made,
  principal_paid_cents, interest_paid_cents,
  origination_date, maturity_date, next_payment_date)
select id, 'LN-90002-01', 'general', 'active',
       800000, 549037, 8.500, 10000,
       7564, 'biweekly', 130, 47,
       250963, 104545,
       '2024-11-15', '2029-11-09', '2026-09-18'
from members where member_id = '90002'
on conflict do nothing;
