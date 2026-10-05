# SPEC — After-hours requests (Birdnest feature)

**Slug:** robin-portal / requests
**Status:** draft (design approved 2026-10-03, not built)
**Last updated:** 2026-10-04 (validity pass)

> When a member calls after hours and needs a person, Robin cannot transfer them. Instead she files a
> callback request, tells the caller exactly when to expect the call, and the call center works the
> request from a queue in Birdnest the next business morning. It replaces the sticky notes the call
> center uses today. The pattern is the same one Rangly uses for voice intake (a call becomes a
> pending request a human acts on); the code and the data stay here.

**Mocks:** [`mocks/queue.png`](./mocks/queue.png) (the queue), [`mocks/drawer.png`](./mocks/drawer.png)
(one request opened), [`mocks/queue-dark.png`](./mocks/queue-dark.png). Rendered from the portal's real
`globals.css` and `lib/mast.js`, synthetic members, Monday 2:10 PM. The stat row's numbers and the
history are illustrative; the hours and the 8-hour promise are placeholders and the page says so.

---

## Scope in brief

**In:** after-hours only. Robin checks whether the call center is open; if it is not, she files a
request instead of transferring. A morning email tells the call center how many are waiting. Reps
call back in Talkdesk and log the outcome in Birdnest.

**Phone only.** Web voice and web chat come from a different agent, `Robin (web demo)`
(`agent_0101m3sjqvfyejsa9kn127ez26mm`, 13 of 226 stored interactions), and a web caller has no phone
number to call back. v1 changes the phone agent only (`Robin`, `agent_8301kwj5qa8ve1atremxxwjjp9f8`).

**Out (until they actually show up):** in-hours cases where a transfer fails, the queue is full, or a
type of work is never taken live. Robin's in-hours behavior does not change. No Talkdesk
integration. No Rangly dependency.

**Success criteria**
- [ ] An after-hours test call that asks for a loan produces exactly one request, with the deadline
      Robin spoke matching `due_at` to the minute, verified by reading the row and the transcript.
- [ ] A caller who hangs up mid-request still produces a request (post-call safety net), and a
      request filed by the tool is never duplicated by the webhook.
- [ ] An in-hours test call still transfers. `get_handoff_option` returns `transfer`, verified in
      `tool_results`, not the transcript.
- [ ] A rep account sees Requests and cannot reach Accuracy, Knowledge Factory or Dry Run (404 by
      request, not by menu).
- [ ] The morning email arrives at open with the right count, and does not send on a day with zero.

## What is true today (checked 2026-10-04)

- **Volume.** 226 stored interactions, latest 2026-10-02. 45 transferred: 32 to get a task done (loan,
  contribution change, beneficiary, distribution, access), 10 asking for a person with no task named,
  3 after failed verification. With the confirmed hours (weekdays 8 AM to 6 PM Central), **16 of 226
  calls were after hours and 1 of those transferred**, so "rare" holds, though testers called when
  asked to, which is not real traffic.
- **The post-call path works for both agents.** Both use the same post-call webhook
  (`4deed01a…`, `send_audio: false`), and each agent's latest call has a row in `ai_call_events`.
- **Robin's webhook tools carry no request headers today** (`verify_caller`, `get_balance` and two
  NestEgg-era tools, `send_reset_email` and `document_resolution`, all `request_headers: {}`). No tool
  uses a `system__` dynamic variable yet, so that mechanism is unproven on this agent.
- **Data Collection already has `caller_name` and `subject_ref`.** The request can take the caller's
  name from there instead of a new field.
- **The caller's number is in every phone call's post-call payload** (`phone_call.external_number`,
  213 of 213 phone rows), so the callback number does not depend on a tool variable.
- **The test agent shares the production post-call webhook**, so `/api/postcall` needs an agent
  allowlist before any test agent gets these tools.
- **`members` has no phone column**, and member ids are 5-digit numbers. Testers use shared synthetic
  personas (no real account data in `members`).
