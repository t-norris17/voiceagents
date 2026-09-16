# BUILD LOG — Robin Portal

**Slug:** robin-portal
**Started:** 2026-09-16
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-09-16 — Session 3 (second round of live feedback)

**Status after session:** built and verified against the mock; on the branch, awaiting promote and
one migration

**What Tanner asked for, and what was built:**
- **Overlap named.** Calls vs the old Monitor (Monitor dropped from the build and from the survey
  footer); Question Tester vs the Factory's QA step (to fold later); the survey's "Every call" vs
  Calls (later). Grader and Survey are different axes, accuracy and experience, which is why:
- **Quality and Accuracy.** The survey door is Quality (rename only, umbrella later if wanted); the
  grader door is Accuracy so the pair reads as two axes. Routes unchanged. The survey page's own
  title is renamed at the source.
- **One masthead everywhere.** `copy-modules.mjs` injects the portal masthead (wordmark, same nav,
  current page marked) at the top of the copied survey, tester and factory pages, using each page's
  own colour tokens with the portal's as fallback, and hides each page's small kicker line. The slide
  gets nothing: it is the projector artifact.
- **Simple and Advanced** on the survey (`broker/public/survey/index.html`, so the standalone link
  has it too). Simple is the slide's content reflowed: the question, the headline share with its
  interval, the split bar, NPS, voice, promoters-who-still-want-a-person, a needs-review line, and
  the cohort caveat; every figure opens the Advanced section it came from. Simple is the default
  for everyone, remembered per browser, `?view=advanced` overrides. Advanced is the page as it was.
  The Ask button stays in both.
- **Grade results** (`CallDrawer.js`). A verdict line (asked, answered, with a problem), a "What to
  do" box derived from the rows (fix the answer or the document, check a claim, write content,
  retrieval miss, and the correct declines listed in grey as wins), then per question: rating as a
  word (Correct, Incomplete, Wrong), Robin's answer, each claim with its verdict and the verbatim
  source span, and the three judgments in words. The 5-point number is gone from the page. The
  claims need **migration 003** (`call_question_scores.evidence`, additive, nullable): the grader
  writes it when the column exists and drops it when it does not; the endpoint reads it the same
  way; until then the drawer shows the reviewer note lines instead. `/api/call-scores` now also
  returns the demand record from `call_questions`.
- **Summary above every transcript**, ElevenLabs' own `analysis.transcript_summary` and title, read
  on demand by `/api/survey-call` with the broker's key, cached per instance (misses not cached),
  caller-side scrub applied, labelled as ElevenLabs' words. Verified the field carries text on
  `conv_8301m28d4f7zfeja4k2ycd9mb9eh`.
- **About: Knowledge.** Documents become topics and tools become abilities in plain words
  (`lib/robin-facts.js`), each with the live name in small type beside it; anything unmapped shows
  raw. The NestEgg reset article and two of its tools are still on the agent and so still show.

**Verified:** broker tests 55, portal tests 4, build clean; every route 200 through the mock and
`/dashboard` now 404; masthead present on survey, tester and factory and absent on the slide;
screenshots read for home, Simple, Advanced, factory, tester, About, the grade drawer and the
calls drawer.

**Found on the way, from the live database:** 39 calls carry a richer "grader rev 4" schema
(handoff, transfer class, bluffs, content gaps) written through 2026-08-05 by a grader that is not
in this repo; the current grader (47 calls, latest 19:19 UTC today) writes the simpler rows. The
portal renders what the current grader writes. Also: those 19:19 rows grade `grounded` against the
five Vertex documents, which is the proof the broker's new ElevenLabs key works.

**Next session:**
> Tanner: promote the branch build; apply migration 003 (Supabase SQL editor, the file in
> `broker/supabase/migrations/`), then "Grade new calls" once and open a call to see the claims with
> their source quotes. Then: fold the Question Tester into the Factory; the survey's "Every call"
> into Calls; remove the NestEgg leftovers from the agent; v1 auth.

---

### 2026-09-16 — Session 2 (first live feedback: one proxy defect, one env mismatch)

**Status after session:** deployed; blocked on the two secrets matching between projects

**What Tanner saw on the live portal:** a password prompt on every click; Calls and Grader failing
with `unexpected token 'A' ... is not valid JSON`; the survey's live data and the landing page's
information block both 401.

**What the logs said (portal `dpl_3JYqJM3e…`, broker `dpl_DgndeDfC…`):** every page served 200
once the password was entered; every proxied API call came back 401; and the *broker's* log shows
those same requests (`/api/calls`, `/api/metrics`, 15:06–15:08 UTC) rejected by its own gate. So the
portal reached the broker and the broker did not accept the internal header: `ROBIN_INTERNAL_SECRET`
differs between the two projects, or the portal is still running the deployment from before its env
vars were set (its last deploy is 15:00:13 UTC; the project changed at 15:05:11 and was not
redeployed). Env vars are read at deploy time. **Unverified which of the two: the connector cannot
read env values, and should not.**

**The defect that made it worse:** the proxy forwarded the broker's 401 to the browser as a 401.
The browser had just sent the portal password with that request, took the 401 as "wrong password",
dropped it, and prompted again on the next click. The body of that 401 is the text
`Authentication required.`, which is the `'A'` in the JSON error. Fixed: an upstream 401 is now a
502 with the sentence that names the fix (`app/api/[...path]/route.js`). Verified against the mock:
wrong secret gives 502 with that JSON on `/api/metrics` and `/api/calls`; matching secret gives 200;
anonymous stays 401; `/api/postcall` stays 404.

**The information block's 401** is a separate seam: it comes from the ElevenLabs API, so the key on
the portal is set but rejected (a missing key gives a "not set" message instead). Most likely the
key was created without the Agents Platform permission. Same key, same need, on the broker for the
grader's KB fetch.

**Also added:** a fixed "← Robin portal" link, bottom-left, on every copied module page, injected by
`scripts/copy-modules.mjs` into the copy only; the sources are untouched. Screenshots checked on the
survey (beside its Ask button) and the factory.

**Later the same day, after Tanner's redeploys (portal `dpl_869M2CAR…` at 18:59 UTC, broker
`dpl_7Nk1MH1V…` at 18:59):** verified across the seam. His first hits at 19:01 were still served by
the old portal deployment (`dpl_3JYq…` in the log) while the alias moved, and the broker still
answered 401; from 19:02:38 the new deployment served `/` and the broker logged `/api/calls 200`
and `/api/metrics 200`. Secret matches. The information block rendered, so the new ElevenLabs key
is accepted (version_seq 116 is the proof once `/api/health` is live).

**Added in the second push:** the same "← Robin portal" pill on Grader, Calls and About
(`app/components/HomeLink.js`, hidden on `/`); **`/api/health`**, the one path outside the gate,
reporting `broker.secret_accepted`, `elevenlabs.key_accepted`, `version_seq` and the deployed
commit, cached 30 s (so the wiring can be checked from a phone or the connector without the
password); and **About Robin** (`/about`, in the masthead): the configuration block moved off the
landing page, which now carries the name, one sentence, the number, and a one-line live status.

**Next session:**
> Tanner: (1) set `ROBIN_INTERNAL_SECRET` to one value on both `robin-portal` and `voiceagents`,
> (2) an ElevenLabs key with Agents Platform enabled as `ELEVENLABS_API_KEY` on both, (3) **redeploy
> both**, (4) rotate `PORTAL_PASSWORD` (a temporary one was shared in chat). Then open the portal:
> the doors should load without a second prompt, and the landing block should show v116. Then "Grade
> new calls" and confirm a Vertex call no longer grades `no_source`.

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
