# SPEC — Robin Portal

**Slug:** robin-portal
**Status:** draft
**Last updated:** 2026-09-15

> One app, one URL. A landing page with an information block about Robin and five doors: Survey,
> Grader, Knowledge Factory, Question Tester, Calls. Everything that exists today becomes a page or
> an upstream behind that door. Built in two cuts: **v0** gets everything under one roof behind the
> one password that exists today, in days. **v1** replaces the password with accounts and
> per-organisation features, per `SCOPE.md`. The architecture is the same for both; v1 adds a table
> and a middleware.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | JavaScript (ESM), TypeScript optional | Matches the broker and cleaner; nothing to relearn |
| Runtime | Next.js (App Router) on Vercel, new project `robin-portal` | Server routes for proxying and secrets; static pages for the modules; one deploy |
| Key libraries | `@supabase/supabase-js` (v1 auth + entitlements), nothing else new | The module pages are already plain HTML/JS and stay that way |
| Storage | Existing Supabase project `rlhybqslnqhggbykjrqg`; v1 adds four tables | One database, one service key |
| Scheduler / trigger | None in v0. v1: a Vercel cron to grade new calls hourly, replacing "grade when someone opens the page" | The grader today runs only on a page view |
| Outputs / delivery | `robin.<domain>` (or `robin-portal.vercel.app` until a domain is chosen) | One link to send |

## Architecture

The portal owns three things and proxies everything else.

```
browser ── robin-portal (Next.js) ─────────────────────────────────────────────
             │  /                 landing: info block + five doors
             │  /survey/*         static page copied from broker at build
             │  /grader           NEW page (list, grade-now, drill-down)
             │  /factory/*        static page copied from cleaner at build
             │  /tester           static page copied from broker at build
             │  /calls            NEW page (recent calls, transcript drawer)
             │  /api/robin/status NEW: live agent facts from ElevenLabs (server key, 60s cache)
             │  /api/*            proxy → broker or cleaner by route map, adds X-Robin-Internal
             │
             ├──► voiceagents (broker)      /api/metrics, /api/survey-*, /api/ask, /api/questions,
             │                              /api/gap_request, /api/grade, /api/calls (new)
             ├──► voiceagents-qewy (cleaner) /api/clean, extract, refine, scan, approve, publish,
             │                              unpublish, kb_list, kb_article, gaps
             └──► ElevenLabs API            agent, versions, KB list, phone number (read-only)

ElevenLabs ──► voiceagents (broker)  /api/verify_caller, /api/get_balance, /api/postcall
                                      UNCHANGED. Never behind the portal.
```

**Why copy the module pages instead of iframing or proxying HTML.** Every existing page fetches its
data with root-relative paths (`/api/metrics`, `/api/clean`). Served from the portal at the same
paths, they work unmodified as long as the portal proxies those exact API paths to the right
upstream. An iframe would need a second login; proxying HTML under a prefix would break every fetch.
A build step copies `broker/public/survey`, `broker/public/robin-q-tester` and `cleaner/public`
into the portal's `public/`, so the source of truth stays where it is and the portal never forks it.

**Route map.** One file, `lib/upstreams.js`, lists every proxied path and its upstream. The two
upstreams have no overlapping API paths today (`gaps` vs `gap_request` are distinct). A path not in
the map is a 404, so a new endpoint has to be added deliberately.

**The internal header.** The portal adds `X-Robin-Internal: <secret>` to every proxied request. The
broker's and cleaner's middleware accept that header **or** (v0 only) the existing Basic password.
When v1 lands, the Basic branch is deleted and the upstreams accept only the header, so the only
way in is through the portal.

**Landing page.** Two parts. The **info block** is rendered from `/api/robin/status`: agent name,
phone number, live version id with its description and commit time, the LLM, the TTS model, the
Knowledge Base document names, the tool names, and calls in the last 7 days. It is read from the
ElevenLabs API on the server with a 60-second cache, never from a file in the repo. The **five
doors** are large buttons, each with one line of what's behind it and, where cheap, one live number:
Survey (responses so far), Grader (calls not yet graded), Knowledge Factory (articles published),
Question Tester (no number), Calls (calls today).

**Grader page (new).** The grader has no UI today: it is `api/grade.js` in the broker (the
`voiceagents` Vercel project), fired by the Experiment Monitor on page load, plus a retired CLI
under `robin-experiment/grader/`. It has **no answer key**: for each call it reconstructs the
documents Robin retrieved (ElevenLabs records the `document_id` of every chunk), looks their text up
in `kb_articles`, and scores whether what she said is supported by what she read. Its one
limitation is the reason it looks dead: only documents published through the Knowledge Factory
have a `kb_articles` row, and **all five live Vertex documents were uploaded straight into the
ElevenLabs dashboard**, so every recent call grades `no_source`. The page gives the grader a face
(calls graded / not graded, "Grade new calls", per-call drill-down into `call_question_scores`) and
the portal closes the gap by fetching document text from the ElevenLabs KB API when `kb_articles`
has none, which the grader's own header names as the obvious next step.

**Calls page (new).** Replaces the Experiment Monitor's role as "what happened recently" without its
grading grid: the last N calls from `ai_call_events` (time, duration, verified, outcome, topic,
sentiment, transfer reason), each opening the transcript drawer the survey already has. Backed by a
new broker endpoint `/api/calls?limit=50` that is a thin select; no new tables.

