# SCOPE — Robin KB Pipeline (publish + single pane of glass)

**Slug:** robin-kb-pipeline
**Status:** draft
**Created:** 2026-07-23
**Effort:** L
**Owner:** Tanner

> The "publish" half of the Robin content pipeline, plus the console that unifies it with the two
> tools we already built. Approved cleaned articles → **Supabase** (system of record) → **ElevenLabs
> Knowledge Base** (serving copy). **Architecture A:** Robin retrieves natively; no Supabase in the
> call loop for knowledge.

---

## Problem

The content cleaner produces Robin-ready articles, but there's no path from a **reviewed** article to
Robin actually **using** it. Today that last mile is manual: someone would copy text into the
ElevenLabs dashboard by hand, with no record of what was published, when, by whom, or which version.
That doesn't scale past one plan and leaves no audit trail — a problem in a regulated setting. And the
three pieces (clean, test, publish) live in three different places, so there's no single surface where
you take a messy guide and walk it all the way to "live on Robin."

## Solution

A **publish pipeline** plus a **single-pane-of-glass console**. Publishing: an approved article is
written to a versioned Supabase `kb_articles` table (the durable record + audit), then synced into
ElevenLabs' native Knowledge Base via their API — **create-from-text → compute rag-index → attach to
the agent** — so Robin retrieves it in-runtime with **zero call-time Supabase hits**. The console wraps
the existing tools into one app with tabs: **Clean** (content cleaner), **QA** (Robin Q tester), and
**Publish** (review the approved/published set, push to Supabase → ElevenLabs, see sync status). The
human approval gate stays: nothing reaches ElevenLabs without a person clicking publish.

## Success criteria

- [ ] **End-to-end demo:** paste a messy guide → Clean → approve → Publish → the article is a live
      ElevenLabs KB document (RAG-indexed, attached to Robin) **and** a versioned `kb_articles` row —
      with no manual dashboard step.
- [ ] **Robin answers from a freshly published article on a live call**, with no added latency vs.
      today (retrieval stays native; measured against a baseline call).
- [ ] **Audit trail:** every publish records what/when/version/source/`plan_id` and its ElevenLabs
      `document_id`; re-publishing a changed article supersedes the old version, not duplicates it.
- [ ] **One console:** Clean, QA, and Publish reachable as tabs in a single app; a reviewer never
      touches the ElevenLabs dashboard or raw SQL.

## Why now

The cleaner just proved the "in" side works; the publish side is the other half of the same story and
the thing that makes the demo land — *paste a garbage SOP, minutes later Robin answers from it on a
call, with a human gate and a versioned record in between.* We also just confirmed the ElevenLabs KB
API exists (create/index/attach), so the main external dependency is de-risked. Doing it now, while the
cleaner's shape is fresh, avoids re-learning it later.

## Constraints

- **Architecture A only.** Robin retrieves from ElevenLabs' native KB. No agent→Supabase call for
  knowledge at conversation time (verify_caller/get_balance stay — those are identity/balance, not KB).
- **Human gate — never auto-publish.** Publish is an explicit action on an *approved* article.
- **Compliance:** synthetic data only; the audit trail must capture who/what/when; secrets
  (`ELEVENLABS_API_KEY`, Supabase service key) stay server-side in Vercel env, never in the browser.
- **Reuse the deployed pieces:** the cleaner (`voiceagents-qewy`) and broker (`voiceagents`) already
  exist with keys set; don't rebuild them. Supabase project already provisioned (`rlhybqslnqhggbykjrqg`).
- **ElevenLabs KB API** is the integration surface: `POST /v1/convai/knowledge-base/text` →
  `POST …/{id}/rag-index` → `PATCH /v1/convai/agents/{id}` (see `docs/elevenlabs-reference.md`).

## Non-goals

- Not having Robin query Supabase (or any external DB) for knowledge mid-call (that's the slow
  Architecture B — explicitly rejected).
- Not auto-publishing without human approval.
- Not building auth/accounts for the console in v1 (gate the deployment with Vercel Password Protection
  or a shared token — see the security item, tracked separately).
- Not re-implementing the cleaner or the Q tester — the console **embeds/links** them.
- Not multi-agent / multi-plan rollout mechanics beyond scoping rows by `plan_id` (that's phase 2).

## Open questions

- [ ] **Usage mode:** attach articles as **RAG/Auto** (indexed, retrieve relevant passages) vs
      **Full context** (whole doc in prompt)? RAG scales to many docs; Full-context is simplest for a
      handful. Likely RAG once we have >a few articles. → SPEC decides; default RAG.
- [ ] **Embedding model** for `rag-index` (e.g. `multilingual_e5_large_instruct`) — pick one and pin it.
- [ ] **Agent targeting:** where does the ElevenLabs `agent_id` come from — env var per environment?
      One Robin agent for the experiment, so likely a single `ELEVENLABS_AGENT_ID`.
- [ ] **Supabase `kb_articles` schema:** columns (id, plan_id, slug, title, environment, body_md,
      source, version, state, elevenlabs_document_id, published_at, published_by, checksum). Confirm in SPEC.
- [ ] **Versioning/supersede:** on re-publish of the same slug+plan, do we delete+recreate the
      ElevenLabs doc, or create new + detach old? (API supports update/delete — SPEC picks the flow.)
- [ ] **Where publish runs:** extend the cleaner project (`voiceagents-qewy`) with `/api/publish`
      (needs `ELEVENLABS_API_KEY` + Supabase service key added there), or the broker? Cleaner is the
      natural home since the article originates there.
- [ ] **Console hosting:** one new app that embeds all three tabs, or a shell that iframes/links the
      existing cleaner + tester pages? (Cross-project embedding vs. one unified deploy — SPEC decides.)
- [ ] **Approval source of truth:** does "approved" live in `kb_articles.state`, and does the cleaner
      write a `draft`/`approved` row at review time, with Publish flipping to `published`?
- [ ] **Security gate** for the console (Vercel Password Protection vs shared token) — decide before it
      holds real content; tracked as its own small task.

---

*Scope locked: not yet*
