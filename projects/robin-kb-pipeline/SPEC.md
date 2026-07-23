# SPEC — Robin KB Pipeline (publish + single-pane console)

**Slug:** robin-kb-pipeline
**Status:** active
**Last updated:** 2026-07-23
**Reads:** [`SCOPE.md`](./SCOPE.md) · [`../../docs/elevenlabs-reference.md`](../../docs/elevenlabs-reference.md) (KB API)

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | JavaScript (ESM) | matches the cleaner + broker; zero build |
| Runtime | Vercel serverless functions + static `public/` | same as the cleaner it extends |
| Key libraries | none for publish (raw `fetch` to PostgREST + ElevenLabs) | dependency-light, like `broker/lib/supabase.js` |
| Storage | Supabase Postgres `kb_articles` (project `rlhybqslnqhggbykjrqg`) | versioned system-of-record + audit |
| Trigger | Human clicks **Publish** on an approved article | never auto-publish |
| Outputs | ElevenLabs KB document (RAG-indexed, attached to Robin) + `kb_articles` row | Architecture A |

## Architecture

```
Clean (existing)        Publish (new)                         Serving (native)
raw → /api/clean → articles                                   ┌─ Robin retrieves from
        │                                                      │  ElevenLabs KB at call
        └─ approve ─► kb_articles (state=approved)             │  time — NO Supabase hit
                          │  click Publish                     │
                          ▼                                    │
                   POST /api/publish ──► ElevenLabs:           │
                     1. create-from-text  → document_id        │
                     2. rag-index(model)  → indexed            │
                     3. PATCH agent       → attached ──────────┘
                          │
                          └─► kb_articles.state=published, elevenlabs_document_id, published_at
                              (prior published row for same plan_id+slug → superseded + detached)
```

Robin never calls Supabase for knowledge. (She still calls the broker→Supabase for `verify_caller` /
`get_balance` — identity/balance, not KB.)

## File / folder structure

```
projects/robin-kb-pipeline/
  SCOPE.md · SPEC.md · BUILD.md
  supabase/migrations/001_kb_articles.sql     # the table (applied to the shared Supabase project)

# built INTO the cleaner project so it ships on voiceagents-qewy:
projects/content-cleaner/cleaner/
  lib/supabase.js        # PostgREST client (mirrors broker/lib/supabase.js) — service key server-only
  lib/elevenlabs.js      # KB API: createFromText, computeRagIndex, attachToAgent, deleteDocument
  api/publish.js         # POST { article } or { id } → run the 3-step publish, upsert kb_articles
  api/kb_list.js         # GET → list kb_articles rows for the Publish tab (title/slug/state/version)
  public/index.html      # gains Clean / QA / Publish tabs (later step)
```

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| Supabase PostgREST | read/write `kb_articles` | `SUPABASE_SERVICE_ROLE_KEY` (server-only) | table built; key to add to cleaner project |
| ElevenLabs KB API | create doc → rag-index → attach to agent | `xi-api-key: ELEVENLABS_API_KEY` | endpoints known; attach body to verify live |
| ElevenLabs agent | target for attach | `ELEVENLABS_AGENT_ID` env | to add to cleaner project |

**Env to add to the `voiceagents-qewy` Vercel project:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`. (It currently has only `ANTHROPIC_API_KEY`.)

## `kb_articles` schema

```
id                     uuid pk default gen_random_uuid()
plan_id                text not null                      -- 'intrust' (slug of the plan/environment)
slug                   text not null                      -- article slug ('account-access')
title                  text not null
environment            text not null                      -- 'INTRUST 401(k) Plan'
body_md                text not null                      -- the article markdown that gets published
source                 text                               -- citation
coverage_flags         jsonb not null default '[]'
candidate_questions    jsonb not null default '[]'
version                int  not null default 1
state                  text not null default 'draft'      -- draft|approved|published|superseded|archived
elevenlabs_document_id text                               -- set on publish
elevenlabs_rag_indexed boolean not null default false
checksum               text                               -- sha256(body_md) — detect changes, dedupe
published_at           timestamptz
published_by           text
created_at             timestamptz not null default now()
updated_at             timestamptz not null default now()
unique (plan_id, slug, version)
partial unique index: one 'published' row per (plan_id, slug)
RLS on, no policies (service-role only) — same pattern as members
```

## Publish flow (`/api/publish`)

1. Load/accept the approved article (`{ id }` of an existing row, or `{ article }` to upsert then publish).
2. Compute `checksum = sha256(body_md)`. If a `published` row exists for `(plan_id, slug)` with the same
   checksum → **no-op** (already live, idempotent).
3. **ElevenLabs:** `createFromText({ text: body_md, name })` → `document_id`; `computeRagIndex(document_id,
   model)`; `attachToAgent(agent_id, document_id, { usage_mode: 'auto' })`.
4. **Supersede:** any prior `published` row for `(plan_id, slug)` → set `state='superseded'`, and
   `deleteDocument(old_document_id)` (detach + remove the stale ElevenLabs doc).
5. **Upsert** this row: `state='published'`, `elevenlabs_document_id`, `elevenlabs_rag_indexed=true`,
   `published_at=now()`, bump `version`.
6. Return `{ ok, document_id, version, state }`. Any ElevenLabs failure → leave the row `approved`,
   return the error (no half-published state claimed).

## Key decisions

- **Architecture A (native retrieval).** No agent→DB call for knowledge at conversation time; publish
  is a one-time push into ElevenLabs' KB. This is the whole point — zero added call latency.
- **Supabase is the record; ElevenLabs is the serving copy.** `kb_articles` is the versioned, auditable
  source of truth; the ElevenLabs doc is derived and disposable (recreatable from the row).
- **RAG / Auto usage mode**, `multilingual_e5_large_instruct` embeddings — scales past a few docs.
- **Idempotent + supersede by checksum**, so re-publishing is safe and doesn't duplicate ElevenLabs docs.
- **Publish lives in the cleaner project** — the article originates there; one deploy, one console.
- **Dependency-light:** raw `fetch` for both Supabase and ElevenLabs (mirror `broker/lib/supabase.js`).

## Open questions

- [ ] **Exact `PATCH /v1/convai/agents/{id}` attach body** — verify against the live API on first real
      publish (create-from-text + rag-index are well-documented; attach shape is the unknown).
- [ ] **`published_by`** — no console auth in v1; stamp a placeholder or the Vercel deploy identity
      until the security gate lands.
- [ ] **Console security gate** — Vercel Password Protection vs shared token (from SCOPE; not blocking).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Attach-to-agent payload shape wrong | Med | Isolate in `lib/elevenlabs.js`; verify on first live publish with the real key; the create/index steps still succeed independently |
| RAG index is async (not ready instantly) | Med | Poll `GET …/rag-index` for status before marking `elevenlabs_rag_indexed=true`; surface "indexing" in the UI |
| Unauthed `/api/publish` could push junk to Robin's KB | Med | Ship the security gate before real use; publish only accepts `approved` rows; synthetic data only |
| Serverless timeout on create+index+attach | Low | Each call is small; `maxDuration` already raised on the project |
| Stale ElevenLabs doc left attached after supersede | Low | Delete old `document_id` in the same publish; reconcile job later if needed |

---

*Spec last updated: 2026-07-23*
