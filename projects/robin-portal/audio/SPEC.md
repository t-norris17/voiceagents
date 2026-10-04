# SPEC — Call audio in the interaction drawer (Birdnest feature)

**Slug:** robin-portal / audio
**Status:** draft (design written 2026-10-04, not built)
**Last updated:** 2026-10-04 (validity pass)

> Press play on any voice interaction in Birdnest and hear the call, with the transcript following
> along: the line being spoken is highlighted, and clicking any line jumps the audio there. No trip to
> the ElevenLabs dashboard. The recording already exists at ElevenLabs; this feature brings it into the
> portal under the portal's own permissions and audit.

**Mocks:** [`mocks/player.png`](./mocks/player.png), [`mocks/player-dark.png`](./mocks/player-dark.png).
The existing Interactions drawer (`app/components/CallDrawer.js`), rendered with the portal's real
stylesheet, with the player added. Synthetic call; the greeting is Robin's live first message verbatim,
and the member id shows in the transcript because today's scrub does not remove it (see Pre-existing
finding).

---

## Scope in brief

**In:** a player in the interaction drawer for phone and web-voice interactions, transcript sync, a
separate `call_audio` permission, a log of every listen, and a short-lived copy of the audio on our
side.

**Out:** web chat (there is nothing to hear), downloads, audio redaction, clipping or sharing a
segment, playback on the Requests page (a later decision; see open questions).

**Success criteria**
- [ ] Clicking play on a phone interaction plays it within a few seconds on first play and
      immediately after that, verified on a real conversation id against the preview deployment.
- [ ] Clicking a transcript line seeks to that line's `time_in_call_secs`, and the highlighted line
      tracks playback.
- [ ] A user without `call_audio` gets a 404 from the audio route by request (not just a hidden
      button), and a user with it gets a URL that stops working after it expires, tested past both the
      token expiry and the object's cache lifetime (see the CDN note below).
- [ ] Every play writes one audit row naming the user, the conversation and the time.
- [ ] Web chat interactions show no player.

## What is true today (checked 2026-10-03/04)

- **The audio exists, from two agents.** Phone calls come from `Robin` (213 stored interactions); web
  voice and web chat come from `Robin (web demo)` (13). Both have `record_voice: true`,
  `retention_days: -1`, `delete_audio: false`, `zero_retention_mode: false`. Every one of the 226 stored interactions reports
  `has_audio`, `has_user_audio` and `has_response_audio` true.
- **`has_audio` is not a reliable "is there audio" signal.** The 7 web-chat interactions
  (`metadata.text_only = true`) also report `has_audio: true`. The player is shown by **channel**
  (`broker/lib/channel.js`: phone 213, web voice 6, chat 7), not by that flag.
- **The drawer already gets timestamps.** `/api/survey-call` returns each turn's `at` from
  `time_in_call_secs`. All 4,378 spoken turns across the 224 conversations that have speech carry it
  (the other 2 have no spoken turns). Transcript sync is front-end work only.
