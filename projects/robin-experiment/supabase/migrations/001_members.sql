-- Experiment participants (synthetic). Verification factor = member_id + dob.
-- No SSN, no real financial data. Balances are assigned test values.
create table if not exists members (
  id                    uuid primary key default gen_random_uuid(),  -- opaque subject_ref used downstream
  member_id             text        not null unique,                 -- assigned handle the caller states
  dob                   date        not null,                        -- synthetic DOB (verification factor)
  first_name            text,                                        -- for a warm, personalized greeting
  plan_name             text        not null default 'NestEgg U Retirement Plan',
  balance_cents         bigint      not null default 0,              -- synthetic
  vested_balance_cents  bigint      not null default 0,
  fully_vested          boolean     not null default false,
  outstanding_loan      boolean     not null default false,
  max_loan_cents        bigint      not null default 0,
  deferral_pct          numeric(5,2) not null default 0,
  consented             boolean     not null default false,          -- opt-in tracking
  consented_at          timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists members_member_id_idx on members (member_id);

alter table members enable row level security;
-- No policies on purpose: only the service role (Vercel broker) may read/write.
-- RLS enabled denies anon/public access by default.

comment on table  members            is 'Synthetic experiment participants. Verification = member_id + dob. No real SSN or financial data.';
comment on column members.id         is 'Opaque subject_ref used in metrics/scoring. Never expose member_id downstream.';
comment on column members.dob        is 'Synthetic date of birth issued on the tester credential card. Second verification factor.';
comment on column members.consented  is 'Whether the tester has opted in to the experiment (consent + AI/recording disclosure).';
