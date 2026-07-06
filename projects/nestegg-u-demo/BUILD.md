# BUILD LOG — NestEgg U Password-Reset Voice Demo

**Slug:** nestegg-u-demo
**Started:** 2026-07-01
**Status:** active

> Re-badged from `lumio-retirement-voice` on 2026-07-02. Earlier sessions (1–5) below predate the
> rename and still reference the old slug/paths — kept as the historical record.

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-07-06 — Session 8

**Time spent:** ~a full session
**Status after session:** ahead — agent built end-to-end in ElevenLabs; demo-ready pending rehearsal

**What we did:**
- Built **Robin** in the ElevenLabs dashboard end-to-end: voice, identity-gated two-topic system
  prompt (plan-agnostic), first message, the 4 webhook tools + transfer + skip-turn, RAG on the
  Vertex plan KB, `get_plan_details`, and the account-recovery + plan-Q&A procedures.
- Wired the **post-call webhook → end-of-call report email** (via Resend) and added Data Collection
  fields (`intent`, `outcome`, `auth_outcome`, `transfer_reason`, `caller_sentiment`, `plan_topic`,
  `reset_completed`, `login_step_coached`, `notes`).
- Added the **plan Q&A** capability (Vertex 401(k) KB + `get_plan_details`) and the multi-tenant
  (150-plan) design note in `phase2/`.
- Built an interactive **contact-center dashboard** (artifact) grounded in ElevenLabs post-call fields.
- Tuned latency/warmth: Gemini 2.5 Flash, temp 0.53, RAG trim (8k chars / 5 chunks), soft-timeout
  guidance, voice settings.
- Consolidated `demo-script.md` into the 4-scenario master script (reset, plan Q&A, no-email
  transfer, failed auth).

**What broke / surprised us (fixed):**
- verify_caller failed on phone ASR (spoken/word digits) → robust DOB + number-word parsing.
- Vercel deploy failed on a leftover `vite build` → `vercel.json`.
- Agent leaked the plan name pre-verification → identity gate.
- Latency from RAG defaults (50k chars / 20 chunks) + RAG had been left OFF → trimmed + enabled.
- Spoken audio tags ("Acknowledge") + terse plan answers → prompt rules (no stage directions; warm
  follow-up). Skip-turn vs soft-timeout garble → turn soft timeout off now that latency's fixed.

**Decisions made:**
- Plan rules → KB/RAG; personal figures → `get_plan_details` tool; prompt stays plan-agnostic.
- Post-call report via the real post-call webhook (not a tool); HMAC verification deferred to prod.

**Next session:**
> **Rehearse + record.** Apply the last prompt lines (no audio tags; warm follow-up) and turn Soft
> Timeout OFF, then run all four scenarios in `demo-script.md` on the Twilio line and confirm the
> post-call report email lands after each. **Record a clean screen+audio backup of Scenario 1** (and
> ideally Scenario 2) before Tuesday — never demo live without it. Nice-to-haves if time: eval
> criteria for the dashboard QA tab, commit the dashboard to the repo.

---

### 2026-07-02 — Session 7

**Time spent:** ~2 hrs
**Status after session:** ahead — backend deployed & live; agent build underway

**What we did:**
- **Deployed the mock backend to Vercel and verified it end-to-end** — Resend sends the reset
  email to `DEMO_EMAIL`, and the themed `/reset` page loads. Live at
  `https://lumio-retirement.vercel.app` (`/reset` + `/api/poc/*`).
- Themed the reset page to **nesteggu.com** (orange CTAs, NestEgg U wordmark, sky/clouds) from
  the live-site screenshots.
- Opened & merged **PR #1** (the demo build) and **PR #2** (`mock-backend/vercel.json` to skip
  the leftover `vite build` that was failing the deploy).
- Started the **ElevenLabs agent build** from `elevenlabs-poc-setup.md`.

**What broke / surprised us:**
- First Vercel deploy failed with `vite: command not found` — the "Lumio Retirement" project was
  a former Vite app and still carried a `vite build` command. Fixed with a repo `vercel.json`.
