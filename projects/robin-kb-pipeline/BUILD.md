# BUILD LOG — Robin KB Pipeline

**Slug:** robin-kb-pipeline
**Started:** 2026-07-23
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-07-23 — Session 2

**Status after session:** on track (console UI built; needs env + first live publish to fully exercise)

**What we did:**
- Turned the cleaner page into the **single-pane-of-glass console** (`public/index.html`): a numbered
  **Clean → QA → Publish** pipeline nav (Rams/Vignelli — one job per tab, read left-to-right).
  - **Clean** tab = the existing cleaner; each reviewed article gains a **→ Send to Publish** button
    (disabled with "Fix PII to publish" when a fatal flag is present).
  - **QA** tab = the Robin Q Tester embedded (iframe of `voiceagents-seven/robin-q-tester`) + open-in-tab link.
  - **Publish** tab = live registry from `/api/kb_list`: "Ready to publish" (staged, each with a
    **Publish to Robin** button → `/api/publish {id}`), "Live in Robin's KB", and a superseded History.
- New `api/approve.js` — stages a cleaned article into `kb_articles` as `state='approved'` (one staged
  row per plan+slug; idempotent by checksum; no-op if identical content is already live).
- All syntax-checked; deterministic-guard tests still green.

**What broke / surprised us:**
- Nothing. QA is embedded via iframe to avoid cross-project CORS (keeps one source of truth for the tester).

**Decisions made:**
- Human gate = the two clicks: **Send to Publish** (Clean) stages; **Publish to Robin** (Publish) goes live.
- QA tab embeds the deployed tester rather than duplicating its UI.

**Next session:**
> Add the four env vars to `voiceagents-qewy`, then **first live publish** to verify the `attachToAgent`
> payload against the real ElevenLabs API (fix `lib/elevenlabs.js` if the knowledge_base/usage_mode shape
> differs) and confirm Robin retrieves the doc on a call. Then decide + add the **console security gate**
> (Vercel Password Protection preferred) before it holds real content.

---

### 2026-07-23 — Session 1

**Status after session:** on track (backend spine built; needs env + one live verification)

**What we did:**
- Locked SCOPE (Architecture A; RAG/Auto; single `ELEVENLABS_AGENT_ID`; publish in the cleaner
  project; state-driven approve→publish; supersede-on-republish). Wrote SPEC.
- **Supabase `kb_articles` table** created and applied to project `rlhybqslnqhggbykjrqg`
  (migration `supabase/migrations/001_kb_articles.sql`): versioned, RLS-on (service-role only),
  one-`published`-per-`(plan_id,slug)` partial unique index. Verified 18 columns present.
- Built into the cleaner project (`voiceagents-qewy`), all syntax-checked, tests green:
  - `lib/supabase.js` — PostgREST client (mirrors the broker).
  - `lib/elevenlabs.js` — KB API: `createFromText`, `computeRagIndex`, `getRagIndex`,
    `attachToAgent`, `detachFromAgent`, `deleteDocument`.
  - `api/publish.js` — `{article}|{id}` → create-from-text → rag-index → attach; idempotent by
    checksum; supersedes + detaches/deletes the prior published doc; inserts the new published row.
  - `api/kb_list.js` — lists `kb_articles` for the Publish tab.
  - `.env.example` + `vercel.json` (`publish` maxDuration 60) updated.

**What broke / surprised us:**
- Nothing broke. The one UNVERIFIED piece: the exact `PATCH /v1/convai/agents/{id}` knowledge_base
  attach payload (create-from-text + rag-index are documented). Isolated in `lib/elevenlabs.js`.
- Can't test the ElevenLabs calls from the build sandbox (no key). Needs a live run.

**Decisions made:**
- Append-only versions: every publish inserts a new `published` row and supersedes the prior one —
  clean audit trail, and `kb_articles` can fully recreate the ElevenLabs doc.
- Idempotent by `sha256(body_md)`: re-publishing identical content is a no-op.

**Next session:**
> **Add env to the `voiceagents-qewy` Vercel project** (`SUPABASE_URL`,
> `SUPABASE_SERVICE_ROLE_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`), then do ONE live
> publish of a test article and **verify the `attachToAgent` payload** against the real API — fix
> the `knowledge_base` entry / `usage_mode` shape in `lib/elevenlabs.js` if needed, and confirm the
> doc shows on the agent + Robin can retrieve it. Then build the **Publish tab** (and the Clean/QA
> tabs) in `public/index.html`: list `kb_articles`, "Publish" button per approved article → `/api/publish`.
> Also decide the console **security gate** before it holds real content.
