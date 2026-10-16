# Code map: every code file in this repo and what it does

**As of:** 2026-10-16, commit `d312be0` (main after PR #95).
**How this was built:** every git-tracked code file was read. Claims about behavior come from the code,
not from READMEs. Where a README and the code disagree, this document says so.
**What this does not tell you:** what is live. It describes the repo. Which commit each Vercel
project is running, which env vars are set, which migrations are applied to Supabase, and how Robin
is configured in ElevenLabs were not checked. Treat any "live" statement below as the code's intent.

---

## How the pieces fit

Four Vercel projects build from folders in this repo. All four project names were confirmed in the
Vercel team on 2026-10-16; the root-directory mappings come from the BUILD logs and READMEs.

| Vercel project | Root directory | What it is |
|---|---|---|
| `voiceagents` | `projects/robin-experiment/broker` | **The broker.** The server Robin calls mid-call and after every call, plus the APIs behind Birdnest. |
| `robin-portal` | `projects/robin-portal/app` | **Birdnest.** The Next.js front door behind one shared password. Proxies to the broker and the Factory. |
| `voiceagents-qewy` | `projects/content-cleaner/cleaner` | **The Knowledge Factory.** Cleans raw plan documents into KB articles and publishes them to Robin. |
| `vertex-demo-site` | `projects/vertex-demo-site/site` | **Vertex Manufacturing**, a fictional employer site that hosts the Robin chat and voice widget. |

```
Caller ── phone ──► ElevenLabs (Robin) ──tools mid-call──► broker: verify_caller, get_balance,
                          │                                        handoff_option, file_request
                          └──post-call webhook (HMAC)────► broker: postcall ──► Supabase

Person ──password──► Birdnest ──x-robin-internal──► broker  (calls, grading, survey, requests, audio)
                              └─x-robin-internal──► Factory (clean, approve, publish ──► ElevenLabs KB)
```

Things that are **not** in this repo and still decide behavior: Robin's prompt, Knowledge Base,
procedures and tool wiring (ElevenLabs dashboard); every secret and switch (Vercel env vars); and the
applied state of the database (Supabase).

---

## Findings from the read

These came out of reading every file. None were fixed in this commit; this is a map, not a change.

1. **Two tables the code depends on have no DDL in the repo.** `gap_requests` (broker `metrics`,
   `gap_request`; Factory `gaps`, `publish`) and `call_questions` (broker `grade`, `call-scores`,
   `metrics`, `utilization`) are read and written, but no tracked migration creates them. Checked
   with `git grep` for their `create table`. They exist only in the live database, so the repo
   cannot rebuild Robin's schema from scratch.
2. **Two broker migration files collide with the main sequence.** `broker/supabase/migrations/002_*`
   and `003_*` are different changes from `robin-experiment/supabase/migrations/002_*` and `003_*`.
   The order they were applied in cannot be read from the repo.
3. **A stale prompt still sits in code.** `broker/lib/robin-prompt.js` carries the retired
   "virtual (not human) assistant" line. Nothing imports it today, so it drives nothing, but it is
   the kind of file someone could paste from. Same for `broker/lib/kb.js` (the old INTRUST KB).
4. **The broker README is well behind the code.** It calls the broker dependency-free, says `/`
   serves a page that no longer exists, says `/api/ask` is open and INTRUST-grounded (it is gated and
   reads Robin live), says `get_balance` omits the loan limit (it computes one), and lists about half
   the endpoints. `.env.example` is missing seven variables the code reads.
5. **Birdnest drops one header the Factory reads.** The portal proxy forwards only `content-type` and
   `accept`, so `x-filename` never reaches the Factory's `/api/extract`. Impact looks small: extract
   detects PDF and DOCX by magic bytes and uses the filename only as a hint.
6. **Small defects:** Factory `api/extract.js` says "max 8 MB" when the cap is 4.4 MB.
   `@anthropic-ai/sdk` is pinned to `"latest"` in both the broker and the Factory, so a deploy can
   pick up a new SDK version unannounced.
7. **Dead or superseded code** is marked in each table below. In short: `broker/lib/kb.js`,
   `broker/lib/robin-prompt.js`, `/api/questions` with `lib/questions.js`, the whole
   `robin-experiment/grader/` CLI (superseded by `broker/api/grade.js`),
   `robin-experiment/dashboard/robin-dashboard.html`, Birdnest's `/api/robin/status` and
   `public/brand/nest-logo.png`, and `survey/JUDGEMENT-GUIDE.html` (the served copy lives in the
   broker).

---

## 1. The broker: `projects/robin-experiment/broker/`

Vercel serverless functions. Each file in `api/` is one route; the filename is the URL.

### Who can reach what (`middleware.js`)

`middleware.js` gates a fixed list of paths and leaves the rest open. A gated request gets through
if the `x-robin-internal` header matches `ROBIN_INTERNAL_SECRET` (how Birdnest authenticates), or if
its Basic-auth password matches `SURVEY_PASSWORD`. With `SURVEY_PASSWORD` unset, gated paths answer
503. Gated: `/survey*`, `/dashboard*`, and the APIs `metrics`, `survey-export`, `survey-call`,
`survey-ask`, `survey-themes`, `calls`, `call-scores`, `utilization`, `channels`, `ask`, `grade`,
`questions`, `gap_request`, `requests`, `call-audio`. **Deliberately not gated:** the routes Robin
calls during a live call (so middleware adds no latency to the caller), `postcall` (it checks its
own HMAC) and `call-audio-sweep` (it checks `CRON_SECRET`). The file's comments record why the
matcher uses literal paths: an earlier glob did not compile and would have left survey data open.

### `api/`: routes ElevenLabs calls

| File | What it does |
|---|---|
| `verify_caller.js` | **POST `/api/verify_caller`**, Robin's identity tool mid-call. No auth by design. Looks up `members` by the spoken member ID, compares date of birth in code, and returns `verified`, `subject_ref`, `first_name`, `plan_name`, `consented`. |
| `get_balance.js` | **POST `/api/get_balance`**, Robin's balance tool mid-call. No auth by design. Reads `members` and `member_loans` and returns balance, vested amount, loan detail, and a computed loan limit: the lesser of $50k or 50% of vested, with the $50k reduced by any loan paid off in the last 12 months, and a $1k minimum. |
| `handoff_option.js` | **POST `/api/handoff_option`**, Robin's `get_handoff_option` tool. Requires `x-robin-tool-secret`. No database. Answers `{mode:"transfer"}` during call-center hours, or `{mode:"request", next_open, due_at, callback_by_text}` when closed. |
| `file_request.js` | **POST `/api/file_request`**, Robin's `file_request` tool. Requires `x-robin-tool-secret`. Refuses during open hours. Otherwise inserts a `service_requests` row and a `filed` event. |
| `postcall.js` | **POST `/api/postcall`**, the ElevenLabs post-call webhook, verified by HMAC-SHA256 against `ELEVENLABS_WEBHOOK_SECRET`. Ignores agents other than Robin's two. Upserts `ai_call_events` (idempotent on conversation id), then links or files an after-hours request and marks the call `outcome=callback` when one exists. |

### `api/`: routes Birdnest and the broker's own pages call (all gated)

| File | What it does |
|---|---|
| `calls.js` | **GET `/api/calls`** with paging and filters (all, ungraded, graded, no_source). Reads `ai_call_events` (never the transcript or phone number) and `call_question_scores`. Each row gets a channel (phone, web voice, chat) derived from the payload. |
| `call-scores.js` | **GET `/api/call-scores?id=`**. One call's grades: `call_question_scores` (with `evidence` when the column exists), `call_questions`, and the call's security fields. |
| `grade.js` | **POST `/api/grade`**, the grader. Claims up to 10 ungraded calls, loads the KB documents each call actually retrieved (`kb_articles`, falling back to ElevenLabs), and asks `claude-sonnet-5` for claims and verdicts. Scores with `lib/score.js` and writes `call_question_scores`, `call_questions`, `scored_at` and the security flag. Grading named calls or re-grading also needs the internal secret. Up to 300 s. |
| `utilization.js` | **GET `/api/utilization?days=`**. Which sections of Robin's live documents get used, from transcripts and grader evidence. Reads Robin's live config from ElevenLabs. No model call. |
| `metrics.js` | **GET `/api/metrics`**. Aggregates for security, experience, coverage, utilization, gaps and the survey, across `ai_call_events`, `curated_questions`, `call_question_scores`, `members`, `call_questions`, `gap_requests`, `experiment_waves` and the `survey_answers` view. |
| `requests.js` | **GET/POST `/api/requests`**, Birdnest's after-hours queue. GET returns the queue with SLA state and stats. POST records reached, voicemail, no_answer, note, close or reopen through the `service_request_act` database function, with actor `birdnest`. |
| `call-audio.js` | **GET `/api/call-audio?id=`**. Off unless `CALL_AUDIO_ENABLED` allows it. On first play, fetches the recording from ElevenLabs into the private `call-audio` bucket, then returns a 5-minute signed link and logs the play in `call_audio_listens`. Up to 60 s. |
| `call-audio-sweep.js` | **GET `/api/call-audio-sweep`**, the daily Vercel cron. Authenticates with `CRON_SECRET`. Deletes cached recordings nobody has played in 30 days, or one call's copy with `?id=` (for a deletion request). ElevenLabs stays the record. |
| `channels.js` | **GET `/api/channels`**. A map of conversation id to channel, for the survey page. |
| `survey-call.js` | **GET `/api/survey-call?id=`**. One call's survey answers, transcript with digit-pattern PII scrubbed from the caller's turns, the ElevenLabs summary, and whether audio is available. |
| `survey-export.js` | **GET `/api/survey-export`**. CSV download of survey people or calls, guarded against spreadsheet formula injection. |
| `survey-ask.js` | **POST `/api/survey-ask`**. Answers a question about the survey with `claude-opus-5`, over anonymized rows ("Respondent N"). |
| `survey-themes.js` | **GET `/api/survey-themes`**. Clusters open comments into themes with `claude-opus-5` once there are at least 8 real comments; drops themes under 2 people; cached 10 minutes. |
| `ask.js` | **POST `/api/ask`**, the Dry Run. Answers a question the way Robin would right now, using her live prompt and documents read from ElevenLabs, on `claude-haiku-4-5` at her temperature. Refuses rather than falling back if her config cannot be read. |
| `gap_request.js` | **POST `/api/gap_request`**. Upserts a `gap_requests` row (a question Robin could not answer) with its status. |
| `questions.js` | **GET `/api/questions`**. Serves the 25 curated questions. **Looks unused:** no page fetches it, though Birdnest's proxy still allows it. |

### `lib/`

| File | What it provides |
|---|---|
| `supabase.js` | Minimal PostgREST client on the service-role key; `sbAll()` pages past the 1000-row cap. Used by most routes. |
| `storage.js` | Supabase Storage put, sign and delete for call audio. (`bucketExists` is never called.) |
| `tool-secret.js` | Constant-time check of `x-robin-tool-secret` against `REQUESTS_TOOL_SECRET`. 503 when unset. |
| `parse.js` | Turns spoken member IDs and dates into values, and formats dollars and dates for speech. |
| `hours.js` | Call-center hours (Mon to Fri, 8 to 6 Central, federal holidays) and the 8-business-hour callback promise. |
| `requests.js` | After-hours request rules: Robin's agent IDs, request types, phone normalization, reading tool results from transcripts, the hang-up safety net, the test window, SLA state, queue stats. |
| `request-link.js` | `linkOrFile()` ties a tool-filed request to its call, or files one from Data Collection if the caller hung up first. `markCallback()` sets the call outcome. |
| `channel.js` | Derives phone, web voice or chat from the payload without reading the phone number; adapts the grader prompt for chat. |
| `calls.js` | Pure helpers behind `/api/calls`: columns, paging, filters, 24h and 7d counts. |
| `call-audio.js` | Audio rules with no I/O: bucket, link lifetime, idle limit, the on/off switch, which channels have audio. |
| `el-audio.js` | Fetches a conversation's audio from ElevenLabs. |
| `kb-text.js` | Fetches KB document text and conversation summaries from ElevenLabs; returns null rather than throwing. |
| `robin-live.js` | Reads Robin's live prompt, temperature and attached documents from ElevenLabs (60 s cache). Builds the Dry Run framing. |
| `score.js` | Grade arithmetic: start at 5, deduct for contradicted, unsupported, unanswered, incomplete and poorly routed answers, floor at 1. |
| `grade-run.js` | Grade request parsing and limits, output parsing, and the rule that a re-grade never clears a security flag. |
| `grade-claim.js` | Atomic claim on `scored_at` so overlapping runs never grade or pay for the same call twice. |
| `grade-write.js` | Writes a grade: upsert new rows, delete stale ones, then stamp the call. |
| `topics.js` | Builds the grader's topic menu from the section titles of Robin's live documents. |
| `utilization.js` | Splits documents into sections and matches cited quotes to sections. |
| `survey-data.js` | Survey reads from `survey_answers` and `experiment_waves`, people versus calls, respondent labels, Wilson intervals. |
| `survey-slice.js` | Parses the `range` (wave, week, month, year, all, custom) and `staff` filters in Central time. |
| `survey-comments.js` | Tells a declined "No." apart from a real comment. |
| `questions.js` | The 25 curated questions and ideal answers. Only `api/questions.js` uses it. |
| `kb.js` | **Dead.** The old INTRUST KB text, embedded. Nothing imports it. |
| `robin-prompt.js` | **Dead, and stale.** An old production prompt that still includes the retired virtual-assistant disclosure line. Nothing imports it. |

### `public/` (static pages on the broker)

| File | What it is |
|---|---|
| `survey/index.html` | The Quality page (survey results). Birdnest copies it in at `/survey/`. |
| `survey/slide/index.html` | One-slide survey summary. Copied into Birdnest. |
| `survey/guide/index.html` | "How to judge what the testers told us." Copied into Birdnest. |
| `survey/robin/*.png` | Five Robin faces used by the survey page's Ask panel. |
| `robin-q-tester/index.html` | The Dry Run page. Copied into Birdnest. |
| `robin-tour.js` | Guided-tour engine used by the survey page and Birdnest's layout. |
| `dashboard/index.html` | The older Experiment Monitor (metrics, grade, gap requests). Not copied into Birdnest. |

### `supabase/migrations/`, config and tests

| File | What it does |
|---|---|
| `supabase/migrations/002_call_question_scores_unique.sql` | Unique key on (conversation_id, question_key) so the grader can upsert. Numbering collides with the main sequence (see Findings). |
| `supabase/migrations/003_call_question_scores_evidence.sql` | Adds `call_question_scores.evidence`, the grader's claims and source quotes. |
| `vercel.json` | Function time limits (grade 300 s, survey-themes and call-audio 60 s), the daily audio sweep cron at 09:17 UTC, and a redirect from `/` to Birdnest. |
| `package.json` | ESM; one dependency, `@anthropic-ai/sdk` pinned to `"latest"`. `npm test` runs the suite. |
| `.env.example` | Names six variables; the code reads thirteen (see below). |
| `test/*.test.mjs` (21 files) | Node test runner, all stubbed. Coverage by area: call audio and the sweep; calls list, filters and channel; channel rules; balance and loan limit; grade claim, handler, run and score; hours; middleware gate (including that the matcher compiles); the portal seam; requests and post-call end to end; Dry Run; survey comments, metrics, slicing; topics; utilization. Not run for this document. |

**Env vars the broker reads:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (database and storage);
`ELEVENLABS_WEBHOOK_SECRET` (post-call HMAC); `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` (live config,
KB text, summaries, audio); `ANTHROPIC_API_KEY` (ask, grade, survey-ask, survey-themes);
`REQUESTS_TOOL_SECRET` (Robin's request tools); `REQUESTS_FORCE_CLOSED_UNTIL` (test window, ignored if
more than 12 hours out); `ROBIN_INTERNAL_SECRET` (Birdnest's header); `SURVEY_PASSWORD` (Basic auth);
`CRON_SECRET` (audio sweep); `CALL_AUDIO_ENABLED` (audio switch; when unset, on only in preview);
`VERCEL_ENV` (non-production marks filed requests as tests).

---

## 2. Birdnest: `projects/robin-portal/app/`

Next.js 15. One shared password, no accounts. It renders its own pages and proxies everything else
to the broker or the Factory with the internal secret attached.

### Root

| File | What it does |
|---|---|
| `middleware.js` | **The only gate.** Covers every path except Next's static assets and `/api/health`. Requires Basic auth whose password matches `PORTAL_PASSWORD` (username ignored, constant-time compare); 503 if unset, 401 on a miss. Also rewrites module folder URLs to their `index.html`. |
| `next.config.mjs` | Hides the `x-powered-by` header and keeps trailing-slash URLs reaching the rewrite. |
| `package.json` | Next 15.5, React 19. `predev` and `prebuild` run `scripts/copy-modules.mjs`. |
| `.gitignore` | Ignores the pages copied in at build. Lists `public/dashboard/`, which nothing produces. |
| `README.md` | Run and deploy notes. Behind the code: undercounts the tests, omits `BROKER_PREVIEW_URL` and `ELEVENLABS_API_BASE`, and one line says a secret mismatch shows as 401 when the proxy turns it into 502. |

### `app/`: pages

| File | URL and what it shows |
|---|---|
| `layout.js` | Every page's frame: title, theme, masthead, the "Birdnest" home pill, footer, and `robin-tour.js`. |
| `loading.js` | The nest loader while a server page waits on data. |
| `globals.css` | All portal styling, light and dark. |
| `page.js` | **`/`**, the landing page. Robin's number, a live "version N, updated X ago" line read from ElevenLabs, and eight tiles (Quality, Accuracy, Utilization, Knowledge Factory, Dry Run, Interactions, Requests, Demo Website), some with live counts from the broker. |
| `about/page.js` | **`/about`**. Robin's live configuration in plain words: version, commit time, knowledge topics, abilities, model, voice, procedures. |
| `calls/page.js` | **`/calls`** (Interactions). The 100 most recent calls and chats with status dots, filters and a drawer; refreshes every minute. |
| `grader/page.js` | **`/grader`** (Accuracy). Manual, paid grading: grade newest (max 10), pick rows, re-grade with a confirm. Costs shown are estimates. |
| `utilization/page.js` | **`/utilization`**. Coverage, a "knowledge in use" gauge, per-document sections, never-used sections and unanswered questions. |
| `requests/page.js` | **`/requests`**. Wrapper for the after-hours queue. |

### `app/api/`: route handlers

| File | What it does |
|---|---|
| `[...path]/route.js` | **The proxy.** Forwards `/api/<segment>/...` to the broker or the Factory according to `lib/upstreams.js` (unlisted segments get 404). Adds `x-robin-internal`, forwards only `content-type` and `accept`, streams the body, and turns an upstream 401 into a 502 so the browser keeps the portal password. Up to 300 s. |
| `health/route.js` | **`/api/health`**, the only ungated route. Checks the broker accepts the secret, ElevenLabs answers, and the Factory is gated; reports the deployed commit. No secrets in the output. |
| `robin/status/route.js` | **`/api/robin/status`**. Robin's live status as JSON. **Looks unused:** nothing calls it. |

### `app/components/`

| File | What it does |
|---|---|
| `CallDrawer.js` | The interaction drawer on Interactions, Accuracy and Requests: summary, transcript, grades with source quotes, and the audio player when audio exists. |
| `CallPlayer.js` | Call audio: fetches a short-lived link on first play and renews it before expiry; seek, speed, keyboard control, follow-along transcript. |
| `RequestsQueue.js` | The after-hours queue: stat tiles, filters, SLA status per row; refreshes every minute. |
| `RequestDrawer.js` | One request: who, what, deadline versus what Robin promised, a tap-to-call link, and actions (reached, voicemail, no answer, note, close, reopen) with history. |
| `Masthead.js`, `HomeLink.js`, `NestLoader.js` | Masthead with the current section marked, the fixed "Birdnest" home pill, and the loader. |

### `lib/`

| File | What it provides |
|---|---|
| `upstreams.js` | **The route map.** Which `/api` segments go to the broker and which to the Factory. On a preview build of a branch, points at that branch's broker (`BROKER_PREVIEW_URL` or a derived URL). Robin's live-call routes are deliberately not proxied. |
| `broker.js` | Server-side broker fetch with the internal header; returns null on failure. |
| `elevenlabs.js` | Reads Robin's agent and live version from ElevenLabs (60 s cache). |
| `module-paths.js` | Folder URL to `index.html` rewrites for the copied pages. |
| `robin-facts.js` | Maps live KB document and tool names to plain English for `/about`. |
| `cleaner-health.js` | Interprets the Factory health probes. |
| `channel-label.js`, `interaction-state.js`, `grader-view.js`, `utilization-view.js`, `request-view.js`, `player-view.js` | Pure display logic for each page: labels, status dots, filters, cost text, SLA states, time zones, player arithmetic. All tested. |
| `mast.js`, `theme.js`, `loader.js` | The masthead, light/dark switch and nest loader, shared by Next pages and the copied pages. |

### `scripts/`, `public/`, `test/`

| File | What it does |
|---|---|
| `scripts/copy-modules.mjs` | Runs before every build. Copies the survey pages, Dry Run and `robin-tour.js` from the broker, the Factory page and its vendor files from the cleaner, and the whole Vertex site into `public/`, then injects the masthead, theme, loader and home pill into the copies. Fails the build if a source is missing. The copies are gitignored, so the deployed Birdnest depends on those folders at build time. |
| `public/brand/nest-logo.webp` | Masthead logo. (`nest-logo.png` beside it is unreferenced.) |
| `public/loader/*` | Loader CSS and the nest and egg images. |
| `test/*.test.mjs` (10 files) | Factory health logic, Accuracy wording, interaction dots, loader, path rewrites, masthead, player math, request display, the route map (including that live-call routes are never proxied), utilization wording. |

**Env vars Birdnest reads:** `PORTAL_PASSWORD`, `ROBIN_INTERNAL_SECRET`, `BROKER_URL`,
`BROKER_PREVIEW_URL`, `CLEANER_URL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_API_BASE`
(local tests), and Vercel's `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA`.

---

## 3. The Knowledge Factory: `projects/content-cleaner/cleaner/`

Turns raw plan text into Robin-ready articles, stages them in Supabase `kb_articles`, and publishes
them to Robin's ElevenLabs Knowledge Base. `middleware.js` gates every path on `x-robin-internal`, so
it is only reachable through Birdnest (at `/factory/`). The folder name stays `content-cleaner`
because the Vercel project points at it.

| File | What it does |
|---|---|
| `middleware.js` | Gate on `x-robin-internal` matching `ROBIN_INTERNAL_SECRET`. 503 unset, 401 wrong. |
| `api/clean.js` | **POST `/api/clean`**. Rewrites source into articles (`claude-opus-4-8`), runs the deterministic scan and the critic (`claude-sonnet-5`). Writes nothing. Up to 300 s. |
| `api/scan.js` | **POST `/api/scan`**. For large documents, triages sections with `claude-sonnet-5`. Writes nothing. |
| `api/refine.js` | **POST `/api/refine`**. Revises one article with `claude-sonnet-5`, then rescans. Writes nothing. |
| `api/extract.js` | **POST `/api/extract`**. Text from a DOCX (or PDF) upload. Error text says 8 MB; the cap is 4.4 MB. |
| `api/approve.js` | **POST `/api/approve`**. Re-runs the PII scan and saves an approved version in `kb_articles`. Does not touch ElevenLabs. |
| `api/publish.js` | **POST `/api/publish`**. **Writes to live Robin:** creates the document in ElevenLabs, indexes it, attaches it to the agent, detaches and deletes the superseded one, records it in `kb_articles`, and resolves matching `gap_requests`. |
| `api/unpublish.js` | **POST `/api/unpublish`**. Detaches and deletes the document from Robin and archives the row. |
| `api/kb_list.js` | **GET `/api/kb_list`**. Library list, with each row marked attached or not by reading the live agent. |
| `api/kb_article.js` | **GET `/api/kb_article?id=`**. One full article for the Library editor. |
| `api/gaps.js` | **GET `/api/gaps`**. Open gap requests and published count. **Looks unused:** no page calls it. |
| `lib/rewrite.js` | The single `claude-opus-4-8` rewrite call that segments a source into articles. |
| `lib/validate.js` | The deterministic scan (an SSN is fatal; cross-references, UI gestures, tables and bare phone numbers warn) and the critic, plus its 1 to 5 score. |
| `lib/kcs.js` | The rewrite and critic system prompts, and article-to-text rendering. |
| `lib/render.js` | Drop, coverage and candidate-question reports; file output for the CLI. |
| `lib/elevenlabs.js` | ElevenLabs KB client: create, index, attach, detach, delete. |
| `lib/supabase.js` | Service-role PostgREST client. |
| `lib/gaps.js` | Matches a published article to open gap requests (word overlap, 0.5 threshold). |
| `lib/extract.js` | Reads text files from disk for the CLI. |
| `clean.js` | Local CLI version of the pipeline that writes files to `out/<slug>`. Its console says the critic is Opus; it is Sonnet. |
| `tools/calibrate-critic.mjs` | Paid local check: runs the critic on articles with planted defects and fails on any miss. |
| `public/index.html` | The Factory UI, served through Birdnest at `/factory/`. |
| `public/vendor/pdf*.mjs` | Vendored pdf.js for reading PDFs in the browser. |
| `vercel.json`, `package.json` | Function time limits; dependencies (Anthropic SDK pinned to `"latest"`, mammoth, pdf-parse). |
| `test/*.test.mjs` (6 files) | Publish dock and Library (Playwright, skipped if absent), gap matching, attached flags, the gate, score arithmetic, scan patterns. |

**Env vars:** `ROBIN_INTERNAL_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ANTHROPIC_API_KEY`.

---

## 4. Database migrations

### `projects/robin-experiment/supabase/migrations/` (Robin's Supabase project)

Every table enables row-level security with no policies, so only the service role (the broker and
the Factory) can touch them. Migrations 007 to 016 each redefine the survey views; 017 holds the
current definition.

| File | What it does |
|---|---|
| `001_members.sql` | `members`: synthetic participants and their verification factors, balances, loan flag, deferral, consent. |
| `002_ai_call_events.sql` | `ai_call_events`: one row per call from the post-call webhook, unique per conversation so retries are safe. |
| `003_curated_questions.sql` | `curated_questions`: the original 25-question eval set. |
| `004_call_question_scores.sql` | `call_question_scores`: per-question grades on each call. |
| `005_ai_call_events_security.sql` | Security flag and detail on calls (for example SSN disclosure, details before verification). |
| `006_ai_call_events_scored_at.sql` | `scored_at`, so the grader skips graded calls. |
| `007` to `011` | Successive versions of the `survey_answers` and `survey_people` views: reading survey fields out of the webhook payload, PII scrub of comments, one person per caller, parse-failure fix, caller plus persona. All superseded. |
| `012_nps_and_voice_naturalness.sql` | `parse_survey_0_10()` (still used) and NPS and voice scores in the views. |
| `013_member_loans.sql` | `member_loans`: synthetic loans, one active per member. |
| `014_customer_wave.sql` | `experiment_waves` and the first wave. |
| `015_respondent_is_the_name_given.sql` | `respondent_aliases`, name normalization, fuzzy matching: a respondent is the name they gave. |
| `016_respondent_name_honours_alias.sql` | Labels follow the alias. |
| `017_waves_are_a_dimension.sql` | Wave labels, the internal wave, `experiment_staff`. **Current definition of both survey views.** |
| `018`, `020`, `021`, `022` | Data only: roster spellings in `respondent_aliases`. |
| `019_loan_limit.sql` | Payoff date on loans, for the 12-month loan-limit rule; seeds synthetic member 90004. |
| `023_service_requests.sql` | `service_requests` and append-only `service_request_events`, plus `service_request_act()` (service role only) that changes status and logs in one transaction. |
| `024_callback_outcome.sql` | Allows `outcome='callback'`. |
| `025_call_audio.sql` | Private `call-audio` bucket, `call_audio_cache`, and append-only `call_audio_listens`. |
| `026_call_audio_renewal.sql` | `renewal` flag so a renewed link is not counted as a new play. |

### Other SQL

| File | What it does |
|---|---|
| `projects/robin-kb-pipeline/supabase/migrations/001_kb_articles.sql` | `kb_articles`: versioned articles per plan and slug, one published per slug. The Factory writes it; the grader reads it. |
| `projects/robin-experiment/demo/seed-demo-members.sql` | Upserts synthetic members 90001 to 90003 on the Vertex plan and one loan. |
| `projects/robin-experiment/survey/read-results.sql` | Hand-run survey queries. Still centered on the retired 1 to 5 rating. |
| `projects/nestegg-u-demo/phase2/001_ai_call_events.sql` | Earlier draft of `ai_call_events`. Superseded by Robin's 002. |

---

## 5. Smaller and older projects

### `projects/vertex-demo-site/site/` (static, no build)

| File | What it does |
|---|---|
| `index.html`, `about.html`, `careers.html`, `benefits.html`, `contact.html` | Fictional Vertex Manufacturing pages; the contact form sends nothing. Every page is `noindex`. |
| `tester-guide.html` | Unlisted tester page: three synthetic personas and a ten-question chat versus voice parity script. |
| `assets/site.js` | Mounts the ElevenLabs widget on every page, pointed at **Robin (web demo)** (`agent_0101m3sjqvfyejsa9kn127ez26mm`, a copy of live Robin), tagged `channel: web_widget`. Also nav and scroll effects. |
| `assets/vendor/convai-widget-embed-0.18.3.js` | Self-hosted, pinned copy of the ElevenLabs widget. |
| `assets/style.css`, `assets/fonts/*`, `assets/favicon.svg` | Theme and self-hosted fonts. (`robin-avatar-172.png` is not referenced by code.) |
| `vercel.json` | Clean URLs, `noindex` header, microphone allowed for the voice widget. |

### `projects/robin-experiment/grader/` (superseded)

A local CLI (`node score.js`) that graded calls against the 25 curated questions with
`claude-opus-4-8`. Replaced by `broker/api/grade.js`, which grades against the documents Robin
actually retrieved. Running it now would mix old-style rows into `call_question_scores`. Files:
`score.js`, `lib/judge.js`, `lib/security.js`, `lib/supabase.js`, `package.json`.

### `projects/robin-experiment/` reference files (nothing reads these)

| File | What it is |
|---|---|
| `dashboard/robin-dashboard.html` | Early monitor mock with hard-coded sample data. Superseded. |
| `demo/scenarios-print.html` | Printable handout: three callers, their questions, expected answers. |
| `survey/JUDGEMENT-GUIDE.html` | Older copy of the guide served from `broker/public/survey/guide/`. |
| `survey/architecture.html` | Explainer for the original two-question survey. Stale. |
| `survey/data-collection-fields.json` | Reference for the agent's Data Collection fields, applied by hand. Lacks the v2 fields the broker reads. |
| `survey/evaluation-criterion.json` | Reference for a hand-applied evaluation criterion. Likely stale (asks for the retired 1 to 5 rating). |
| `survey/simulation-tests.json` | Registry of 12 ElevenLabs simulation test ids and notes. |

### `projects/nestegg-u-demo/` (inactive, July password-reset demo)

| File | What it does |
|---|---|
| `mock-backend/api/poc/[tool].js` | One handler for five mock tools: verify caller (SSN last 4 plus DOB against synthetic identities), plan details, send reset email (via Resend), document resolution (in memory), and a post-call email summary. No HMAC check. |
| `mock-backend/public/reset/index.html` | Mock reset page that mimics the real site's "Log In first" step. Sends nothing. |
| `mock-backend/vercel.json`, `package.json` | Static plus functions, no dependencies. |
| `tools/download-transcripts.mjs` | Still useful: downloads every conversation (optionally one agent's) from ElevenLabs as JSON and text, with retry. Needs `ELEVENLABS_API_KEY`. |