- Design tweak: the agent now opens with a **generic greeting**, and the caller's stated problem
  ("I can't get into my account") triggers the Account Recovery procedure — verification is the
  procedure's first step, not the agent's opening line. Updated the prompt, talk track, procedure.

**Decisions made:**
- Reset flow deploys to the existing **Lumio Retirement** Vercel test project (env vars live there).
- Greeting-first, intent-triggered procedure (above).

**Next session:**
> Finish the ElevenLabs agent: register the 3 webhook tools against the live URLs + the transfer
> tool (target 316-680-7638), attach the free-form procedure + triggers, upload the KBA, set
> voice + conversation-flow toggles (Skip turn, ~25s take-turn-after-silence) + post-call Data
> Collection, and import the Twilio 833 number. Then rehearse both branches (happy path +
> no-email transfer) and record the Monday backup. Keep Vercel Deployment Protection OFF so the
> emailed link + webhooks stay publicly reachable.

---

### 2026-07-02 — Session 6

**Time spent:** ~1 hr
**Status after session:** on track — repo reorganized, skill installed, demo scope locked, SPEC written

**What we did:**
- Reorganized the flat repo into the documented layout: `docs/` + `projects/nestegg-u-demo/`
  (+ `phase2/`), preserving history with `git mv`; fixed the broken README/CLAUDE links.
- Installed the missing **`project-spec` skill** at `.claude/skills/project-spec/` (SKILL.md +
  the three templates) so the repo matches its own docs.
- **Locked the demo scope** to Tanner's target workflow (email reset-link flow) and wrote a
  demo-focused **`SPEC.md`**; moved the old program-level spec to `phase2/PROGRAM-SPEC.md`.
- **Block 2+3 (assets):** reconciled every demo asset to the locked flow —
  `poc-mock-tools.js` (auth → SSN+DOB, `has_email_on_file` branch, Resend wired, 2nd no-email
  identity), `demo-script.md`, `procedure-password-reset.md`, `elevenlabs-poc-setup.md`,
  `START-HERE.md` — and built the **mock reset page** (`reset-page/index.html`) that reproduces
  the "click Log In first" quirk and enforces the 12-char rule.

**What broke / surprised us:**
- Tanner's target flow is the **email-link** variant — reversing the earlier session's lean
  toward guided self-service. Consequence: the emailed link can't point at the live NestEgg site
  (it's self-service, no emailed link), so we'll build a **mock `/reset` page** that reproduces
  the "click Log In first" quirk.

**Decisions made:**
- Auth = **SSN last-4 + DOB**. Delivery = **Resend** → `DEMO_EMAIL`. Password rules = **12+ chars
  incl. numbers + symbols**. No-email branch = **"connect you to a specialist" → real
  `transfer_to_number`** to the presenter's demo phone (stored as `DEMO_TRANSFER_NUMBER` in env /
  dashboard config, **not** in the repo).
- `verify_caller` returns `has_email_on_file` to drive the send-vs-transfer branch.

**Next session:**
> **Blocks 2 + 3 are done in-repo.** Next is **deployment + the ElevenLabs build**, which happen
> outside this repo: (1) deploy the **`mock-backend/`** folder to the scratch Vercel project
> (steps in `mock-backend/README.md`), set env (`DEMO_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM`,
> `RESET_PAGE_URL`), and test that a real reset email lands in `DEMO_EMAIL`; (2) build the agent
> in the **ElevenLabs
> dashboard** from `elevenlabs-poc-setup.md` — voice A/B, paste the system prompt, create the
> free-form procedure + trigger, upload the KBA, register the 3 webhook tools + transfer, enable
> Skip turn + ~25s take-turn-after-silence + post-call Data Collection. Then rehearse both
> branches and record the Monday backup.

---

### 2026-07-01 — Session 5

**Time spent:** ~30 min
**Status after session:** on track — demo flow finalized, talk track written

