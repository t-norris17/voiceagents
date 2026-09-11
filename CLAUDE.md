# CLAUDE.md — Voice Agents workbench

Guidance for AI agents working in this repo. Auto-loaded every session.

This repo is a **workbench for building ElevenLabs voice agents**. It holds the design docs,
procedures, knowledge-base articles, demo scripts, and mock backends for each voice-agent
project. The agents themselves are configured in the **ElevenLabs dashboard** (configuration,
not code); this repo is the source of truth for *what* to build and *how*.

**Current focus:** the **Robin 50-user experiment** (`projects/robin-experiment/`) — a live
ElevenLabs agent on a real phone number, with a 3-day tester wave pending approval.
**Start at [`projects/robin-experiment/BUILD.md`](./projects/robin-experiment/BUILD.md)** and read
its newest session entry first; it is the handoff briefing and it names what is live, what is
broken, and what is next.

*(`projects/nestegg-u-demo/` is the earlier password-reset demo, last touched 2026-07-06. It is not
the current focus and its dates are stale.)*

---

## ⚠️ Safety rules (non-negotiable — regulated financial services)

- **Synthetic test data only.** Never put a real SSN, real member PII, or real account data in
  this repo, in a procedure, or in a demo. Use the synthetic identity in the demo project.
- The **only** real value allowed is a demo *inbox* used to test email delivery (clearly the
  builder's own, not a member's).
- These are retirement/financial-services agents — treat auth, recording disclosure, and PII
  handling as compliance-gated, not afterthoughts.

### Settled decisions — do not re-litigate or "fix"

- **Robin does NOT disclose that she is a virtual assistant.** Removed deliberately on 2026-09-10 on
  leadership's recommendation; they have said it can go back in later if it becomes an issue. The
  repo's `robin-system-prompt.txt` and `survey/robin-prompt-WITH-survey.txt` still carry the old
  instruction (*"Open by introducing yourself by name and noting you're a virtual (not human)
  assistant"*). **That line is stale. Never push it to the live agent and never flag its absence as a
  defect.** Strip it from any prompt built from those files. Only the user reinstates it.

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
- **Does the LIVE system agree with this file?** The repo is not the agent. Robin's Knowledge Base is
  five **Vertex** documents in the ElevenLabs dashboard; `kb/` holds three **INTRUST** files that
  drive nothing and contradict live on loan limits and fees. A whole design was built on `kb/` saying
  loan limits are unpublished. They are published, in full, live.
- **Did the tool actually return that?** A transcript shows what the agent *said*; `tool_results`
  shows what it was *given*. `get_balance` came back `is_error: true, "Tool execution was abandoned
  due to user input", latency 0` — the caller said "Okay" mid-lookup and killed it — and reading only
  the transcript produced a confident, wrong diagnosis of a LOAN TRAP adherence failure.
- **Was the code live when the call happened?** Compare the production promote's timestamp to the
  conversation's `start_time_unix_secs`. The promote landed 37.6 minutes *after* the call it was
  meant to explain. "It's deployed" is a belief until those two numbers say so.

### Verify across the seam, not inside it

Every miss above has one shape: verified inside one system, asserted about another. The repo said it,
so live must be it. The transcript showed it, so the tool must have returned it. Someone said
deployed, so it must have been deployed *at that moment*. Checking within a system is not checking
the claim.

When a conclusion crosses a boundary — repo→live, transcript→tool payload, push→promote, prompt→agent
— the evidence has to come from the far side. And when reporting it, name the artifact: conversation
id, field, value, timestamp. "She ignored `outstanding_loan`" is a claim; "`[56s] get_balance
is_error=True`" is evidence. If the artifact cannot be produced, the finding is a hypothesis and gets
labelled one.

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
