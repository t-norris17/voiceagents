# SCOPE — Robin Portal (one front door, per-customer features)

**Slug:** robin-portal
**Status:** draft
**Created:** 2026-09-14
**Effort:** L for v1 (shell + admin + survey module), XL to absorb everything
**Owner:** Tanner

> One web app where a "customer" of Robin signs in and sees only what they have been granted: the
> survey dashboard, the Knowledge Factory, the Robin artifacts, and whatever comes next. An Admin page
> is where Tanner decides who gets what. Nothing about how Robin takes a call changes.

---

## Problem

Robin's surfaces are spread across two Vercel projects, one shared Basic-auth password, a set of
Claude artifacts, Word documents, and markdown in this repo. There is no notion of a user anywhere in
the stack: the survey dashboard is one password for everyone, the Knowledge Factory console has no
gate at all (deferred in `robin-kb-pipeline/SCOPE.md`), and the artifacts are links passed around by
hand. That works for one builder. It does not work the moment a second person, an INTRUST executive,
the CTO, a plan sponsor, needs a stable place to look, and it cannot answer "who saw the call
transcripts" in a regulated setting.

## Solution

A single **portal** that owns three things and delegates everything else: **identity** (who you are,
which organisation you belong to), **entitlement** (which features that organisation and role can
see), and **navigation** (one shell, one URL). The existing apps become **modules** behind the shell:
the survey dashboard and its APIs, the Knowledge Factory's Clean / QA / Publish, an artifacts library
(handouts, call cards, KB articles, the answer key), and a read-only **Robin status** panel that reads
the live ElevenLabs config (version, prompt hash, KB documents, tools) so nobody trusts a stale file.
The **Admin** page is the entitlement editor: organisations, their members and roles, and a feature
grid with a toggle per organisation. Every toggle is enforced server-side on the route, not just
hidden in the menu, and every change is written to an audit log.

## Success criteria

- [ ] **A viewer sees only what they were granted.** Two test accounts in two organisations, one
      with the survey dashboard on and one with it off: the second gets a 404 on the page **and** on
      `/api/survey-*`, verified by request, not by looking at the menu.
- [ ] **The shared password is gone.** `SURVEY_PASSWORD` is removed from the broker and the survey
      dashboard is reachable only through the portal's session.
- [ ] **Admin round-trip under a minute:** invite a user, assign an organisation and role, flip two
      features, and the change is visible on their next page load, with an audit row for each step.
- [ ] **Robin status panel agrees with the dashboard.** The version id, KB document ids and tool
      list it shows match `agents_get` on the live agent at the moment of viewing.
- [ ] **Robin's calls are untouched.** `verify_caller`, `get_balance` and `/api/postcall` keep
      their URLs and stay outside the portal's auth; a live call after cutover shows no new latency.

## Why now

The loan wave puts 25 people's real names into call transcripts behind a single shared password, and
the CTO is now asking questions of his own. The next request after "here is the dashboard link" is
"can my team see it, but not the transcripts", and there is no way to say yes today. The Knowledge
Factory console is built and blocked on the same missing gate. Building identity once, under one
roof, is cheaper than adding a second shared password.

## Constraints

- **Robin's call path does not move.** The tool webhooks and the post-call webhook stay on the
  broker at their current URLs, unauthenticated by the portal, exactly as `middleware.js` treats
  them today. Architecture A stands: no Supabase in the call loop for knowledge.
- **Reuse, don't rebuild.** The broker (`voiceagents-seven`), the cleaner (`voiceagents-qewy`) and
  the Supabase project (`rlhybqslnqhggbykjrqg`) are the modules. The portal wraps them; it does not
  reimplement the survey page or the cleaner pipeline.
- **Enforcement is server-side.** A feature that is off returns 404 from the route. Menus reflect
  entitlement; they do not implement it.
- **Compliance.** Call transcripts and audio are their own grant, default off. Audit log on every
  entitlement change. Secrets stay in Vercel env. Synthetic member data only, as always.