**What we did:**
- Finalized the exact demo: boss calls, verifies via **SSN + address**, agent **emails a reset
  link to the address on file**, stays on the line and coaches him through it. "Split" = agent
  offers email-link vs guided.
- Wrote `demo-script.md` — word-for-word talk track, synthetic demo identity card, **female
  voice** pick (Sarah/Rachel/Jessica) + settings, rehearsal checklist.
- Simplified `poc-mock-tools.js` to 3 tools (verify_caller[ssn+zip], send_reset_email[to inbox
  on file], document_resolution) and updated `elevenlabs-poc-setup.md` to match.

**What broke / surprised us:**
- Demo dropped OTP/SMS in favor of SSN+address auth and email delivery — simpler and cleaner
  for stage. Full OTP flow kept as the phase-2 production target.

**Decisions made:**
- Voice: warm American **female** to match the current IVR (A/B Sarah/Rachel/Jessica).
- "Email on file" = boss's own inbox so the link lands live; everything else synthetic.

**Next session:**
> Build it in the ElevenLabs dashboard from `elevenlabs-poc-setup.md`; deploy `poc-mock-tools.js`
> to a scratch Vercel project with DEMO_EMAIL + an email provider; A/B the voice against the IVR;
> rehearse the `demo-script.md` talk track; record the Monday backup video. Still need the
> corrected reset KBA text.

---

### 2026-07-01 — Session 4

**Time spent:** ~1 hr
**Status after session:** on track — POC scope set, demo assets drafted

**What we did:**
- Locked the demo target: **POC in ElevenLabs only, no Talkdesk**, one topic (account
  recovery), working demo due **Tue Jul 7**.
- Verified the two novel capabilities: silence-triggered check-ins ("take turn after silence",
  ≤30s) + Skip turn for staying on the line; webhook/server tools for the transactional steps.
- Rewrote the procedure to the boss's 8-step transactional flow (verify → intent → procedure →
  OTP → reset link/temp password → stay on line → check-ins → document resolution).
- Drafted `elevenlabs-poc-setup.md` (agent settings, paste-ready system prompt, 5 tool schemas,
  telephony options, demo runbook + backup) and `poc-mock-tools.js` (runnable mock backend).

**What broke / surprised us:**
- Literal 60s check-ins aren't native (silence timeout maxes at 30s) — POC uses ~30s cadence;
  precise 60s needs client-side activity pings (deferred).
- Flow is now transactional (sends OTP + reset), so it needs mock tools — built them.

**Decisions made:**
- Demo ONE topic well, not several shakily. Backup video mandatory.
- Synthetic test data only in the POC — no real SSNs/PII.
- Talkdesk, SIP, and the Lumio dashboard are explicitly **phase 2** (post-POC).

**Next session:**
> Get the corrected reset KBA text (with the missing "click Log In" step) from the knowledge
> team. Confirm OTP-only vs SSN for the POC. Then build it in the ElevenLabs dashboard from
> `elevenlabs-poc-setup.md`, deploy `poc-mock-tools.js` to a scratch Vercel project, and do a
> full rehearsal + backup recording before Tuesday. (Transcript-analysis results will pick the
> NEXT topics — not needed for the demo.)

---

### 2026-07-01 — Session 3

**Time spent:** ~30 min
**Status after session:** on track

**What we did:**
- Worked the first real topic end-to-end: `artifacts/procedure-password-reset.md` — a
  free-form procedure that walks the caller through reset one step at a time, confirms each
  step, and verifies login before ending.

**What broke / surprised us:**
- The data explains the failure: 3,136 calls, 3% self-served, but **55% call back** — the
  recorded message fails because it can't confirm/adapt and is **missing the "click Log In to
  reveal Forgot Password" step**. Fix the KBA, not just the agent.
- Auth mismatch surfaced: boss's example uses **SSN**; our scope assumed **OTP**. Needs a
  decision (recommend OTP; if SSN, use DTMF + a second factor, compliance sign-off).

**Decisions made:**
- Success = **first-call resolution / no callback**, verified by having the caller actually
  log in before the call ends — not just deflection.
