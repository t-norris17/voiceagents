# BUILD LOG — Vertex Manufacturing Demo Site

**Slug:** vertex-demo-site
**Started:** 2026-09-30
**Status:** active, deployed at https://vertex-demo-site.vercel.app/ (see Session 2)

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-09-30 — Session 2 (same day, after first deploy)

**Status after session:** site restyled on branch, awaiting PR and merge; widget behavior still untested by Tanner as far as this log knows

**What we did:**
- Tanner deployed `https://vertex-demo-site.vercel.app/` (Vercel project created by hand after the connector's 403; PR #80 merged first so the folder was on `main`).
- Feedback: the site over-promoted Robin and looked unrealistic (footer retirement block, orange "Ask Robin" nav button, "Ask Robin about your 401(k)" hero button). Removed all of it. The widget is now the only Robin surface. Home gets a hiring band instead of the retirement block; Benefits is ordinary HR copy with one generic "use the chat in the corner" line; footer is plain; Careers and Contact copy no longer mention the assistant. The tester guide is unlinked and now carries an "Open the chat widget" button.
- Removed an invented eligibility claim from Careers ("full benefits from the first of the month after hire") so the site cannot contradict the plan KB.
- Verified in headless Chromium: six pages, no overflow, zero `data-ask-robin` hooks on public pages.

**Found later in session 2 (read from the live ElevenLabs config, not assumed):**
- Tanner enabled text-only and it landed on **live Robin** (`agent_8301…`), not on the duplicate: live `conversation.text_only` and widget `supports_text_only` read `true`; `Robin (web demo)` still reads `false`. The phone line is the tester wave, so this needs a deliberate decision. The last live call (`conv_7201m3shnddyeae95dx0adn0cg7p`, 2026-09-30 16:16Z, Tanner as Priya) predates any evidence of the change and ran normally; what a phone call does on a text-only agent is UNVERIFIED. Tanner said to treat today's failed call as a non-factor.
- My earlier "TTS drift" diagnosis was wrong. Live Robin was saved between my two reads, so the duplicate (0.55 stability, two audio tags) was faithful and my pin to 0.57 made it differ. Realigned the duplicate to 0.55 plus the two tags. Verified by full diff: the only remaining difference from live Robin is `conversation.text_only`.
- Avatar: `site/assets/robin-avatar-172.png`, 172 x 172 px, about 37 KB (limit 2 MB), cut from the hero pose on `Robin Character Sheet.png`, flat sage background (214,226,178) matching the sheet's avatar circles, framed so both headset cups stay inside the circle the widget crops to.

**Decisions made:**
- Robin invisible on the public site; see SPEC key decisions.
- Tester guide URL (`/tester-guide`) is shared directly with testers, never linked.
- Agent allowlist deliberately NOT set yet. Tanner has not confirmed the widget works unrestricted, and I cannot verify from here what `enable_auth` does with a plain agent-id embed (it may require signed URLs and break the widget). Change one thing at a time: confirm the widget works, then set the allowlist, then retest.

**Next session:**
> 1. Tanner confirms what the widget does on the live site (opens? typing? voice? any console error?). 2. Only then set the agent allowlist to `vertex-demo-site.vercel.app` using the allowlist only (leave `enable_auth` false unless the docs/behavior say otherwise), and retest in a browser plus a check from another origin. 3. Run the ten-question parity script. 4. Check whether the post-call webhook fired for the first chat. 5. Regroup on prove-it: chat escalation, command center, SMS.

---

### 2026-09-30 — Session 1

**Time spent:** one session
**Status after session:** blocked on one manual step (create the Vercel project), otherwise on track

**What we did:**
- Duplicated live Robin into **`Robin (web demo)`**, `agent_0101m3sjqvfyejsa9kn127ez26mm`, branch `agtbrch_6901m3sjqvfzek0br9k7p32zww6g`. Diffed it against live Robin (`agent_8301kwj5qa8ve1atremxxwjjp9f8`): prompt (18,315 chars), all four procedure bodies (read in full, textually identical), tool ids, KB, data collection, LLM, workspace webhook all match. No phone number came across. Two voice-only drifts (TTS stability 0.55 vs 0.57, two audio tags) were pinned back to the live values and re-read.
- Built the static site in `site/`: Home, About, Careers, Benefits (the Robin page, with Type / Talk / Text-planned cards), Contact (non-functional form), and `tester-guide` (noindex, synthetic personas 90001 to 90003, ten-question parity script, prove-it status board). Fonts self-hosted (OFL). Fictional-company footer on every page.
- Widget wiring in `assets/site.js`: one `ROBIN` config block, widget injected on every page, any `[data-ask-robin]` element opens it.
- Verified in headless Chromium: six pages 200, no horizontal overflow at 1360 and 390 wide, widget element mounts with the right agent id, first-message override and dynamic variables, visual pass on home, benefits, tester guide and mobile. Two defects found and fixed (drawing label collision, hero row gap).
- Pushed to `claude/great-thompson-5hqub2` (commit `e007f3f`). No PR opened.

**What broke / surprised us:**
- **Vercel 403.** `create_project` on team `t-norris17s-projects` returned "You don't have permission to create the project." Two projects already link to this repo (`voiceagents`, `voiceagents-qewy`), so the repo-linking shortcut was deliberately not used. The project has to be created by hand.
- **Could not test the widget UI from this container.** `api.us.elevenlabs.io` and `elevenlabs.io` are blocked by the egress proxy, so config fetch, rendering, a real conversation, the allowlist and the webhook are all UNVERIFIED. What is verified: element mounts, attributes are read from the published 0.18.3 bundle, the expand event shape is read from source.
- **Live greeting is wrong for web.** The agent's first message is "Thank you for calling NestEgg U support". Overridden per page (`first_message` override is enabled); agent untouched.
- **`supports_text_only: false`.** No typing-only surface; the full widget already offers typing plus voice.
- **Verification mismatch.** Account Recovery procedure says last 4 SSN + DOB; call cards say Member ID + DOB and never SSN. Which fires live is unverified.
- The widget defaults to `api.us.elevenlabs.io`. If the workspace is not on US residency, the embed needs a `server-location` attribute. Unverified; the first browser test will show it.

**Decisions made:**
- Duplicate the agent (Tanner, 2026-09-30) so demo traffic stays out of the tester-wave numbers. Note: the post-call webhook is workspace-level, so whether the broker filters by agent id is unverified.
- SMS pinned (Tanner). Benefits page shows it as "Planned".
- Page-level first message, not an agent edit.
- No plan facts on the site; Robin is the only source of plan information.

**Next session:**
> 1. Tanner creates the Vercel project (import `t-norris17/voiceagents`, Root Directory `projects/vertex-demo-site/site`, Framework Other, no build command, output `.`) and deploys the branch. 2. First browser test of the deployed site: does the widget open, does typing work, does voice work, is `dynamic-variables` accepted, does the region need `server-location`. 3. Set the agent allowlist to the deployed hostname (update `platform_settings.auth` on `agent_0101…26mm`, check wildcard behavior) and confirm it blocks another origin. 4. Run the ten-question parity script on Marcus in chat and voice; record conversation ids. 5. On the first chat, pull the conversation from ElevenLabs and check whether the post-call webhook fired; that decides the chat-escalation design. 6. Then regroup on the prove-it list: chat escalation into a Rangly-style inbox, the agent command center, SMS.

---
