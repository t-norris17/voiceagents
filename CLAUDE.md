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

## Working agreement — checkpoints and verification

Written after a session where the work moved fast, the write-ups sounded thorough, and two defects
reached the live database anyway. These rules are mechanical on purpose: each one is the thing that
would have caught a specific defect that shipped.

### Two checkpoints per feature

1. **Design, before building.** Say what will be built and what it rests on. Wait for a yes.
2. **Built, before moving on.** Show what was built against that design, and name anything that
   drifted from it. Wait for a yes.

A checkpoint is a stop with something to look at, not a status update. Building seven things and
then presenting them is one checkpoint, not seven.

### Prove the premise, not just the code

Every defect in that session came from an unexamined assumption at a seam — SQL to API, API to page,
config to platform, working tree to git. None came from a botched implementation. The tests covered
the middle of things; the bugs were all in the joints.

So before building on any claim about a system you did not just write, check it. One query or one
`node -e` is almost always enough:

- **Does this pattern actually compile?** `matcher: "/api/survey-:path*"` does not — path-to-regexp
  throws on it. It would have shipped the CSV export and every call transcript ungated.
- **Does this view contain these rows?** `survey_people` holds only a person's *first* call, so
  reading comments from it showed zero while one existed.
- **What values does this column actually take?** `preference` has four, not three; counting the
  fourth made `changed_mind` fire on a parse failure.
- **Is my work committed?** `git checkout <ref> -- <path>` silently overwrote six uncommitted files.

### Say "unverified" when it is

Never "negligible", "should be fine", or "probably" about something measurable. Measure it, or say
plainly that it is unmeasured and why. **"I could not verify X, because Y"** is a good sentence and
belongs in the summary rather than left out of it.

### Destructive operations get a full stop

Live agent config, migrations against the live Supabase project, anything on the production domain,
and any git command that writes state:

- Check state first, as its own command. `git status --short` before anything that could discard it.
- One state-changing command per invocation, so there is a checkpoint between them.
- Never suppress errors (`2>/dev/null`, `|| true`) on a command that writes. Suppression is for reads.
- Treat `git checkout <ref> -- <path>`, `git restore --source`, `reset --hard` and `clean` as `rm`
  on the paths they touch. Uncommitted work is in no reflog and no stash; it is simply gone.
- Commit before rebranching. History can be rewritten later; lost work cannot.

### Run the adversarial pass before shipping, not on request

Re-read the finished diff hunting for what is wrong with it, rather than confirming that it works.
In that session this pass found three real defects — but only because it was asked for, and by then
two of them were live. It belongs before the PR.

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
