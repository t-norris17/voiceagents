# Implementation plan: after-hours requests and call audio

**Status:** approved 2026-10-04; Phase 0 in progress (results below)
**Written:** 2026-10-04, after a validity pass on both specs and all mocks
**Specs:** [`requests/SPEC.md`](./requests/SPEC.md) · [`audio/SPEC.md`](./audio/SPEC.md)

> Phases 0 to 6. Phase 0 settles the decisions and checks the four unproven premises before any code.
> Phase 1 is v1 accounts, which both features need. Phase 2 is a separate small fix. Then audio (smaller, fewer business inputs), then
> requests in three steps that keep the live agent untouched until the last one. Every phase ends
> with a "built" checkpoint per the repo's working agreement: something to look at, drift named, a yes
> before the next phase.

Effort uses the project-spec scale: **S** under 4 hours, **M** 1 to 2 days, **L** 1 to 2 weeks.

---

## What you are approving

1. **The order below.** v1 accounts first; audio before requests.
2. **Phase 0 now**, including the two small live writes it needs (a throwaway Storage bucket that is
   deleted after the test, and tools added to the unused test agent, not to Robin).
3. **Taking the decisions in Phase 0 to the business and compliance**, worded as below.

Nothing in this plan changes the live Robin agent before Phase 5, and that phase gets its own stop.

---

## Phase 0. Decisions and premise checks (no product code)

**Decisions to collect.** Each one blocks a specific later phase, named in brackets.

| Decision | Who | Recommendation | Blocks |
|---|---|---|---|
| Is a recording notice required on the **phone** line, and where (greeting, carrier, IVR)? The web widget already asks for recording consent; the phone greeting does not. | Compliance | Ask before anyone but the builder can listen | Audio rollout (3) |
| Who holds `call_audio`? | Compliance + you | A short named list | Audio rollout (3) |
| Turn on ElevenLabs redaction (date of birth, account numbers) for transcript **and audio**? It would also redact what our grader and Birdnest read | Compliance + you | Test on the test agent first; decide with compliance | Audio (3), scrub task |
| Call center hours and holidays | Call center | **Answered 2026-10-05:** Mon to Fri 8 AM to 6 PM Central; weekends closed; all federal holidays closed | |
| Callback promise | Business | 8 business hours placeholder | Requests (4) |
| SLA clock stops at first attempt or first contact? | Business | First attempt | Requests page (6) |
| Callback number source for the experiment | You | Caller ID (no phone column exists) | Requests (4) |
| Morning email inbox | Call center | A shared inbox, not a person | Requests (6) |

**Premise checks.** Each is one command or one test call, run once, with the artifact recorded in
`BUILD.md`. Until these pass, the specs treat them as unverified.

| Check | How | Touches |
|---|---|---|
| ElevenLabs audio endpoint and format, for a phone and a web-voice conversation | One authenticated GET each with the broker's key | Read only |
| Supabase Storage serves byte ranges on a signed URL, and the 60 s `cacheControl` behaves as the CDN note says | Upload one small MP3 to a throwaway private bucket, request a range, delete the bucket | **Live project write, reverted in the same step** |
| `system__conversation_id` and the caller's number reach a webhook tool | Add a logging-only tool to `Robin — survey test` (`agent_7401…`, 0 calls in 7 days), make one test call | Test agent only |
| Vercel plan allows two daily crons on the broker | Read the plan in the dashboard (the API returned 403 to this session) | Read only |
| Resend key is live | One test send to the builder's own inbox | Read only, plus one email |

**Done when:** every check above has a recorded result, and the decisions table has an answer or an
explicit "proceed on placeholder".

### Phase 0 results (2026-10-05)

| Check | Result | Evidence |
|---|---|---|
| Callback number available | **Settled, no tool needed.** Every stored phone call carries the caller's number in the post-call payload | `metadata.phone_call.external_number` present in 213 of 213 phone rows |
| `system__` variables on tools | **Not run, and no longer needed.** The test agent shares the production post-call webhook (`4deed01a…`), so a test call would write into the live `ai_call_events`; the approval did not cover that. Design changed instead (below) | `Robin — survey test` config, `workspace_overrides.webhooks` |
| `retention_days: -1` meaning | **Settled: no retention limit** | ElevenLabs API schema, `PrivacyConfig.retention_days`: "-1 indicates there is no retention limit" |
| ElevenLabs redaction and audio | **New option:** redaction applies to "the conversation transcript, audio and analysis", entity types include `dob` and account numbers | ElevenLabs API schema, `ConversationHistoryRedactionConfig.entities` |
| Tool secret headers | **Supported:** request headers can reference a workspace secret | API schema, `request_headers` accepts `ConvAISecretLocator` |
| ElevenLabs audio endpoint | **Open.** API host reachable from the sandbox (401 without a key), but no key is available here | `curl` → 401 |
| Storage byte ranges | **Open.** Supabase Storage host is blocked by the sandbox's network policy, so the throwaway bucket was not created (a write with no way to read the result) | `curl` → blocked |
| Resend key live | **Open.** `api.resend.com` blocked from the sandbox | `curl` → blocked |
| Vercel plan | **Open.** API returns 403/404 for this session | `get_auth_user` 404, env list 403 |
| Recording notice | **Narrowed:** the web widget shows a recording consent before the conversation; the phone greeting has none | web agent `widget.terms_text`; phone `first_message` |

