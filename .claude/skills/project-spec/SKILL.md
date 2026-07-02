---
name: project-spec
description: Generate and maintain standardized project documents for any new build — Mac Mini automations, consulting engagements, INTRUST AI projects, Vulkan content tools, or Deep Draft features. Use this skill whenever the user wants to start a new project, scope a build, write a spec, or log a build session. Triggers on "start a project", "scope this out", "write a spec", "new build", "project plan", "what are we building", "begin a new project", or any request to document what we're building and how. Also triggers when the user says "log this session", "update the build log", or "what's next on [project]". Always use this skill before writing any code for a new project — the scoping doc comes first.
---

# Project Spec Skill

Standardized project documentation system for all personal, professional, and side projects. Three documents, one consistent process.

## The three documents

| Document | Purpose | When to create |
|---|---|---|
| `SCOPE.md` | What we're building and why | Before anything else. No code without a scope. |
| `SPEC.md` | How we're building it | After scope is agreed. Before first session. |
| `BUILD.md` | Session-by-session journal | Updated at the end of every build session. |

## Process

1. User describes the project (even loosely)
2. Claude fills in `SCOPE.md` using the template in `assets/scoping-template.md`
3. User reviews and confirms — scope is locked
4. Claude fills in `SPEC.md` using `assets/tech-spec-template.md`
5. First build session begins — `BUILD.md` is initialized from `assets/build-log-template.md`
6. Every subsequent session: Claude reads `BUILD.md` → picks up where we left off → updates at end

## File placement

All instances live in the Memory Vault under `/projects/[project-slug]/`:
```
/projects/
  intel-scanner/
    SCOPE.md
    SPEC.md
    BUILD.md
  consulting-engine/
    SCOPE.md
    SPEC.md
    BUILD.md
```

Templates (blank forms) live here in the skill system and are never modified.

## Naming conventions

- Project slugs: lowercase, hyphenated, short. `intel-scanner`, `rag-kb`, `deep-draft-analytics`
- Status values: `draft`, `active`, `paused`, `shipped`, `archived`
- Effort ratings: `S` (< 4 hrs), `M` (1-2 days), `L` (1-2 weeks), `XL` (ongoing)

## Template files

- `assets/scoping-template.md` — blank SCOPE.md
- `assets/tech-spec-template.md` — blank SPEC.md
- `assets/build-log-template.md` — blank BUILD.md

Read the relevant template before filling it in. Never guess at the structure.

## Claude behavior notes

- Always read the relevant template before generating a document instance
- When starting a session on an existing project, read `BUILD.md` first — the "next session" section is your briefing
- Don't start writing code before `SCOPE.md` exists and has been confirmed
- Keep all three documents concise — these are working docs, not essays
- If a field is unknown at time of writing, mark it `TBD` rather than leaving it blank or guessing
- After updating `BUILD.md`, always end with a crisp "Next session" section — this is the most important field
