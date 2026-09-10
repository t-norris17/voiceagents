-- Participant loan detail (synthetic). Closes a documented gap: on a real call Robin said
-- "I can see that you have a loan outstanding, but I don't have the specific details like the
-- balance, payment amount, or how much time is left on it" and transferred. A loan row lets her
-- read the caller's OWN loan figures — a system-of-record read, the same category as their account
-- balance. It does NOT license answering plan-rule questions (limits, terms), which the 2025
-- enrollment packet does not publish; those still route to a specialist.
--
-- Its own table rather than columns on members: fourteen fields that would be null for 52 of 53
-- members, plus loan history (a paid-off loan is a plausible demo beat), plus the partial unique
-- index below, which makes the plan's one-loan-at-a-time rule unbreakable by data.
create table if not exists member_loans (
  id                    uuid primary key default gen_random_uuid(),
  subject_ref           uuid        not null references members(id) on delete cascade,
                                    -- members.id, i.e. the opaque subject_ref the agent passes.
                                    -- Deliberately NOT named member_id: that is the text handle
                                    -- on members, and reusing the name invites a wrong join.
  loan_number           text        not null,
  purpose               text        not null default 'general'
                                    check (purpose in ('general', 'residential')),
  status                text        not null default 'active'
                                    check (status in ('active', 'paid_off', 'defaulted')),

  principal_cents       bigint      not null check (principal_cents > 0),   -- original amount borrowed
  balance_cents         bigint      not null check (balance_cents >= 0),    -- outstanding principal today
  interest_rate_pct     numeric(5,3) not null check (interest_rate_pct >= 0),
  origination_fee_cents bigint      not null default 0,

  payment_cents         bigint      not null check (payment_cents > 0),
  payment_frequency     text        not null default 'biweekly'
                                    check (payment_frequency in ('weekly','biweekly','semimonthly','monthly')),
  payments_total        int         not null check (payments_total > 0),
  payments_made         int         not null default 0 check (payments_made >= 0),
  payments_remaining    int         generated always as (payments_total - payments_made) stored,

  principal_paid_cents  bigint      not null default 0,
  interest_paid_cents   bigint      not null default 0,

  origination_date      date        not null,
  maturity_date         date        not null,
  next_payment_date     date,                                              -- null once paid_off

  created_at            timestamptz not null default now(),

  constraint member_loans_payments_sane check (payments_made <= payments_total),
  constraint member_loans_balance_sane  check (balance_cents <= principal_cents),
  constraint member_loans_dates_sane    check (maturity_date > origination_date)
);

-- THE LOAN TRAP, ENCODED IN THE SCHEMA. The plan allows only ONE loan outstanding at a time and
-- Robin's prompt depends on that being true. A partial unique index means no amount of careless
-- seeding can produce a member with two active loans for her to reason about.
create unique index if not exists member_loans_one_active
  on member_loans (subject_ref) where status = 'active';

create index if not exists member_loans_subject_ref_idx on member_loans (subject_ref);

alter table member_loans enable row level security;
-- No policies on purpose: only the service role (Vercel broker) may read/write, matching members.

comment on table  member_loans is
  'Synthetic participant loan detail. members.outstanding_loan stays authoritative for the boolean; '
  'this table is additive. A member flagged outstanding_loan with no row here behaves exactly as '
  'before — Robin says a loan exists and routes detail questions to a specialist.';
comment on column member_loans.subject_ref is
  'FK to members.id — the opaque subject_ref. Not members.member_id (text handle).';
comment on column member_loans.balance_cents is
  'Outstanding PRINCIPAL only. A true payoff quote would add accrued interest to the next payment '
  'date; Robin quotes this as the current balance, not as a payoff figure.';
