-- Loan limit, computed by the system instead of by Robin.
--
-- Why: in the customer wave Robin quoted $107,453 as Priya's maximum on at least six calls. The plan
-- rule is the lesser of $50,000 or 50% of vested, and for $214,906 vested that is $50,000. The live
-- loan procedure taught her the wrong shape with a worked example in which 50% was always the
-- smaller number. get_balance now returns max_loan, and the procedure tells her to quote it.
--
-- This migration adds the one fact the rule needs that the schema did not hold: when a loan was
-- paid off. The plan's $50,000 cap is reduced by the highest loan balance in the past 12 months.
-- We keep no balance history, so a loan paid off inside that window counts at its ORIGINAL amount.
-- That can only understate the limit, never overstate it, which is the safe side for money.
--
-- members.max_loan_cents is NOT used by anything and is not corrected here. It is wrong for members
-- with an active loan (10001 reads $450, but she has a loan and $450 is under the minimum).
--
-- WHOLLY SYNTHETIC test data below, like every other member row.

alter table member_loans add column if not exists paid_off_on date;

comment on column member_loans.paid_off_on is
  'Date a paid_off loan was paid off. get_balance reduces the $50,000 cap by principal_cents of any '
  'loan paid off in the past 12 months (principal stands in for the highest balance, which is not '
  'stored; that understates the limit, never overstates it).';

-- A paid-off loan without a payoff date would silently drop out of the 12-month reduction.
alter table member_loans drop constraint if exists member_loans_paid_off_dated;
alter table member_loans add constraint member_loans_paid_off_dated
  check (status <> 'paid_off' or paid_off_on is not null);

-- Card D - Elena, 58: fully vested, no loan today, and a $20,000 loan paid off six months before the
-- retest. Expected: max_loan = min($50,000 - $20,000, 50% of $150,000) = $30,000. The only persona
-- where the 12-month reduction is the binding rule.
insert into members (member_id, dob, first_name, plan_name, balance_cents, vested_balance_cents,
                     fully_vested, outstanding_loan, max_loan_cents, deferral_pct, consented, consented_at)
values ('90004', '1968-02-14', 'Elena', 'Vertex Manufacturing 401(k)',
        15000000, 15000000, true, false, 3000000, 8.00, true, now())
on conflict (member_id) do nothing;

insert into member_loans (
  subject_ref, loan_number, purpose, status,
  principal_cents, balance_cents, interest_rate_pct, origination_fee_cents,
  payment_cents, payment_frequency, payments_total, payments_made,
  principal_paid_cents, interest_paid_cents,
  origination_date, maturity_date, next_payment_date, paid_off_on)
select id, 'LN-90004-01', 'general', 'paid_off',
       2000000, 0, 8.500, 7500,
       18911, 'biweekly', 130, 78,
       2000000, 412000,
       '2023-03-17', '2028-03-10', null, '2026-03-20'
from members where member_id = '90004'
  and not exists (select 1 from member_loans where loan_number = 'LN-90004-01');
