# BUILD LOG — Vertex Manufacturing Demo Site

**Slug:** vertex-demo-site
**Started:** 2026-09-30
**Status:** active, built and committed, NOT yet deployed (Vercel project creation returned 403 for the connector)

---

## Session log

<!-- Add new sessions at the top, newest first -->

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
