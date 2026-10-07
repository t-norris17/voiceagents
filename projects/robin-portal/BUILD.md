# BUILD LOG — Robin Portal

**Slug:** robin-portal
**Started:** 2026-09-16
**Status:** active

---


## Session 2026-10-07: call audio built (Phase 3), production switch off

**Design checkpoint:** approved by Tanner ("build it with the switch off"). He is adding a recording
notice to Robin's opening message himself.

**Premises, checked on a preview before building** (temporary `api/audio-probe.js`, deleted before
merge; numbers in `audio/SPEC.md` "As built"): ElevenLabs returns MP3 for phone and web voice, 9.6 MB
for the 600 s cap, and ignores Range; a signed Storage URL answers Range with 206; a deleted object's URL
is refused at once; a web chat's "audio" is a 45-byte stub.

**Live changes:** migration 025 applied to Supabase 2026-10-07 (state checked first: no buckets, no
tables): private bucket `call-audio`, `call_audio_cache`, `call_audio_listens` (append-only; an
`update` was refused by the trigger when tried). Nothing else live changed; Robin is untouched.

**Verified on the preview (real route, real data):** `conv_2601m34qt28vfqsv3hmy9epxqz4h` (600 s)
first play 2.5 s with `first_fetch=true`, second play 0.29 s with `first_fetch=false`, both links answer
Range with 206; chat `conv_8101m3z1k42mfy986225617cgsa3` refused 404 "no audio for this channel";
`/api/call-audio` without the portal's header answered 401 (the fetch tool could not show the body, but it reached the ungated routes on the same deployment, so the 401 is the broker's, consistent with its gate; the gate itself is unit-tested); the sweep answered 503 "CRON_SECRET
is not set". Listen rows 1 and 2 in `call_audio_listens` are those two probe plays, not a person.
**Verified locally** with a synthetic tone behind a fake broker: a line click before any audio fetched
once and started at 1:38 with that line lit; the bar, arrow keys, speed and pause work; a wheel scroll
turns follow-along off; the player stays pinned; a chat draws no player; no horizontal scroll at 390 px.

**Renewal (Tanner asked for it after the built checkpoint):** a link that expires mid-listen is
replaced and logged with `renewal = true` (migration 026, applied live 2026-10-07, column checked
first). Testing it found a real bug: Chrome never raises an error on a refused range request, it
retries the dead link while the player says "playing", so the first version's error-driven renewal
never fired. Renewal is now driven by the link's expiry (`expires_in` from the broker). Exercised
locally with 20-second links: pause then jump renewed once and played; continuous play renewed on the
stall with no gap.

**Built checkpoint passed:** after `BROKER_PREVIEW_URL` was pointed at this branch's broker, Tanner
played real calls on the portal preview ("looks and works great"). The listen log shows them: rows 3
(`conv_8501m4999ee3f55r1vk9vtzq5nvn`, 21:16:30 UTC) and 4 (`conv_4001m4992fw7fxfrpv56qc06k1bg`,
21:17:49 UTC), both `first_fetch = true`, `renewal = false`.

**Not verified:** the cron firing (it runs on production only, and returns 503 until
`CRON_SECRET` is set); renewal against real Supabase links (only against the fake).

**To turn it on in production:** set `CALL_AUDIO_ENABLED=on` on the voiceagents project, redeploy.
Set `CRON_SECRET` there too so the daily sweep runs.

---

## Session 2026-10-06 (evening): after-merge evidence; test window removed

**Callback outcome, checked against the database after #91 and #92 merged (query of 2026-10-06):**
all five `service_requests` rows have their call at `outcome=callback`. Four were backfilled by hand
after migration 024; `conv_8501m4999ee3f55r1vk9vtzq5nvn` (a hang-up, `source=postcall`) was set by the
new post-call code with no help, which is the live proof that `markCallback` runs. ElevenLabs outcome
totals now: resolved 125, transferred 45, abandoned 31, unknown 26, callback 5. All five requests are
`is_test` and still open.