**v1 additions** (the only differences from v0): Supabase Auth with magic link; tables
`organisations`, `memberships(user, org, role)`, `feature_grants(org, feature_key, enabled)`,
`audit_log`; a portal middleware that resolves session → org → grants and returns 404 for a route
whose feature is off; the Admin page that edits those tables; `plan_id` on `organisations` and on
`ai_call_events` for scoping. Nothing in v0 has to be rebuilt for v1.

## File / folder structure

```
projects/robin-portal/
  SCOPE.md · SPEC.md · BUILD.md
  app/
    package.json              # next, react, @supabase/supabase-js
    next.config.js            # nothing exotic
    scripts/copy-modules.mjs  # prebuild: broker/public/{survey,robin-q-tester}, cleaner/public → public/
    lib/upstreams.js          # the route map: path prefix → upstream base URL
    lib/elevenlabs.js         # read-only agent facts, cached
    middleware.js             # v0: one password (same Basic scheme as the broker). v1: session + grants
    app/layout.js             # shell: header with the five doors, footer
    app/page.js               # landing: info block + doors
    app/grader/page.js        # new
    app/calls/page.js         # new
    app/admin/page.js         # v1
    app/api/robin/status/route.js
    app/api/[...path]/route.js   # the proxy
    public/                   # populated by copy-modules at build (gitignored)
  supabase/migrations/
    001_portal_orgs_and_grants.sql   # v1
```

Deployment: a new Vercel project, root directory `projects/robin-portal/app`, linked to this repo,
promoted the same way the broker is. Env: `ROBIN_INTERNAL_SECRET`, `BROKER_URL`, `CLEANER_URL`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `PORTAL_PASSWORD` (v0), Supabase URL and keys (v1).

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| Broker (`voiceagents`, voiceagents-seven.vercel.app) | Survey, tester, grader, calls APIs | `X-Robin-Internal` header; broker middleware change | Broker change needed: accept header, add `/api/calls` |
| Cleaner (`voiceagents-qewy`) | Knowledge Factory APIs | `X-Robin-Internal` header; cleaner middleware (new, it has none) | Cleaner change needed: add middleware |
| ElevenLabs API | Info block: agent, version, KB, tools, phone | Server-side API key, read-only calls | Key exists in the cleaner project's env; copy to portal |
| Supabase | v1 auth + entitlements; `/api/calls` via broker | Service key server-side; anon key for Auth | Provisioned |
| Vercel | Hosting | Project link | New project to create |

## Key decisions

- **Copy module pages at build; proxy their APIs 1:1.** The pages work unmodified because their
  fetch paths are preserved. No forks, no iframes, no second login.
- **The broker keeps Robin's call path.** Tool webhooks and the post-call webhook never move and
  never sit behind the portal. A portal outage cannot touch a live call.
- **v0 ships behind one password, on purpose.** It is the same protection the survey has today,
  extended to everything, and it gets the URL into people's hands in days. v1 is additive.
- **Grader and Calls are new pages, not the old monitor.** The Experiment Monitor mixed "what
  happened" with a grading grid that reads empty because the live KB has no text on our side. The
  portal splits them, and the grader page closes the `no_source` gap by reading document text from
  ElevenLabs.
- **Info block reads live, never the repo.** Every stale-file incident this project has had came
  from trusting a file over the platform. The landing page is the one place that rule is enforced by
  construction.
- **One route map file.** Every proxied path is listed; anything unlisted is a 404. Adding a door
  means editing one file.

## Open questions

- [ ] **Domain.** `robin-portal.vercel.app` until you name one. Custom domain changes nothing else.
- [ ] **Who is a customer** (from SCOPE) decides v1's data model detail, not v0. v0 can start now.
- [ ] **Cleaner secrets.** `ELEVENLABS_API_KEY` lives in `voiceagents-qewy`; the portal needs it too
      for the info block. Same key in two projects, or a read-only key minted for the portal.
- [ ] **`no_source` fix placement.** Fetch KB document text in the broker's grader (one change, all
      callers benefit) or in the portal. Recommendation: the broker, since the grader lives there.
      `curated_questions` then only supplies labels and can be retired from the monitor.
- [ ] **`/api/calls` shape.** Last 50 by default; whether it includes transcripts inline or the
      drawer keeps calling `/api/survey-call` per call. Recommendation: the latter, it exists.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A module page hard-codes something beyond `/api/*` (an absolute URL, a relative asset) and breaks when copied | Medium | The copy script runs in CI and a smoke test loads each door and asserts its first fetch returns 200 |
| Proxy adds latency to the survey page's 60s refresh | Low | Same region; the pages already tolerate a failed refresh and retry |
| The internal header leaks and the upstreams are open | Low | Header is a long random secret in env, rotated by changing two env vars; v1 removes the Basic path entirely |
| v0's single password lives on longer than intended | High | v1's first deliverable is the middleware that replaces it; SCOPE success criterion 2 is "the shared password is gone" |
| Grader keeps scoring `no_source` after launch because the KB-text fetch slipped | Medium | The door's live number is "calls with no source", so the gap is visible on the landing page, not buried |

---

*Spec last updated: 2026-09-15*