- **Stack.** Next.js on Vercel, Supabase Auth with magic-link email, Supabase Postgres for
  organisations, memberships, feature grants and audit. No new vendors.
- **Tenancy key is the organisation, and an organisation owns a list of `plan_id`s.** That is the
  join to `kb_articles.plan_id` today and to `ai_call_events` once it carries a plan (it does not
  yet; see open questions).

## Non-goals

- Not: replacing the ElevenLabs dashboard. Agent configuration, versions, procedures and the KB
  stay there; the portal reads, it does not write, in v1.
- Not: SSO / SAML / Entra in v1. Magic link first; SSO is a v2 item if INTRUST requires it.
- Not: rebuilding the survey dashboard or the cleaner UI. They are moved behind the shell as they
  are, then improved later if at all.
- Not: billing, plans, self-serve signup. Every account is created by an admin.
- Not: per-user toggles. Features are granted to an **organisation**; **roles** (admin, editor,
  viewer) decide what a member can do inside a granted feature. Per-user exceptions are a v2
  question, not a v1 mechanism.
- Not: the phase-2 multi-tenant retrieval design (`nestegg-u-demo/phase2/multi-tenant-plan-qa.md`).
  The portal scopes what people **see**; it does not change what Robin **retrieves**.

## Feature registry (v1 candidates)

A feature is a key in code, toggled per organisation in Admin. First cut, in order of value:

| Key | What it gates | Module today |
|---|---|---|
| `survey_dashboard` | "Would they rather use her?" page, slide, metrics API | broker `/survey`, `/api/metrics`, `/api/survey-*` |
| `call_transcripts` | Per-call drill-down and audio links | broker `/api/survey-call` |
| `survey_export` | CSV export | broker `/api/survey-export` |
| `monitor` | Experiment Monitor: outcomes, security scan, grading | broker `/dashboard`, `/api/grade`. **The grader scores against the documents Robin retrieved, but only documents published through the Knowledge Factory have text on our side; the five live Vertex documents were uploaded straight to ElevenLabs, so recent calls grade `no_source`. Fetching KB text from ElevenLabs is the prerequisite. Grading runs only when someone opens the page.** |
| `q_tester` | Ask Robin's published KB a question | broker `/robin-q-tester`, `/api/ask` |
| `knowledge_factory` | Clean and QA tabs | cleaner console |
| `kb_publish` | Publish tab (writes to ElevenLabs) | cleaner `/api/publish` |
| `artifacts` | Handouts, call cards, answer key, KB article sources | repo `demo/`, `kb/vertex/` |
| `robin_status` | Live agent version, KB docs, tools, phone number | ElevenLabs API, read-only |
| `admin` | The Admin page itself | new |

## Open questions

- [ ] **Who is a "customer"?** Internal INTRUST stakeholders (leadership, the CTO, a content
      reviewer), external organisations (a plan sponsor, a recordkeeper), or both? The data model
      above works for either, but the answer decides whether v1 needs one organisation or several,
      and whether `plan_id` scoping has to be real on day one.
- [ ] **Does INTRUST require SSO for anything its staff sign into?** If yes, magic link is a
      prototype and Entra is v1, which roughly doubles the auth work.
- [ ] **Where does it live?** Tanner's Vercel account, like the two existing projects, or an
      INTRUST-owned deployment? The answer changes who can rotate secrets and who is on the hook for
      the transcripts.
- [ ] **How do the modules trust the portal?** Server-side proxy from the portal to the broker and
      cleaner with a signed per-request header is the clean answer; iframes with a shared session is
      the fast one. Pick in the spec.
- [ ] **`ai_call_events` has no `plan_id` or organisation.** Every call today is one plan. Scoping
      the survey dashboard per organisation needs that column, derived from the verified member's
      plan at webhook time.
- [ ] **What does "artifacts" mean to the reader?** Rendered repo documents (handout, call cards),
      the published Claude pages, or both? Rendering markdown from the repo is easy; keeping Claude
      artifact links in step is a manual list.

---

*Scope locked: not yet*