**Design changes from Phase 0**
- `file_request` returns its own `request_id`; the post-call webhook links the request to the call by
  reading that tool result from the transcript, and fills `callback_number` from
  `phone_call.external_number`. Nothing depends on `system__` variables.
- The broker's `/api/postcall` gets an **agent allowlist** (Rangly's adapter already does this) so a
  test agent sharing the workspace webhook can never write into the live table. This is now a
  prerequisite for Phase 5's test-agent step.
- The three open checks move to the first step of the phase that needs them, run from a deployed
  preview (which has the keys and the network), not from this sandbox: audio endpoint and byte ranges
  to Phase 3 step 1, Resend to Phase 6 step 3. The Vercel plan is one look in the dashboard.

---

## Phase 1. v1 accounts (prerequisite for both) (L)

**Design checkpoint written 2026-10-05:** [`v1-accounts/SPEC.md`](./v1-accounts/SPEC.md). Found while
designing: the content cleaner is open to the internet, including `publish`/`unpublish`; gating it is
Step 0 there, with its own approval.

Already scoped in `SPEC.md` ("v1 additions"); this plan only sequences it.

- Supabase Auth with magic link; tables `organisations`, `memberships(user, org, role)`,
  `feature_grants(org, feature_key, enabled)`, `audit_log`.
- Portal middleware resolves session to grants and returns **404** for a route whose feature is off.
  Verified by request, per SCOPE's success criteria.
- The masthead renders only granted links. This also settles the layout problem the mocks surfaced:
  the full bar has no room for a fifth link (measured with the real `mast.js`).
- A minimal Admin page: invite, assign role, toggle features, every change audited.
- `PORTAL_PASSWORD` removed.

**Built checkpoint:** two test accounts in two organisations, one with a feature on and one with it
off, the second getting 404 on the page and its API; audit rows for each step.

---

## Phase 2. (Separate task) transcript scrub fix (S)

Not part of this plan's critical path and queued as its own task: the scrub misses member ids and
spoken dates of birth (168 and 159 of 226 conversations). Synthetic data today, so it is not urgent
for the experiment, but it should land before any real traffic and before reps get transcript access.

---

## Phase 3. Call audio (M)

After Phase 1, and Phase 0's audio checks pass. Rollout beyond the builder waits on compliance.

1. Migration: private bucket `call-audio`, table `call_audio_cache`.
2. `lib/el-audio.js` (fetch from ElevenLabs), unit-tested with a stub.
3. `api/call-audio.js`: channel check, cache-or-fetch, upload with 60 s `cacheControl`, signed URL,
   audit row. Portal route map and broker middleware updated.
4. `CallDrawer.js`: pinned player, turn ticks, seekable timestamped lines, follow-along, nest loader on
   first fetch. No player for web chat.
5. `api/call-audio-sweep.js` daily cron.

**Built checkpoint:** on the preview deployment, a real phone conversation plays, a line click seeks
there, a user without the grant gets 404 by request, an audit row exists per play, and an expired URL
is refused after the cache lifetime. Measured first-play time on the longest stored call (600 s),
reported as a number, not "fast".

---

## Phase 4. Requests backend, not connected to any agent (M)

Safe to build in parallel with Phase 3: nothing here is reachable by Robin yet.

1. **Built 2026-10-05:** `lib/hours.js` with 13 tests (`test/hours.test.mjs`): every case in the
   mocks (Thu 9:14 PM is due Fri 4:00 PM, Sat 9:42 PM is due Mon 4:00 PM), Friday 7 PM due Mon 4:00 PM, daylight saving on both transitions, a listed holiday, a call at 4:59 PM and at
   8:00 AM exactly.
2. Migration: `service_requests`, `service_request_events`.
3. `api/handoff_option.js` and `api/file_request.js`, both requiring a shared-secret header.
   `file_request` takes the caller's name from Data Collection's existing `caller_name` and computes
   `due_at` itself.
4. `api/postcall.js`: an agent allowlist first (only `Robin` and `Robin (web demo)` write rows), then the safety net: after the existing upsert, insert-if-absent for phone calls with a
   `request_type`, never failing the call record.
5. `api/requests.js` (list, log attempt, close; portal-only).

**Built checkpoint:** the test suite, plus a scripted run against the preview broker: file, re-deliver
the post-call webhook, confirm exactly one row; log attempts; close.

