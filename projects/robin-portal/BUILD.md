# BUILD LOG — Robin Portal

**Slug:** robin-portal
**Started:** 2026-09-16
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-09-16 — Session 1 (v0 built, not yet deployed)

**Time spent:** one session
**Status after session:** on track; blocked only on a Vercel project and five env vars

**What we did:**
- **Broker side, additive only** (`robin-experiment/broker`): the gate accepts `X-Robin-Internal`
  when `ROBIN_INTERNAL_SECRET` is set, checked before the password and inert without it; new
  `/api/calls` (recent calls + landing-page counts) and `/api/call-scores` (per-call grader rows),
  both gated; the grader now fetches document text from the ElevenLabs KB API when `kb_articles`
  has none (`lib/kb-text.js`), which is every live Vertex document, and stays exactly as before
  when `ELEVENLABS_API_KEY` is not set on the broker. 55 tests pass, 5 new at the seam.
- **The portal** (`app/`): Next.js 15, one password (`middleware.js`, same Basic scheme as the
  broker, fails closed), the route-mapped proxy (`lib/upstreams.js`, unlisted paths are 404,
  Robin's own endpoints are not listed), the landing page with the live info block from ElevenLabs
  and five doors with live counts, the Grader page (list, grade-now, drawer with the grader's
  evidence), the Calls page (list, drawer), and the module pages copied at build by
  `scripts/copy-modules.mjs` into gitignored `public/`.
- **Verified end to end** against a mock of the broker, the cleaner and the ElevenLabs API on one
  local port: anonymous requests get 401 on pages and API alike; `/api/postcall` through the portal
  is a 404 (never proxied); `/api/metrics` proxies with 200 and the mock saw the internal header;
  every door serves 200 (`/survey/`, `/survey/slide/`, `/robin-q-tester/`, `/factory/`,
  `/dashboard`, `/vendor/pdf.min.mjs`); the copied survey page renders fully through the proxy;
  the grader page runs a grade and opens a graded call to its scores; the calls page lists and
  opens transcripts. Screenshots read for all four portal pages. Build clean, 4 portal tests pass.

**What broke / surprised us:**
- **Next serves `public/` files by exact path only**, so `/survey/` was a 404 and `next.config`
  rewrites did not fix it. The middleware now rewrites the five module directory URLs to their
  `index.html`, and `skipTrailingSlashRedirect` keeps both spellings reachable.
- **A stale `next start` from the first build kept answering on port 3100** through two rounds of
  "fixes" that were correct but unobservable, because the cleanup pattern matched its own shell and
  killed the shell instead of the server. Cost twenty minutes. Kill by PID.
- **Playwright refuses to render a 401**, so the anonymous gate check is a plain request.

**Deploying it (same day, later):**
- The connector cannot create Vercel projects (403), so `robin-portal` was created in the dashboard.
  Three things went wrong, all with one cause: **Vercel keys everything off the production branch,
  and `main` did not carry the portal.** The root-directory picker never offered
  `projects/robin-portal/app`; the branch name ended up in the Root Directory field (build log:
  "The specified Root Directory 'claude/robin-experiment-…' does not exist"); and "Redeploy"
  rebuilds the same `main` commit whatever the branch setting says.
- **Fix: `main` fast-forwarded to the branch** (`513cc52` → `3dc7e14`, 42 commits, with Tanner's
  explicit yes). The branch had been production in practice for weeks. Side effect, as predicted:
  the broker project built from `main` and is live with the seam changes (inert until env vars);
  the cleaner rebuilt identical code.
- **Vercel refused Next.js 15.5.4** (`VULNERABLE_NEXTJS_VERSION`, CVE-2025-66478). Bumped to
  15.5.25, the maintained backport on the same line; tests, build and the mock end-to-end check
  pass. Pushed to the branch and to `main`.
- Local gotcha that cost real time twice: `pkill -f <pattern>` matched the shell running it and
  killed the shell, leaving a stale `next start` answering the port. Track servers by `$!` and kill
  by PID.

**Decisions made:**
- **Copy the module pages at build; proxy their APIs 1:1** (SPEC). Confirmed working with the
  survey page unmodified.
- **Cleaner gets no gate in v0.** It has none today; adding one before the portal is live would
  lock people out. The proxy already sends the header, so gating it later is a one-file change.
- **Landing page is `force-dynamic`**, with 60-second caching underneath, so the live status and
  counts are never a build-time snapshot.
- **`ELEVENLABS_API_BASE` env override exists for local tests only.**

**Next session:**
> **Deploy v0.** (1) Create Vercel project `robin-portal` from this repo, root directory
> `projects/robin-portal/app`. (2) Set its env: `PORTAL_PASSWORD`, `ROBIN_INTERNAL_SECRET` (long
> random), `BROKER_URL=https://voiceagents-seven.vercel.app`, `CLEANER_URL=https://voiceagents-qewy.vercel.app`,
> `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID=agent_8301kwj5qa8ve1atremxxwjjp9f8`. (3) Set the same
> `ROBIN_INTERNAL_SECRET` and `ELEVENLABS_API_KEY` on the **broker** project (`voiceagents`) and
> promote the branch there: the broker changes are on `claude/robin-experiment-session-9-tools-audio`
> and reach production only on promote. (4) Open the portal, run "Grade new calls" once, and confirm
> a live Vertex call no longer grades `no_source`. Then v1: Supabase Auth, organisations, feature
> grants, admin page (SCOPE).

---