- **The post-call webhook does not send audio** (`send_audio: false` on the agent's webhook override).
- **The broker already calls the ElevenLabs API** with `ELEVENLABS_API_KEY` and the `xi-api-key`
  header (`broker/lib/kb-text.js`, `broker/lib/robin-live.js`). That the key is set in production is
  inferred (the grader read dashboard documents on 2026-10-02, which needs it); the project's env vars
  could not be listed (403).
- **No Supabase Storage bucket exists yet** in project `rlhybqslnqhggbykjrqg`. This would be the first.
- **Calls are capped at 600 s** (`max_duration_seconds`); median 188 s.

## Why audio needs its own permission

The transcript is meant to be scrubbed: `broker/api/survey-call.js` removes digit runs from what the
caller said because "storing it in a transcript that a dozen people will open in a browser is not"
acceptable. **Today that scrub mostly misses** (see Pre-existing finding): member ids and spoken dates
of birth pass through. But a transcript scrub can be fixed; **audio cannot be scrubbed at all.** Every
verified call has the caller reading their member id and date of birth aloud, and the caller's own
voice and name are real even where the account data is synthetic. So audio gets its own feature key,
**`call_audio`, default off**, granted separately from `call_transcripts`.

## Architecture

```
drawer ── click play ─► portal /api/call-audio?id=conv_…   (proxy, adds X-Robin-Internal + user)
                              │
                              ▼
                        broker api/call-audio.js
                          1. channel is phone or web voice, else 404
                          2. object call-audio/<conversation_id>.mp3 in our private bucket?
                               no ─► GET ElevenLabs conversation audio (server key)
                                     ─► upload to the bucket
                          3. signed URL, 5 minutes
                          4. audit row (user, conversation, at)
                          5. respond { url, expires_at }   ← JSON, never audio bytes
                              │
drawer <audio src=url> ◄──────┘   plays straight from Supabase Storage (byte ranges, so seeking works)
```

**Fetch on first play, then cache.** The first play of a call fetches it from ElevenLabs and stores it
in a private bucket; later plays skip ElevenLabs. Nothing is copied for calls nobody opens, and nothing
is added to the call path.

**The route returns a link, not the audio.** The browser plays from a short-lived signed Storage URL.
That Storage serves byte ranges (which seeking needs) is expected but **unverified**: the Supabase docs
search did not cover it, so it is checked in the first build step.

**CDN note (from the Supabase docs).** With Smart CDN, a cached response to a signed URL can keep being
served after the token expires, until the object's cache lifetime ends; "if you need to cut off access
to an asset, delete the object." So the cache objects are uploaded with a short `cacheControl`
(60 seconds), and revoking access means deleting the object, not waiting for the token. Passing the file through a serverless
function would have to rebuild that, and runs into the function response size limit (I could not
confirm Vercel's current figure; the design does not depend on it).

**Our copy is a cache, ElevenLabs is the record.** A daily job deletes any cached file not played in 30
days; the next play fetches it again. That keeps a second copy of members' voices to only what people
are actively listening to. A deletion request for a member must also clear the bucket (the job can
take a conversation id).

## Rejected alternatives

- **Turn on `send_audio` on the post-call webhook.** That pushes megabytes of audio per call through
  `/api/postcall`, the endpoint that records every call, for calls nobody will play, and it changes the
  live agent's webhook.
- **Proxy the audio bytes through the portal on every play.** Breaks seeking without range handling,
  hits ElevenLabs on every play, and leans on the function response size limit.
- **Link out to the ElevenLabs dashboard.** That is what we are replacing, and it needs a dashboard seat
  with access to the whole workspace.

## The player (as mocked)

- Sits under the drawer header and stays pinned while the transcript scrolls.
- Square play/pause in ink, elapsed time, a bar in the utilization gauge's style (ink outline, accent
  fill, a thin playhead), total time, and a speed toggle (1×, 1.5×, 2×).
- **Tick marks under the bar for every turn; caller turns are darker,** so the questions can be found
  by eye.
- Each transcript line gets its timestamp in mono on the left. Clicking a line seeks there. The line
  being spoken gets the accent rule and a faint accent wash.
- "Following along" keeps the current line in view while playing and turns off when the user scrolls.
- The note line says "this listen is logged". People behave better when they know, and it is true.
- First play shows the nest loader ("Fetching the recording") while the broker fills the cache.
- No player for web chat. If the audio cannot be fetched, the drawer says so in one line and the
  transcript is unaffected.

## Data model

- Bucket `call-audio`, private, created by migration. Object key `<conversation_id>.mp3` (the
  conversation id is already the join key everywhere).
- Plays are logged to the portal's v1 `audit_log` as `audio.play` with the conversation id. If v1's
  audit log does not exist yet when this is built, that is the blocker, not something to work around.
- Cache bookkeeping: `call_audio_cache(conversation_id, bytes, fetched_at, last_played_at)`, so the
  cleanup job and the "how much are we holding" question are one query each.

## File / folder structure

```
robin-experiment/broker/
  api/call-audio.js         # the route above (portal-only: X-Robin-Internal; added to middleware)
  api/call-audio-sweep.js   # daily cron: delete cache entries idle for 30 days
  lib/el-audio.js           # fetch conversation audio from ElevenLabs (unit-tested with a stub)
  supabase/0xx_call_audio.sql   # bucket, cache table
  vercel.json               # maxDuration for call-audio (fetch + upload of up to 10 minutes of audio)
robin-portal/
  audio/SPEC.md · audio/mocks/
  app/app/components/CallDrawer.js   # player + seekable transcript
  app/lib/upstreams.js               # + /api/call-audio
```

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| ElevenLabs conversation audio API | Source of the recording | `ELEVENLABS_API_KEY` (already on the broker) | **Endpoint unverified** (see open questions) |
| Supabase Storage | Private cache, signed URLs | Service key in broker | First bucket in the project |
| Portal v1 auth | `call_audio` grant, user identity for the audit row | Supabase Auth | **Prerequisite, not built** |

## Key decisions

- **`call_audio` is its own grant, default off.** The transcript scrub cannot apply to a voice.
- **Fetch on first play into a private cache; play from a 5-minute signed URL.** Seeking works, nothing
  touches the call path, and no file is copied for calls nobody opens.
- **The cache expires after 30 days without a play.** ElevenLabs stays the record of the recording.
- **Every play is logged** with who and when, and the player says so.
- **Show the player by channel, not by `has_audio`.** The flag is true for chats too.
- **v1 auth ships first.** A shared password cannot grant audio to some people and not others, or say
  who listened.

## Compliance gate (before anyone but the builder can listen)

- **Recording disclosure.** Neither agent's live first message tells callers the call is recorded
  (phone: "Thank you for calling NestEgg U support — this is Robin…"; web: "Hi, this is Robin with the
  Vertex Manufacturing 401(k) help desk…"), and neither prompt instructs a notice. The
  recording already exists; the player widens who can hear it. This question goes to INTRUST
  compliance before the grant is given to anyone else. It is separate from the settled
  virtual-assistant decision in the repo `CLAUDE.md`, which this spec does not revisit. Unknown:
  whether a carrier or number-level greeting plays a notice before Robin answers.
- **Who may hold `call_audio`.** A short list of named people, decided with compliance.

## Pre-existing finding (not part of this feature)

The transcript scrub removes almost nothing from what callers say. Its patterns (`survey-call.js`,
the `PII` list) catch SSN-shaped numbers, runs of **7 or more** digits, phone and card numbers. Member
ids are **5 digits**, and dates of birth are spoken as words. Applying the scrub's own patterns to the
live table: **168 of 226 conversations still show a valid member id** in the caller's words, **159
show a date-of-birth-like phrase**, and only **4 conversations had anything redacted at all**. The
Interactions page tells readers "The caller's personal details are scrubbed from the transcript",
which is not true today.

Severity, measured: the identities are the synthetic personas from the tester call cards (`members`
holds no real account data, per `robin-experiment/BUILD.md`), so this is not a leak of real member
data today. It becomes one the moment real members call. Fix: add the member id format and spoken
and numeric dates to the scrub, with a test per pattern, and re-run the count above. Small, separate
from audio, and worth doing before any production traffic.

## Open questions

- [ ] **Does Supabase Storage serve byte ranges on signed URLs?** Needed for seeking; unverified.
- [ ] **The ElevenLabs audio endpoint and format.** Believed to be `GET /v1/convai/conversations/{id}/audio`
      returning MP3, from memory; the docs were unreachable from the build sandbox. One request with the
      broker's key settles it, and it is the first step of the build.
- [ ] **What `retention_days: -1` means**: keep forever, or the workspace default? If ElevenLabs can
      delete before our cache expires, "fetch again" stops working for old calls.
- [ ] **Web-voice audio.** The 6 web-voice interactions report audio; confirm the endpoint returns it
      for widget conversations, not only phone.
- [ ] **Should reps hear the call behind a request** on the Requests page? Useful before a callback,
      but it means granting `call_audio` to the call center role. Compliance decision.
- [ ] **Does ElevenLabs' own redaction cover audio?** The agent has `conversation_history_redaction`
      (off). If it can redact entities in audio, it would change the sensitivity argument. Unverified.
- [ ] **Recording disclosure** (above).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Recordings with spoken member ids reach people who should not hear them | Medium | Separate default-off grant, named holders, audit row per play, 5-minute URLs |
| A signed URL gets pasted into a chat | Low | 5-minute expiry; the audit row shows who requested it |
| First play is slow on a 10-minute call | Medium | Nest loader with a label; measure on the longest stored call (600 s) before calling it acceptable |
| ElevenLabs deletes audio we still link to | Low | Retention question above; the drawer reports "recording no longer available" instead of failing silently |
| Cache grows without bound | Low | 30-day idle sweep; `call_audio_cache` makes the total one query |

---

*Spec last updated: 2026-10-04*
