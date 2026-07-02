# Voice Agents

A workbench for designing and building **ElevenLabs voice agents** for support/call-deflection
use cases. This repo holds the design docs, knowledge-base articles, procedures, demo scripts,
and mock backends. The agents themselves are configured in the ElevenLabs dashboard.

## Current project

**NestEgg U password-reset demo** — due **Tue Jul 7**.
→ Start at [`projects/nestegg-u-demo/START-HERE.md`](./projects/nestegg-u-demo/START-HERE.md).

## Layout

```
.
├── CLAUDE.md                     # agent context (auto-loaded); safety rules; how we work
├── docs/
│   ├── elevenlabs-reference.md   # verified ElevenLabs capabilities (with doc links)
│   └── voice-agent-patterns.md   # reusable design patterns
├── .claude/skills/project-spec/  # the SCOPE → SPEC → BUILD skill + templates
└── projects/
    └── nestegg-u-demo/
        ├── START-HERE.md         # read first — current state + open decisions + next steps
        ├── SCOPE.md / SPEC.md / BUILD.md
        ├── kba-nestegg-password-reset.md   # the agent's Knowledge Base doc
        ├── procedure-password-reset.md     # the free-form procedure
        ├── demo-script.md                  # word-for-word talk track + identity card
        ├── elevenlabs-poc-setup.md         # dashboard build guide + demo runbook
        ├── poc-mock-tools.js               # mock webhook-tool backend
        └── phase2/                         # Talkdesk + dashboard (deferred)
```

## Ground rules

- **Synthetic data only** — never real SSNs/PII. See `CLAUDE.md`.
- **Project-spec skill** — every project gets SCOPE → SPEC → BUILD, scope before code.
- **The agent is config, not code** — this repo is docs + a small mock backend.

## Start a new project

Open a chat and say what you're building; the `project-spec` skill scaffolds `SCOPE.md` →
`SPEC.md` → `BUILD.md` under `projects/<slug>/`.