**Drawer header (#92):** the sticky header had a transparent band above it, so text scrolled up
behind it showed through. Fixed by moving the panel's top padding into the header itself.

**Test window removed:** Tanner deleted `REQUESTS_FORCE_CLOSED_UNTIL` from voiceagents production. It
had already switched itself off at 2:40 PM Central.

**Not verified:**
- *The transfer path since the window closed.* No ElevenLabs call has arrived since
  2026-10-06T19:40Z. Proof is one call during open hours asking for a person: `get_handoff_option`
  returns `mode=transfer` in `tool_results`, followed by `transfer_to_number`. Note the transfer number
  is Tanner's own phone, so the transferred leg may ring busy; the tool sequence is still the evidence.
- *Quality's "Callback requested" funnel row* has not been looked at on the live page.

**Next session:** run the transfer check above, then call audio (Phase 3). The audio spec still
assumes per-user accounts, which are shelved; revise it for the shared password first.

---


## Session 2026-10-06 (afternoon): Requests live on Robin; callbacks are not transfers

**Live Robin changes (each verified by full-config diff, nothing else moved):**
- `agtvrsn_3501m48r1q4afd1vjkpsvvy3dvjg`: tools `get_handoff_option` (`tool_1301m48r08rwepk84gg7dvpk2bws`)
  and `file_request` (`tool_3001m48r0jevet1shc1p40xfwgkp`) attached, header from secret `broker_tool_secret`.
- `agtvrsn_2301m494mgs5ff7tb7n9d1cj4nbn`: AFTER HOURS prompt block inserted after TRANSFER, DON'T
  DELEGATE. Live prompt equals the intended text exactly (19,913 chars); no virtual-assistant line.
- `agtvrsn_3601m494nzgnewyrvzgdgd3j8zf6`: Data Collection `request_type`, `request_detail` (21 existing
  fields sent unchanged, all 23 present after).
- Restore point if anything misbehaves: `agtvrsn_3501m3stybwee928ftsgce4qbq7h`.

**Test window:** `REQUESTS_FORCE_CLOSED_UNTIL=2026-10-06T19:40:00Z` set by Tanner on voiceagents
production (my Vercel connector gets 403 on production env vars). Expired by itself; deleted that evening.

**Phone tests, 2026-10-06 (evidence from `tool_results` and the rows):**
- `conv_1201m4957fzreakt97t9ntb03gk1` loan: handoff at 80s said request; Robin read "by Wednesday, October
  7 at 10:48 AM Central" verbatim; `file_request` ok at 113s; "you're all set" only after. Row linked,
  caller ID filled.
- `conv_9501m495bt38f4984ngy8adg6s72` beneficiary, different number: `callback_number_source=stated`,
  not overwritten by caller ID.
- `conv_2701m495fxyve06sd3y3jtnf05jh` hang-up: no `file_request`; safety net filed from Data Collection
  (`source=postcall`), promise recovered from the handoff result.
- All three `is_test`. Not yet run: one call after the window expires, to confirm the transfer path.

**Found and fixed:** Data Collection labelled two callback calls `transferred`, which would have put
every after-hours callback in the transfer numbers. Migration 024 (applied 2026-10-06) adds outcome
`callback`; the post-call webhook now sets it from evidence (a request exists for the conversation),
whatever the model guessed. Interactions shows "callback requested"; Quality's funnel has its own row.
Requests: the callback time is the accent orange (row and a block at the top of the drawer), and a
hint shows when test requests are hidden.

**Known and accepted:** in a daytime test the offered time and the filed time can differ by a minute
(each computed when called). A real after-hours call computes "next opening plus 8 open hours" both
times, so both say the same.

---

## Session 2026-10-06: Phase 5 replanned onto live Robin; restore point recorded

**Restore point for live Robin: `agtvrsn_3501m3stybwee928ftsgce4qbq7h`** (branch
`agtbrch_8801kwj5qb38f7n966f5375s5ccz`). Given by Tanner and checked against the agent's own
`version_id` on 2026-10-06, before any Phase 5 change. If a Phase 5 change misbehaves, restore this.

**Plan changed (Tanner):** no test agent. Changes go straight onto live Robin, additively, tested on her
real phone line. Why: `Robin — survey test` was a month stale with no phone number, and the preview
broker it was meant to call sits behind Vercel's login. The broker's preview-only switch
(`REQUESTS_FORCE_CLOSED`) and the test-agent list (`REQUESTS_TEST_AGENT_IDS`) are replaced by one
self-expiring test window, `REQUESTS_FORCE_CLOSED_UNTIL`. ElevenLabs workspace secret
`broker_tool_secret` exists (`ISYDstKL9KHPQKLpQVNM`), not yet used by any tool.

**Pinned (Tanner):** the morning email. `RESEND_API_KEY` is set; recipient and sender still open.

---

## Session 2026-10-05 (after merge): Requests verified live; masthead becomes section menus

**Verified live (PR #88, `76fabfa`):** the Requests page loaded through the real broker and database
(screenshot from Tanner: 0 open, empty state), so the PostgREST queries that could not be tested from
the sandbox work. `handoff_option` moved from 503 to 401 after `REQUESTS_TOOL_SECRET` was set, so the
broker has the secret.

**Masthead:** the bar shows four section names, each opening a menu on click (not hover):
**Intake** (Interactions, Requests), **Measure** (Quality, Utilization; was Understand), **Improve**,
**Robin**. Requests needed a place in the bar and the inline links had no room left. Page kickers
follow the new names. Checked in a browser: open, switch, outside click and Escape close, focus returns
to the section, Tab in and out, works on the copied Quality page, one row at 1440 and 390 px, the right
menu opens leftward on a phone, both themes.

---

## Session 2026-10-05 (late night): Requests built end to end, not on any agent yet

**Next session, read this first.** Requests works from the database to the page. Nothing files a
request yet: Robin has neither tool. Next is Phase 5 (its own stop): register the two tools and the two
Data Collection fields on the **test agent** first, against the preview broker with
`REQUESTS_FORCE_CLOSED=1`, then live Robin one change at a time. Then audio (Phase 3).

**Live now:** migration 023 on Supabase `rlhybqslnqhggbykjrqg` (applied 2026-10-05, additive, both
tables empty). Checked on live: RLS on, 0 policies; anon and authenticated cannot execute
`service_request_act`, service_role can; a rolled-back probe showed a duplicate post-call insert is
ignored on `conversation_id`, close works, and an UPDATE on the history is refused by the trigger.
Tables back to 0 rows after the probe.

**Built, goes live on merge (branch `claude/bird-nest-voice-intake-design-uqmom7`):**
- Broker `api/handoff_option.js`, `api/file_request.js` (both need `REQUESTS_TOOL_SECRET`, 503 without
  it), `api/requests.js` (queue, stats, actions; gated in `middleware.js`), `lib/requests.js`,
  `lib/request-link.js`, `lib/tool-secret.js`, `hoursText` and `openMinutesBetween` in `lib/hours.js`.
- **`api/postcall.js` changes on merge, and it is on the live call path.** It now drops calls from any
  agent other than Robin (phone) and Robin (web demo), the only two with rows in `ai_call_events`
  (213 and 13, checked by query). After the call record is stored it links or files a request; that
  step's failure is logged and never returned (tested: request writes failing still gives 200).
- Portal: `/requests` queue and drawer to the mocks, home tile shows open (and overdue) count,
  `/api/requests` added to the proxy map.

**Verified:** broker 191 tests pass under UTC and Asia/Tokyo clocks (16 new in `requests.test.mjs`, a
completeness test that every broker endpoint is either gated or deliberately open, open-minutes and
hours-text tests); portal 50 pass, `next build` clean. The real `api/requests.js` handler ran behind a
faked database with the built portal in front of it: queue, drawer, Reached + note, Close, Reopen state,
transcript drawer and back, dark mode, 390 px with no horizontal scroll, zero console errors.

**Not verified, and why:**
- The broker's PostgREST queries against real PostgREST. The sandbox cannot reach Supabase's REST host
  (proxy 403), so filters were checked against the patterns already in production (`grade.js` `in.()`,
  `utilization.js` `gte.`), not run. First real check: `/api/requests?view=stats` through the portal
  after merge.
- The post-call link on a real payload. The transcript `tool_results` shape was read from live rows,
  but no live call has called `file_request`. Phase 5's test calls are that check.
- Whether ElevenLabs passes `phone_call.external_number` for the test agent the same way (only Robin's
  phone rows were checked: 213 of 213).

**Privacy note:** `callback_number` copies the caller's number (already stored in
`ai_call_events.raw_payload`) into a column shown on the Requests page. Testers call from their own
phones, so this is a real number of a real tester, behind the Birdnest password.

---

## Session 2026-10-05 (night): accounts shelved; cleaner gated (Step 0); Requests tile

**Decision (Tanner):** no accounts and no extra passwords. Four people use Birdnest as a proof of concept;
the shared Vercel password stays and everyone sees everything. `v1-accounts/SPEC.md` is shelved, not deleted.

**Step 0, built, not deployed:** `content-cleaner/cleaner/middleware.js` admits only the portal's
`x-robin-internal` secret (fails closed if unset), 4 tests. Before it reaches production,
`ROBIN_INTERNAL_SECRET` must be set on the `voiceagents-qewy` project (same value as the portal), or the
Factory inside Birdnest goes dark. Verify after deploy from outside: `GET /api/kb_list` must answer 401.

**Requests tile, built:** full-width tile on the home page above Demo Website (a seventh grid tile left it
stranded alone; both layouts were rendered before choosing), linking to a new `/requests` page with an
honest empty state (no sample rows). Verified locally on the production build: portal tests 41/41, build
lists `/requests`, both pages 401 without the password and 200 with it, no horizontal scroll at 390 px.
**Not verified:** the deployed preview.

**Next session**
> Set `ROBIN_INTERNAL_SECRET` on `voiceagents-qewy`, then merge to deploy the cleaner gate and the tile;
> check `kb_list` is 401 from outside and the Factory still loads in Birdnest.

---

## Session 2026-10-05 (evening): Phase 1 design checkpoint (v1 accounts)

Design written to [`v1-accounts/SPEC.md`](./v1-accounts/SPEC.md); nothing built. Grounded in: the portal's
`middleware.js`, proxy and route map; which API each page calls (grep of every module page); Supabase
(0 auth users, RLS on with no policies on all 14 tables, Pro plan).

**Security finding, live:** the content cleaner (`voiceagents-qewy`) has no gate. An unauthenticated
`GET /api/kb_list` returned 200 with 32 KB, and by the code `publish`, `unpublish` and `clean` are equally
open; those were not called. Proposed as Step 0 (gate it with the broker's `x-robin-internal` pattern),
needing its own approval because it is a live deploy. The broker and the portal both answered 401.

**Next session**
> Waiting on the four decisions at the end of `v1-accounts/SPEC.md`, Step 0 first.

---

## Session 2026-10-05 (later): hours confirmed; Phase 4 step 1 built (`lib/hours.js`)

**Hours (from Tanner, for the call center):** Monday to Friday 8 AM to 6 PM Central; Saturday and Sunday
closed, callbacks on Monday; closed on all federal holidays. Volume re-checked against these hours: 16
of 226 stored calls after hours, 1 transferred.

**Built:** `robin-experiment/broker/lib/hours.js` (open/closed, next opening, the callback deadline, the
sentence Robin reads, observed federal holidays) and `test/hours.test.mjs`. Not wired to anything: no
endpoint, no agent, no database. Holidays follow the Federal Reserve (bank) calendar by default; the
federal-employee calendar is a setting. **Verified:** 13/13 under the sandbox clock, `TZ=UTC` and
`TZ=Asia/Tokyo` (so the server's time zone cannot change an answer); broker suite 172 pass, 0 fail, 9
skipped (pre-existing grader tests that need the Anthropic SDK, not installed here). Every expected time
in the tests is a literal Central timestamp with its offset, and the calendar facts behind them (holiday
weekdays, DST dates) were checked against the system calendar, not recalled. Mock footers re-rendered
with the real hours; all four mock deadlines are unchanged.

**Next session**
> Phase 1 (v1 accounts) is next on the critical path. Phase 4 continues in parallel: the migration and
> the two tool endpoints, still unconnected to any agent.

---

## Session 2026-10-05: Phase 0 of the implementation plan

Plan approved 2026-10-04. Results are in [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md) (Phase 0
results). Settled: the caller's number is in every phone call's post-call payload (213 of 213), so the
callback number needs no tool variable; `retention_days: -1` means no retention limit; tool headers
can carry a workspace secret; ElevenLabs redaction covers audio (a new option for compliance).
Corrected: the web widget does ask for recording consent, so the disclosure gap is phone-only.

**Not run, on purpose:** the `system__` variable probe. The test agent shares the production post-call
webhook, so a test call would have written into the live `ai_call_events`, which the approval did not
cover. The design no longer needs it (the webhook links the request from the transcript's tool result),
and `/api/postcall` gets an agent allowlist before any test agent gets new tools. **Blocked by the
sandbox network:** Supabase Storage and Resend; so the throwaway bucket was not created. Those checks,
and the ElevenLabs audio endpoint (no key here), move to the first step of Phases 3 and 6, run from a
deployed preview. No live system was changed this session.

**Next session**
> Waiting on: the decisions table (business and compliance) and one look at the Vercel plan. Then
> Phase 1 (v1 accounts) can start; Phase 4's `lib/hours.js` can start on placeholders in parallel.

---

## Session 2026-10-04: validity pass on both specs and mocks; implementation plan

Re-checked every claim in `requests/SPEC.md`, `audio/SPEC.md`, the mocks and what was said in chat
against the live database, both agents' live config, the code and the Supabase docs. 17 corrections,
all listed with before/after in [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md) (Validity pass);
mocks re-rendered. The ones that change the design: web voice and chat come from a separate agent
(`Robin (web demo)`, 13 of 226) and have no number to call back, so requests are phone-only; the
transcript scrub does not remove member ids (5 digits; it needs 7+) or spoken dates of birth (168 and
159 of 226 conversations; only 4 had anything redacted), synthetic personas so not a real-data leak,
queued as its own task; Supabase's CDN can serve a signed URL past its expiry, so the audio cache uses
a short cache lifetime and delete-to-revoke. Grounding added: 16 of 226 calls were after the
placeholder hours, 1 transferred.

**Next session**
> Get approval on `IMPLEMENTATION-PLAN.md`. Then Phase 0: the decisions table to the business and
> compliance, and the five premise checks, each result recorded here with its artifact.

---

## Session 2026-10-03: after-hours requests designed (no code), call audio scoped

**Design only, nothing built.** The Rangly pattern (a voice call becomes a pending request a person
acts on) applied to Robin, scoped to after hours: Robin cannot transfer, so she files a callback
request, speaks a server-computed deadline (next open plus 8 business hours, a placeholder SLA), and
the call center works a queue in Birdnest that replaces their sticky notes. Spec and approved mocks:
[`requests/SPEC.md`](./requests/SPEC.md), `requests/mocks/`. Pointers added to SCOPE (feature key
`requests`) and SPEC.

**Grounding, from live data:** 226 interactions; 45 transferred, all with a `transfer_reason`, most of
them requests ("ready to request a 401(k) loan and needs specialist to process"). Robin's post-call
webhook already reaches the broker, so the safety net needs no new webhook.

**Found while specifying:**
- `members` has **no phone column**, so "callback to the number on file" has nothing to read. Open
  question in the spec; recommendation is caller ID for the experiment.
- Robin's tool endpoints are open by design; a tool that writes rows needs a shared-secret header.
- Adding Requests to the full masthead wrapped it to three rows. A rep role sees only its grants,
  which makes v1 auth a visible requirement, not only a security one.

**Call audio (specced 2026-10-04: [`audio/SPEC.md`](./audio/SPEC.md), mocks in `audio/mocks/`).** Every stored interaction has `has_audio: true`; live privacy
settings are `record_voice: true`, `retention_days: -1`, `delete_audio: false`; the post-call webhook
has `send_audio: false`. Recommended shape: on first play, the portal fetches the conversation audio
from ElevenLabs server-side, stores it in a private Supabase Storage bucket, and plays from a
short-lived signed URL (seeking works, no function response-size question), with a "who listened"
audit row per play. Transcript turns carry `time_in_call_secs` (224 of 226), so click-a-line-to-seek
is possible. **Compliance flag:** Robin's live first message does not say the call is recorded; the
player widens who can hear recordings, so that question goes to compliance before it ships. (This is
not the settled virtual-assistant disclosure.) **Unverified:** the exact ElevenLabs audio endpoint
and format (docs blocked from this sandbox), and what `retention_days: -1` means.

**Next session**
> Nothing here is built. Before any requests code: v1 auth (accounts, roles, grants, audit) is the
> prerequisite. Then answer the spec's open questions with the business (callback number source, SLA
> clock, hours, inbox). Audio: the first build step is one request to confirm the ElevenLabs audio
> endpoint; before anyone else can listen, compliance answers recording disclosure and who holds
> `call_audio`. Separately, a small fix worth doing now: the transcript scrub misses spoken dates of
> birth (159 of 226 conversations); see `audio/SPEC.md`, Pre-existing finding.

---

## Re-grade of the old no-source interactions (2026-10-02, night)

All 21 interactions graded before the source check existed were re-graded one at a time through the portal, each guarded (the target had to still be in the no-source list). Database totals before and after: score rows 252 to 203, question rows 336 to 274, no duplicate (interaction, key) pairs left; survey answers 226, survey people 33, security flags 4, gap requests 2 and graded interactions 115 all unchanged. Interactions with only no-source rows: 21 to 0.

**The long one:** `conv_2601kzbhe2tre1xbsazqz018rg83` (a 366 s call, 19 questions) first hit the 120 s limit (portal 504, nothing written, old rows intact). After both limits were raised to 300 s it re-graded in 92 s (11 rows to 4, 14,662 in / 9,830 out tokens). Final totals: score rows 196, question rows 259, no duplicate keys, interactions with only no-source rows 0; survey answers 226, people 33, flags 4, gaps 2, graded 115 unchanged. That run took 92 s, under the old limit too, so the 504 means run time varies; 300 s is headroom, not a fix for a fixed cost.

**Real usage, two re-grades:** 14,342 in / 6,388 out tokens, and 12,542 in / 2,420 out. Price per token was not looked up, so the 3-cent estimate on the buttons is still the bill-derived figure.

**Tooling note:** the guard's list lookup from this sandbox failed twice with an empty reply (it refuses rather than guesses); both times the endpoint was fine a minute later.

## Session 2026-10-02 (night): the nest loader and the masthead logo

The supplied nest animation (a nest, three eggs, a bob) is now the portal's loading state, and the nest logo sits beside "Birdnest" in the masthead (`lib/mast.js`, `public/brand/nest-logo.*`; checked light, dark and at 390px, no horizontal overflow).

The loader is one function, `lib/loader.js` `loaderHtml({size,label,dots})`, with its stylesheet at `public/loader/loader.css` and four web-sized images (about 97 KB in all). The Next.js pages render it through `components/NestLoader.js` (Accuracy, Utilization, Interactions) and `app/loading.js` (every server page). The copied module pages get the SAME function: `scripts/copy-modules.mjs` injects its source as `window.rpLoader` plus the stylesheet, so the markup cannot drift. Every use in the module pages is guarded (`typeof window.rpLoader === "function"`), so the standalone broker and cleaner deployments are unchanged. `test/loader.test.mjs` checks the function is self-contained, escapes its label, and that the injection is in the copy script.

Where it shows: Quality, one dark translucent layer over the whole screen (below the masthead, so navigation stays usable) with a single nest floating in it, on first load and whenever a wave or range changes; the 60-second refresh stays silent and cannot remove a layer it did not raise. (First version had a nest in the rail, one in the main column and a light veil on top; replaced because several nests at once read as unprofessional.) Dry Run, the "Thinking" state on each question. Factory, "Cleaning" and the Library (which previously showed nothing until the list arrived: opening it now renders the loader straight away).

**Verified:** local Chromium against the built `public/`, with the metrics API delayed 2.5 s: loader present at 0.9 s, gone at 4 s, veil present and rail dimmed 0.7 s after clicking a wave, removed after the data arrived; Dry Run loader present while the answer was pending and removed after; Library loader present on open. **Not verified:** the preview deployment (this is local), and a real slow network.

## Session 2026-10-02 (evening): Accuracy gets manual controls; Utilization shows its working

**Accuracy** now lists from the whole table, not the newest 100: filter tabs (All, Not graded, Graded, and
Graded, no source when there are any) with whole-table counts, "Show more" paging, a main button that names
what it will do ("Grade the newest 10 not graded"), pick boxes plus "Grade N selected" (max 10), a Grade
button on each ungraded row and in the open interaction, and a one-at-a-time Re-grade with a confirm for
interactions graded without a source. Failures are listed by id. Words around the paid actions live in
`lib/grader-view.js` (tested). `/grader?filter=no_source` deep-links the re-grade list.

**Utilization** says how many interactions were measured (graded against a source) and names the ones
graded before their documents could be read, with a link to re-grade them. Each document opens to its
topics; each topic opens to what it says and what cited it or why nothing did, and each document says how
often Robin read it and used it. The reason text is deliberately modest: a retrieval record places a read
on a document, not a section.

**Design pass, batch 2 (About, Dry Run, Quality).** All three now use the shared page language (mono kicker,
plain 2.1rem heading, lede, square controls). About is a stat row (phone, live version, interactions) over
two plain lists and a short "how she is set up" block; "Calls" is "Interactions". Dry Run drops the
uppercase heading and the rounded pills for the portal's square button; its logic is untouched. Quality
reads at the portal's 1120px in Simple and widens to 1400px only in Advanced, and the masthead follows
through `--rp-w` (set on the page's `body[data-mode="advanced"]`), so the wordmark stays put across pages.
The caption strip's tooltip is right-anchored (narrowing the sheet pushed it past the viewport edge).
Checked against the live survey metrics: no horizontal overflow in Simple from 390px to 1440px.
**Pre-existing, not fixed:** in Advanced the page scrolls sideways at 1440px and 1280px because hidden
tooltip boxes spill past the right edge (identical before this pass: scroll width 1705 at 1440px).

**Known and left:** the portal preview still talks to the PRODUCTION cleaner (no `CLEANER_PREVIEW_URL`
override), so the Knowledge Factory Library's attached/published split only shows after a merge. Dry Run,
Quality and About still carry their old body styling.

---

## Session 2026-10-01 (design pass, batch 1): one masthead, Interactions and Accuracy

**What changed.** The nav now lives in ONE file, `lib/mast.js` (groups, secondary links, markup and CSS),
rendered by `components/Masthead.js` on the Next.js pages and injected by `scripts/copy-modules.mjs` into
Quality, Dry Run and the Knowledge Factory. It used to be hand-copied in three places. Destinations are
grouped by what a person is doing: **Listen** (Interactions), **Understand** (Quality), **Improve**
(Accuracy, Knowledge Factory, Dry Run); Demo Website and About Robin sit quietly on the right. Group
labels sit ABOVE the links, which is what keeps the bar on one row (labels beside the links wrapped it).
Home stays tiles; only names changed. Routes did not change: `/calls` is still `/calls`.

**Renames.** Calls is now Interactions, Question Tester is now Dry Run (labels, tiles, page headings).
The survey module still says "calls" on purpose: renaming it belongs with the chat-respondent work, since
a chat has no phone number to key on.

**Interactions and Accuracy** follow one language: a mono kicker, a plain heading, numbers without boxes,
hairline rows, status as a dot (`lib/interaction-state.js`, unit-tested), channel as a small tag. The dot
means "does this one need me": red for a security flag or failed verification, amber for a hand-off to a
person, green for verified, hollow for unknown. Interactions gains filters (Needs a look, Phone, Web
voice, Web chat, Not graded). Sheet width is 1120 everywhere except Quality's 1400 board; Dry Run and the
survey guide were widened to 1120 with their reading column kept at 820 so the masthead aligns.

**Verified.** Portal tests 19/19 (new: `nav.test.mjs`, `interaction-state.test.mjs`), portal builds, and
every room was screenshotted in light and dark with the masthead measured for alignment (wordmark left
edge equals the page's content edge on all five). **Not verified:** the pages against real `/api/calls`
data (stubbed here), and narrow screens beyond the existing breakpoints.

**Follow-up the same day.** The masthead was lopsided (three unequal groups on the left, a stray pair
stacked on the right). It is now FOUR even groups, right-aligned (Listen, Understand, Improve, Robin),
with the theme switch as two small icons, which also leaves room for Utilization under Understand.
The wordmark is now **Birdnest** with the tagline "all your eggs in one place" in mono under it, and the
way-back pill reads "← Birdnest". Robin stays the name of the agent: the home page, About and the footer
about her still say Robin. Trademark and domain availability for "Birdnest" are unverified.

**Utilization** (`/utilization`, under Understand): the gauge, by document, never used, and asked-with-no-answer.
Design, method and the real numbers are in `robin-experiment/BUILD.md` (Session 2026-10-02, later).

**Not done yet.** Dry Run, Quality and About bodies still carry their old styling (pill buttons, uppercase
titles). That is the next batch.

**Two findings that are not design.** (1) Dry Run answers from `kb_articles` rows in state `published`
(`broker/api/ask.js`). Live, those are the 29 INTRUST articles from July, and ElevenLabs shows them with
NO dependent agents, so they are not attached to Robin. Robin's actual knowledge is five Vertex documents
uploaded straight to ElevenLabs, with no `kb_articles` row. So Dry Run tests knowledge Robin is not
serving, and the Factory Library's "live" counts rows in state `published`, not documents attached to the
agent. (2) The grader already reads which documents Robin retrieved per turn
(`rag_retrieval_info.chunks[].document_id`); that is the data any Utilization measure should start from.

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-10-01 — Channel pill

Calls and Accuracy list rows show a channel pill (Phone, Web voice, Web chat) from the new `channel` field on `/api/calls` (broker `lib/channel.js`). Unknown or missing channel renders nothing. See robin-experiment/BUILD.md for the broker side and what is unverified.

---

### 2026-10-01 — Demo Website door

**What changed (branch, not yet merged):** a sixth home tile, "Demo Website", and a nav entry on every page, both opening `/demo-website/` in a new tab. The page is the Vertex Manufacturing demo site (`projects/vertex-demo-site/site`, source of truth there) copied into `public/demo-website/` at prebuild with root-absolute URLs prefixed, so it is served from the portal's own domain and sits behind the same password. No portal masthead is injected into it, on purpose. Directory and clean-URL rewrites moved into `lib/module-paths.js` (unit-tested; existing module routes unchanged). `.gitignore` gains `public/demo-website/`.

**Verified:** local production build, gate 401/200, all six pages 200, widget script served from the portal origin, other modules unaffected, 8/8 tests. **Not verified:** the live widget (needs ElevenLabs), and the deployed robin-portal build (Vercel must include source files outside the root directory for `vertex-demo-site`, as it already does for the broker and cleaner).

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
