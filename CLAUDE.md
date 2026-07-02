# CLAUDE.md — Voice Agents workbench

Guidance for AI agents working in this repo. Auto-loaded every session.

This repo is a **workbench for building ElevenLabs voice agents**. It holds the design docs,
procedures, knowledge-base articles, demo scripts, and mock backends for each voice-agent
project. The agents themselves are configured in the **ElevenLabs dashboard** (configuration,
not code); this repo is the source of truth for *what* to build and *how*.

**Current focus:** the **NestEgg U password-reset demo** — a working demo due **Tue Jul 7**.
Start at [`projects/nestegg-u-demo/START-HERE.md`](./projects/nestegg-u-demo/START-HERE.md).

---

## ⚠️ Safety rules (non-negotiable — regulated financial services)

- **Synthetic test data only.** Never put a real SSN, real member PII, or real account data in
  this repo, in a procedure, or in a demo. Use the synthetic identity in the demo project.
- The **only** real value allowed is a demo *inbox* used to test email delivery (clearly the
  builder's own, not a member's).
- These are retirement/financial-services agents — treat auth, recording disclosure, and PII
  handling as compliance-gated, not afterthoughts.

## How we work

- **Project docs use the `project-spec` skill** (installed at `.claude/skills/project-spec/`).
  Every project gets `SCOPE.md` → `SPEC.md` → `BUILD.md`, in that order — scope before code.
  New project? Run the skill; it reads the templates in the skill's `assets/`.
- **Layout:** each project lives in `projects/<slug>/` with its SCOPE/SPEC/BUILD plus its
  artifacts (KBA, procedure, demo script, ElevenLabs setup, mock tools).
- **Update `BUILD.md` at the end of every working session** — its "Next session" block is the
  briefing the next chat reads first.

## ElevenLabs reference

Don't answer ElevenLabs capability questions from memory — check
[`docs/elevenlabs-reference.md`](./docs/elevenlabs-reference.md) (verified against the live docs,
with links). Reusable design patterns are in
[`docs/voice-agent-patterns.md`](./docs/voice-agent-patterns.md).

Key facts to remember:
- **Procedures are Alpha** (breaking changes possible). Two kinds: **free-form** (adaptive,
  can reference the Knowledge Base — use these for KBA-grounded answers) and **structured**
  (deterministic steps, *cannot* reference the KB). You **cannot convert** one type to the other.
- **Tools** (server/webhook) let the agent take actions mid-call (verify, send email, document).
- **Transfer to a human** = `transfer_to_number` (SIP REFER when on SIP).
- **Staying on the line / check-ins** = "take turn after silence" (1–30s) + the **Skip turn**
  system tool.
- **Post-call webhook** + **Data Collection** deliver structured outcomes for metrics.

## Build / run

- **Mock tool backend:** deploy the project's `*mock-tools.js` to a **throwaway Vercel project**
  (not tied to anything production). In-memory state is fine for a single demo session.
- **The agent:** built in the ElevenLabs dashboard from the project's `elevenlabs-*-setup.md`.
- There is no app build here — this repo is docs + a small mock backend.

## Lineage

This repo was split out of the **Lumio** platform's planning work (the `wealth-command` repo),
per that project's fork strategy: voice-agent development lives here, separate from the Lumio
app code. The broader vision — Talkdesk routing, a metrics dashboard, multi-topic rollout — is
**phase 2**, captured under each project's `phase2/` folder. For the demo, stay focused: one
topic, done well.