---

## Phase 5. Requests on an agent (M), live config, its own stop

1. Wire both tools and the two Data Collection fields to **`Robin — survey test`** first, pointing at
   the preview broker with an hours override that makes "now" after hours.
2. Test calls: loan request, hang-up mid-request, unverified caller, in-hours transfer. Evidence from
   `tool_results` and the rows, not transcripts.
3. **Stop for approval.** Then apply the same to live `Robin` one change at a time: tools, Data
   Collection, then the prompt edit made on the live prompt (with the stale virtual-assistant line
   stripped from anything built from repo prompt files, per `CLAUDE.md`).
4. Confirm the promote landed before the first after-hours call it is meant to cover (timestamps, not
   belief).

**Built checkpoint:** one real after-hours test call on live Robin producing one request whose
`due_at` matches what she said.

---

## Phase 6. Requests page, rep role, morning email (M)

1. `/requests` page and drawer as in `requests/mocks/`, under Listen, behind the `requests` grant.
2. Call center role: Requests and About only; transcript access limited to conversations that filed a
   request.
3. Morning email: two daily crons with a Central-time guard; no email on a zero day.
4. A rep walks through the mocked flow on preview with a real test request.

**Built checkpoint:** the rep's 404s on everything else, by request; the email arrives at open with
the right count; one full request handled end to end and its history correct.

---

## Risks to the plan itself

| Risk | Effect | Mitigation |
|---|---|---|
| Compliance answers slowly | Audio is built but stays builder-only | Phase 3 still ships; the grant is the gate |
| Business does not settle hours and SLA | Robin would speak a placeholder promise | Phase 5 does not go live on placeholders without your explicit yes |
| Storage range check fails | Seeking breaks | Fall back to a range-aware stream through the broker, re-estimated |
| `system__` variables are not passed to tools | Tool and webhook cannot share a key | Robin passes the conversation id from the call context, or the webhook becomes the only writer; re-checkpoint |
| v1 accounts is bigger than L | Both features wait | Phase 4 proceeds meanwhile; it does not need v1 until its API is exposed |

---

## Validity pass (2026-10-04): what was wrong and is now fixed

| Where | Was | Now |
|---|---|---|
| Requests mock, overdue row | "Overdue 22h" (the real gap was 70 hours of clock time, 7 h 10 m of business time) | "Overdue", was due Fri 4:00 PM |
| Requests mock, callback number | "Number on file" (no phone column exists) | "Number she called from" (caller ID) |
| Requests mock, a web-voice request | Possible only on paper: web calls come from a different agent and have no number to call back | Phone; spec scopes v1 to the phone agent |
| Requests mock, rep nav | Showed Interactions, which the spec withholds | Requests and About only |
| Requests mock, footer | Hours and SLA stated as fact | Labelled placeholders |
| Audio mock, transcript | Member id shown as "[redacted]" | Shown, as today's scrub actually leaves it |
| Audio mock, greeting | Paraphrased | Robin's live first message verbatim |
| Audio mock, Interactions page | Invented description and filters | The page's real text and six filters |
| Audio spec, permission argument | "The transcript is scrubbed of member ids" | It is not; the argument now rests on audio being unscrubbable |
| Audio spec, signed URLs | "Stops working after it expires" | CDN can serve past expiry; short cache lifetime and delete-to-revoke |
| Audio spec, byte ranges | Stated as fact | Unverified, Phase 0 check |
| Audio spec, recording | Robin only | Both agents; both greetings quoted |
| Audio spec, timestamps | "224 of 226 transcripts" (checked first turns only) | All 4,378 spoken turns; 2 conversations have no speech |
| Date-of-birth finding | Implied a live PII leak | Synthetic personas; real defect, not a real-data leak; member ids added (168 conversations) |
| Masthead claim | "Adding Requests wrapped it to three rows" (my added user block caused the third) | Measured: the nav drops below the wordmark; font-dependent |
| Requests spec, cron | Hourly | Two daily crons; plan could not be read |
| Chat | "NestEgg U vs Vertex is worth a look" | Accurate as an observation: the phone agent greets as NestEgg U support, the web agent as the Vertex help desk |

**Held up under re-check:** 226 interactions and 45 transfers (32 task, 10 person, 3 verification);
the post-call path for both agents; `members` has no phone column; Birdnest on one shared password;
no `request_headers` on Robin's tools; both agents' privacy settings; mock dates and weekdays; the
deadline math for Dana (Mon 4:00 PM), Priya and the unknown caller (Mon 4:00 PM) and Marcus
(Fri 4:00 PM).

**Still unverified, and where it gets settled:** the ElevenLabs audio endpoint, Storage byte ranges,
`system__` variables on tools, the Vercel plan, the Resend key, what `retention_days: -1` means
(all Phase 0), and that the masthead measurement holds in your browser's fonts (Phase 1).