- **Birdnest is still on one shared password** (`app/middleware.js`, `PORTAL_PASSWORD`).

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | JavaScript (ESM) | Matches broker and portal |
| Runtime | Broker (`voiceagents`) for the two tools and storage; portal (Next.js) for the page | Robin's call path already lives on the broker; the portal only reads and proxies |
| Key libraries | None new | |
| Storage | Supabase `rlhybqslnqhggbykjrqg`: two new tables | Same database as `ai_call_events` |
| Scheduler / trigger | Two daily Vercel crons (13:00 and 14:00 UTC); each sends only if it is the opening hour in Central time on a business day | Cron is UTC, so one of the two lands on 8 AM Central in each half of the year. Daily-only schedules work on any Vercel plan; the account's plan could not be read |
| Outputs / delivery | Birdnest `/requests`; one email to a shared call center inbox via Resend | Resend is already used in this account (nestegg-u-demo's README, key in the "Lumio Retirement" project); whether that key is live is unverified |

## Architecture

```
caller ── Robin (ElevenLabs) ───────────────────────────────────────────────────────────────
           │ needs a person
           ├─► get_handoff_option  (broker)  hours config ─► { mode: transfer | request,
           │                                                    callback_by_text, due_at }
           │     transfer ─► transfer_to_number (unchanged)
           │     request  ─► Robin collects + reads back ─► file_request (broker)
           │                                                   └─► service_requests (source=tool)
           │                                                   └─► service_request_events (filed)
           └─ call ends ─► /api/postcall (broker, existing)
                               └─► ai_call_events (unchanged upsert)
                               └─► if request_type set AND after hours AND no row yet:
                                     service_requests (source=postcall, ON CONFLICT DO NOTHING)

cron at open ─► count open requests ─► email "N after-hours requests waiting" ─► link to Birdnest

rep ── Birdnest /requests ─► /api/requests* (proxy, rep identity attached) ─► broker
          log Reached / Voicemail / No answer, Close ─► service_request_events (append-only)
```

**`get_handoff_option` decides; the prompt does not.** Hours, timezone, holidays and the callback
promise (8 business hours) are config in the broker (`lib/hours.js`). The tool returns the deadline
already computed and phrased ("by Monday at 4 PM Central"), and Robin reads it. A model is unreliable
at timezone and business-hour math, and an hours line in the prompt goes stale the first holiday.
Every call to it is also a record of when the call center was unavailable, which is how "rare" gets
measured.

**`file_request` is the primary writer, the post-call webhook is the safety net.** Robin says "it's
filed" only after the tool succeeds, so she never promises something that has not happened. A caller
who hangs up first is caught by the webhook, from Data Collection fields `request_type` and
`request_detail`. Both key on `conversation_id`; the webhook inserts only when no row exists, so the
details the caller confirmed out loud always win. `due_at` is recomputed server-side in both paths;
nothing the model passes sets the deadline.

**A request is a callback, not an instruction.** The rep re-verifies whoever answers before
discussing the account. If Robin's verification ever slips, a "process my loan" filed by an impostor
dead-ends at a person's identity check. Unverified callers can still file; the row says so and the
page tags it.

**Facts and workflow are separate**, as `gap_requests` already does for `call_questions`: the call's
facts stay in `ai_call_events`; the request and its history live in their own tables.

## Data model (new migration, broker `supabase/`)

`service_requests`: one row per conversation.
`id`, `conversation_id` (unique), `source` (`tool` | `postcall`), `request_type` (loan, distribution,
contribution_change, beneficiary, account_access, speak_to_person, other), `request_detail`,
`subject_ref` (null if unverified), `caller_name` (from Data Collection), `verified` bool, `callback_number`, `callback_number_source`
(`on_file` | `caller_id`), `callback_window` (free text, "mornings"), `promised_text` (the sentence
Robin read), `filed_at`, `due_at`, `status` (`open` | `closed`), `closed_at`, `closed_by`, `plan_id`.

`service_request_events`: append-only history, which doubles as the audit trail.
`id`, `request_id`, `at`, `actor` (`robin` | `system` | a portal user id), `kind` (`filed`, `emailed`,
`reached`, `voicemail`, `no_answer`, `note`, `closed`), `note`.

Derived, never stored: first attempt = earliest `reached | voicemail | no_answer` event.
Dot: **red** past `due_at` with no attempt; **amber** due today with no attempt; **green** first
attempt at or before `due_at`; a first attempt after `due_at` shows "called back late". The SLA clock
stops at the first attempt (see open questions).

## Robin changes (live agent, compliance-gated)

- Two webhook tools, `get_handoff_option` and `file_request`, each with a shared-secret header. The
  existing tool endpoints are open by design (`broker/middleware.js`), which is fine for reads; a tool
  that WRITES rows must not be callable by anyone with the URL.
- Prompt: when a caller needs a person, call `get_handoff_option` first; on `request`, collect what
  they need and a callback window, read it back, call `file_request`, then read `callback_by_text`.
- Data Collection: add `request_type` and `request_detail` for the safety net.
- **Guardrail:** any prompt built from `robin-system-prompt.txt` or `survey/robin-prompt-WITH-survey.txt`
  must have the stale virtual-assistant line stripped first (see repo `CLAUDE.md`). Read the live
  prompt from the agent, edit that, never push the repo file.

## Birdnest changes

- `/requests` page under Listen, as mocked: stat row (Open, Overdue, Due today, Done this month,
  Median to first callback), filters (Open, Unverified, Done, All), rows sorted by `due_at`, a drawer
  with what they need, what Robin promised (verbatim), the callback number, the verify warning,
  Reached / Left voicemail / No answer, a note, Close, history, call summary and transcript link.
- **Access (decided 2026-10-05):** anyone who can open Birdnest, behind the one shared password. The
  home page has a full-width Requests tile; `/requests` exists with an honest empty state until Robin
  files requests. The role and grant design below is shelved with v1 accounts.
- (Shelved) Feature key `requests`, granted to a call center role. A rep's masthead shows only what they are
  granted: Requests and About. Measured with the real `mast.js`: the full bar has no room for a
  fifth link (with Requests added, the nav drops below the wordmark at 1440 and 1280 px, in the
  sandbox's fonts), and a rep should not see Accuracy or the Factory anyway. The admin's full bar
  needs a layout decision when Requests lands (build step).
- Transcript access for reps: only for conversations that filed a request, through the drawer link.
  Not the full Interactions list (narrower than the `call_transcripts` grant).

## File / folder structure

```
robin-experiment/broker/
  api/handoff_option.js       # get_handoff_option tool
  api/file_request.js         # file_request tool
  api/requests.js             # list + log attempt + close (portal-only, X-Robin-Internal)
  api/requests-digest.js      # cron: morning email
  api/postcall.js             # + safety-net insert (after the existing upsert, never failing it)
  lib/hours.js                # hours, holidays, deadline math (unit-tested)
  supabase/0xx_service_requests.sql
robin-portal/
  requests/SPEC.md            # this file
  requests/mocks/*.png
  app/app/requests/page.js
  app/lib/upstreams.js        # + /api/requests
  app/lib/mast.js             # + Requests under Listen, filtered by grant (v1)
```

## Integrations

| Integration | Purpose | Auth method | Status |
|---|---|---|---|
| ElevenLabs agent | Two tools, prompt edit, two Data Collection fields | Dashboard / API | Not started |
| Supabase | Two tables | Service key in broker | Not started |
| Resend | Morning email | `RESEND_API_KEY` (exists in another project; copy to broker) | Not started |
| Portal v1 auth | Rep identity on every write, role-filtered nav | Supabase Auth magic link | **Prerequisite, not built** (portal is still one shared `PORTAL_PASSWORD`) |

## Key decisions

- **Native to Birdnest, not routed through Rangly.** The rows carry verified member identity in a
  regulated setting; Rangly is a separate product and database. The pattern carries over, the data
  does not.
- **After-hours only in v1.** In-hours edge cases wait until they actually occur.
- **Deadline is server-computed and spoken verbatim.** Next open plus 8 business hours, one config
  value until the business sets the real SLA.
- **Two writers, one key.** Tool first (confirmed with the caller), webhook as the net; the webhook
  never overwrites.
- **Morning email, not real-time alerts.** After-hours requests accumulate overnight and are worked
  at open; reps do not need another app open all day, they need one nudge at the start of the shift.
- **Postcall stays persist-first.** The safety-net insert runs after the existing upsert and its
  failure is logged, never returned as an error, so a request bug cannot cost a call record.
- **v1 auth ships first.** Reps change state on member requests; a shared password cannot say who.

## Open questions

- [ ] **Where does the callback number come from?** `members` has no phone column (checked in the live
      database: id, member_id, dob, first_name, plan_name, balances, loan, deferral, consent). The
      mock uses the caller-ID option. Options: caller ID from the call metadata (labelled
      "number they called from", always available), or a phone column on `members` (real tester PII,
      a schema change). Recommendation: caller ID for the experiment, the recordkeeper's number in
      production.
- [ ] **When does the SLA clock stop: first attempt or first contact?** Recommended first attempt; a
      business decision. It changes the green dot.
- [x] **Business hours** (confirmed 2026-10-05): Monday to Friday, 8 AM to 6 PM **Central**; Saturday
      and Sunday closed (callbacks on Monday). With these hours 16 of 226 stored calls were after
      hours, 1 transferred. Built as config in `broker/lib/hours.js`.
- [x] **Holidays:** closed on all federal holidays. Built with the Federal Reserve (bank) calendar:
      a Sunday holiday moves to Monday, a Saturday holiday does not close the Friday before. The
      federal-employee calendar (which does) is one setting away. Inauguration Day is not included.
- [ ] **Callback SLA.** 8 business hours is a placeholder until the business sets it.
- [ ] **Which inbox gets the morning email?**
- [ ] **Binding `subject_ref` to the call.** `file_request` takes the `subject_ref` Robin got from
      `verify_caller`. A server-side check that the same conversation actually verified that member
      would stop a model mistake from attaching a request to the wrong person. Needs a record of
      verify_caller results by conversation, which does not exist today.
- [x] ~~`system__` variables on tools~~ No longer needed (Phase 0): `file_request` returns a
      `request_id`, and the post-call webhook links it to the conversation from the transcript's tool
      result and fills the callback number from `phone_call.external_number`.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Robin promises a deadline the call center cannot meet | Medium | Deadline comes from config the call center signs off; the drawer shows the verbatim promise so a late callback can own it |
| `file_request` endpoint abused to fill the queue | Low | Shared-secret header on the tool; rate limit per caller number |
| Hours config wrong on a holiday, so Robin transfers to an empty line | Medium | Holidays in config with a test per listed date; `get_handoff_option` calls are logged and visible |
| Queue ignored because it is rare | Medium | Morning email at open; overdue count on the Birdnest home tile |
| Wrong member attached to a request | Low | Rep re-verifies on callback by rule; `subject_ref` binding (open question) |

---

*Spec last updated: 2026-10-04*