- Password-reset flow is **guide-only** (agent never touches the account) → fits answer-only.
- Add a "callback within N days" metric for this topic to prove we beat the 55%.

**Next session:**
> Resolve the auth method (OTP vs SSN) with compliance. Get the corrected reset KBA (with the
> missing Log In step) from the knowledge team. Then this procedure is ready to build in the
> ElevenLabs sandbox as the pilot's first topic.

---

### 2026-07-01 — Session 2

**Time spent:** ~1 hr
**Status after session:** on track — awaiting sponsor/compliance confirmation to lock scope

**What we did:**
- Drafted buildable artifacts (docs-only in wealth-command; port to the retirement repo):
  `artifacts/001_ai_call_events.sql`, `artifacts/TOOLS-AND-WEBHOOK.md` (OTP contract +
  post-call webhook mapping + topic-taxonomy config shape).
- Produced `architecture.mmd` (Mermaid) and `ONEPAGER.md` for sponsor sign-off.
- Proposed a 5-topic participant-facing pilot in `SCOPE.md`.

**What broke / surprised us:**
- Confirmed the fork constraint: this session is locked to wealth-command, so retirement
  application code cannot land here — artifacts are written as portable specs instead.
- Working assumption (participant-facing, not sponsor-facing) needs confirmation — it
  changes the topic set.

**Decisions made:**
- Retirement code lives in a separate repo; wealth-command holds planning artifacts only.
- Metrics schema is vendor-neutral (`provider` column); OTP is a custom server tool;
  webhook is idempotent on `(provider, conversation_id)`.

**Next session:**
> Sponsor confirms (a) participant- vs sponsor-facing, (b) the 5 pilot topics, (c) answer-only
> for v1. Compliance weighs in on recording disclosure + OTP-as-identity + PII. Once locked,
> stand up the retirement repo and port `001_ai_call_events.sql` + the OTP endpoints as the
> first build slice.

---

### 2026-07-01 — Session 1

**Time spent:** ~1 hr
**Status after session:** on track (scoping/spec only — no code yet)

**What we did:**
- Validated the concept against the Lumio vision (client-facing Call Center seed; Lumie stays off the caller side; "plug in, don't replace").
- Verified every requirement against ElevenLabs docs: SIP trunking, custom SIP headers, KB + free-form procedures, `transfer_to_number`/SIP REFER, post-call webhooks + Data Collection.
- Wrote `SCOPE.md`, `SPEC.md`, and this `BUILD.md` using the project-spec skill templates.
- Distinguished this project from the internal plan-admin app (`retirement-command-DESIGN.md`).

**What broke / surprised us:**
- ElevenLabs has **no native OTP** — must be built as a custom server tool.
- KBA answers must use **free-form** procedures (structured procedures can't reference the KB), and procedure types **can't be converted** later. Procedures are Alpha.
- Trigger-matching internals are undocumented — a black box to design conservatively around.

**Decisions made:**
- Talkdesk = front door/switchboard; ElevenLabs = one destination; Lumio = system of record for metrics.
- Metrics land in Lumio (dashboard we need anyway) rather than only ElevenLabs' native analytics — for ownership + portability.
- v1 is **answer-only**; anything transactional transfers to a human.
- Single-source the topic taxonomy across Navigator and the agent's procedure triggers.

**Next session:**
> Get sponsor to confirm SCOPE (esp. the 3–5 pilot topics and the answer-only boundary), and get compliance's read on OTP-for-identity + recording disclosure. Once scope is locked, decide SIP trunk provisioning owner and draft the `ai_call_events` migration + the OTP tool contract (`/api/otp/start`, `/api/otp/verify`) as the first buildable slice.

---

<!-- Template for additional sessions — copy upward:

### [YYYY-MM-DD] — Session [N]

**Time spent:** [X hrs]
**Status after session:** [on track / blocked / ahead / paused]

**What we did:**
-

**What broke / surprised us:**
-

**Decisions made:**
-

**Next session:**
>

-->
