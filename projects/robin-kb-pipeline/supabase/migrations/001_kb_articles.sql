-- Robin KB pipeline — the versioned system-of-record for published knowledge articles.
-- Cleaner writes approved rows here; /api/publish pushes them into ElevenLabs' native KB and
-- flips state to 'published'. ElevenLabs is the serving copy; this table is the durable audit trail.
-- Robin NEVER reads this table at call time (Architecture A) — retrieval is native to ElevenLabs.
create table if not exists kb_articles (
  id                     uuid primary key default gen_random_uuid(),
  plan_id                text        not null,                       -- 'intrust' — scopes articles per plan
  slug                   text        not null,                       -- article slug ('account-access')
  title                  text        not null,                       -- participant-question title
  environment            text        not null,                       -- 'INTRUST 401(k) Plan' (KCS environment)
  body_md                text        not null,                       -- the article markdown that gets published
  source                 text,                                       -- citation / provenance
  coverage_flags         jsonb       not null default '[]'::jsonb,   -- "not covered here" notes (record)
  candidate_questions    jsonb       not null default '[]'::jsonb,   -- eval-set seeds (record)
  version                int         not null default 1,             -- bumps each publish of the same plan+slug
  state                  text        not null default 'draft'        -- lifecycle
    check (state in ('draft','approved','published','superseded','archived')),
  elevenlabs_document_id text,                                       -- set when pushed to ElevenLabs KB
  elevenlabs_rag_indexed boolean     not null default false,         -- true once rag-index completes
  checksum               text,                                       -- sha256(body_md) — dedupe / change-detect
  published_at           timestamptz,
  published_by           text,                                       -- who clicked publish (placeholder until auth)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (plan_id, slug, version)                                    -- one row per version of an article
);

create index if not exists kb_articles_plan_slug_idx on kb_articles (plan_id, slug);
create index if not exists kb_articles_state_idx      on kb_articles (state);

-- At most one live (published) row per article, enforced at the DB level.
create unique index if not exists kb_articles_one_published_per_slug
  on kb_articles (plan_id, slug)
  where state = 'published';

alter table kb_articles enable row level security;
-- No policies on purpose: only the service role (Vercel /api/publish) may read/write.
-- RLS enabled denies anon/public access by default.

comment on table  kb_articles                        is 'Versioned system-of-record for Robin KB articles. ElevenLabs is the serving copy; Robin never reads this at call time (Architecture A).';
comment on column kb_articles.plan_id                is 'Plan scope (slug of the environment), e.g. intrust.';
comment on column kb_articles.body_md                is 'The article markdown pushed verbatim into the ElevenLabs KB document.';
comment on column kb_articles.state                  is 'draft -> approved -> published; superseded when a newer version publishes.';
comment on column kb_articles.elevenlabs_document_id is 'ElevenLabs KB document id created on publish; deleted when this row is superseded.';
comment on column kb_articles.checksum               is 'sha256(body_md). Idempotency: same checksum already published = no-op.';
