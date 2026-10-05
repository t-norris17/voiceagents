# SPEC — v1 accounts for Birdnest (Phase 1)

**Slug:** robin-portal / v1-accounts
**Status:** design checkpoint, awaiting approval (2026-10-05). Nothing built.
**Plan:** [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) Phase 1 · **Scope:** [`../SCOPE.md`](../SCOPE.md)

> Replace the one shared password with named accounts: each person signs in with an emailed code, belongs
> to an organisation with a role, and sees only the features granted to that role. Every grant change,
> sign-in, listen and request action is written to an audit log. Both after-hours requests and call audio
> wait on this.

---

## What is true today (checked 2026-10-05)

| Fact | Evidence |
|---|---|
| The portal is one shared Basic password over everything except `/api/health` | `app/middleware.js` (`PORTAL_PASSWORD`); `curl` of the production portal → 401 |
| The broker accepts the portal's `x-robin-internal` secret **or** its own `SURVEY_PASSWORD` | `broker/middleware.js` (the header branch is checked first) |
| **The content cleaner has no gate at all, and it is live.** An unauthenticated `GET /api/kb_list` returns 200 with 32 KB; the console page loads. By the code, `publish` and `unpublish` (which attach and remove documents on Robin's live knowledge base) and `clean` (paid model calls) are equally open | `curl` → 200; `content-cleaner/cleaner` has no `middleware.js`; `api/publish.js` has no auth check. `publish`/`unpublish` were **not** called |
| Supabase Auth has **0 users**; nothing to migrate | `select count(*) from auth.users` |
| All 14 public tables have RLS on and **no policies**, so only the service role reads them | `pg_class.relrowsecurity`, `pg_policies` |
| Supabase organisation is on **Pro** | Supabase `get_organization` |
| Next.js 15.5.25, no Supabase library in the portal yet | `app/package.json` |
| Routes and the APIs they call | `grep` of every page: listed in the feature map below |

## Step 0 (separate approval): gate the cleaner now

Independent of accounts, and the most urgent item found: anyone with the cleaner's URL can unpublish
Robin's knowledge. The fix is the broker's existing pattern: a cleaner `middleware.js` that admits only
requests carrying the portal's `x-robin-internal` secret. The Knowledge Factory keeps working through
the portal (which already sends that header); the cleaner's own standalone page stops working, which is
intended. Small (S), one live deploy, verified from outside by `kb_list` returning 401 and the portal's
Factory still loading. **This is a live production change, so it gets its own yes.**

## Design

### Sign-in: emailed six-digit code, invite-only

Supabase Auth, email one-time **code** rather than a magic link. Recommendation, not a verified fact
about INTRUST: corporate mail scanners (for example Microsoft Defender Safe Links) often open links in
emails before the person does, which burns a single-use magic link and shows "link expired". A typed
code is immune to that. Invite-only: sign-in never creates a user (`shouldCreateUser: false`); an admin
invites by email from the Admin page.

Email delivery uses custom SMTP through Resend (already used in this account). Supabase's built-in
sender is meant for testing and is heavily rate-limited (exact limit unverified). The Resend key check
from Phase 0 becomes step 1 here.

Sessions use Supabase's own `@supabase/ssr` cookie helpers (one new library from an existing vendor).

### Data model (one additive migration; no existing table touched)

| Table | Columns | Notes |
|---|---|---|
| `portal_orgs` | `id`, `name`, `plan_ids text[]` | One row to start (INTRUST). Kept so a second organisation is additive later |
| `portal_members` | `user_id` (auth.users), `org_id`, `role`, `invited_by`, `created_at`, `disabled_at` | `role` in `admin`, `leadership`, `call_center`, `viewer` |
| `portal_grants` | `org_id`, `role`, `feature_key`, `enabled` | **Per role, not per organisation** (see decision below) |
| `portal_audit` | `id`, `at`, `actor`, `action`, `target`, `detail jsonb` | Append-only: no update/delete grant, insert from the server only |

All four: RLS on, no policies, read and written by the portal server with the service key, the same
posture as every table today.

**Decision: grants per role, not per organisation.** SCOPE says features are granted to an
organisation and roles act inside a feature. That cannot express what we now need inside one
organisation: leadership sees Accuracy and the Factory, call center reps see Requests and nothing else.
Grants keyed by (organisation, role, feature) express it with no per-user exceptions, which SCOPE
still rules out.

### Feature map (the only source of truth for access)

One file, `lib/features.js`. Every page prefix and every proxied API path belongs to exactly one
feature. A **test fails the build** if any entry in `lib/upstreams.js` or any page route is not mapped,
so a new endpoint cannot ship ungated (the repo has already had one gate that silently matched nothing).

| Feature | Pages | APIs | admin | leadership | call_center | viewer |
|---|---|---|---|---|---|---|
| `home` | `/` | none | ✓ | ✓ | ✓ | ✓ |
| `about` | `/about` | `robin/status` | ✓ | ✓ | ✓ | ✓ |
| `interactions` | `/calls` | `calls`, `channels` | ✓ | ✓ | | ✓ |
| `call_transcripts` | (drawer) | `survey-call`, `call-scores` | ✓ | ✓ | | |
| `quality` | `/survey/*` | `metrics`, `survey-ask`, `survey-themes` | ✓ | ✓ | | ✓ |
| `survey_export` | (button) | `survey-export` | ✓ | | | |
| `accuracy` | `/grader` | `grade` | ✓ | ✓ | | |
| `utilization` | `/utilization` | `utilization` | ✓ | ✓ | | ✓ |
| `dry_run` | `/robin-q-tester/*` | `ask`, `questions` | ✓ | ✓ | | |
| `knowledge_factory` | `/factory/*` | `clean`, `extract`, `refine`, `scan`, `approve`, `kb_list`, `kb_article`, `gaps`, `gap_request` | ✓ | | | |
| `kb_publish` | (button) | `publish`, `unpublish` | ✓ | | | |
| `demo_website` | `/demo-website/*` | none | ✓ | ✓ | | ✓ |
| `admin` | `/admin` | `admin/*` (new) | ✓ | | | |
| `requests` (later) | `/requests` | `requests` | ✓ | | ✓ | |
| `call_audio` (later) | (player) | `call-audio` | ✓ | | | |

The ticks are defaults for you to change; the Admin page edits them. `requests` and `call_audio` are
registered now and off until their features exist.

### Enforcement, three layers

1. **Portal middleware** resolves the session, the member row and the grants, then returns **404**
   (not 403, so a feature's existence is not advertised) for a page or API whose feature is off. No
   session: redirect to `/login` for pages, 401 for APIs. Disabled member: signed out.
2. **The proxy route re-checks** the feature for the API path before forwarding, so a middleware
   matcher mistake cannot open an upstream on its own.
3. **Upstreams accept only the portal.** At cutover the broker's `SURVEY_PASSWORD` branch is deleted
   and the cleaner gets its gate (Step 0), so the only way to the data is through layers 1 and 2. The
   proxy also sends `x-robin-user` (the member id) so the broker can attribute writes; it is trusted
   because only the portal holds the internal secret.

Cost per request: one session check and one grants read. Not measured yet; measured on the preview
(step 4), and a 60-second per-user cache added only if the number says so.

### Admin page (`/admin`, admin role only)

Members (invite by email with a role, change role, disable), the role × feature grid with a toggle per
cell, and the last 200 audit rows. Every change writes an audit row before it takes effect; a change
whose audit write fails does not happen.

## Build and cutover sequence (each step is reversible until step 7)

| # | Step | Touches live? |
|---|---|---|
| 0 | Gate the cleaner (separate approval) | **Yes**, cleaner deploy |
| 1 | Resend key check; Supabase Auth settings: custom SMTP, OTP email template with the code, site and redirect URLs | **Yes**, Supabase Auth config (dashboard; you, or me with your go-ahead) |
| 2 | Migration: the four tables, seeded with one org, the default grant grid, and you as admin | **Yes**, additive tables only |
| 3 | Portal code behind `PORTAL_AUTH=v1` (default stays the password): login page, middleware, proxy re-check, feature map + completeness test, Admin page, audit writes | No (branch + preview) |
| 4 | Preview verification: two accounts, two roles; every success criterion checked by request; latency measured | Preview only |
| 5 | Production: set `PORTAL_AUTH=v1`, invite the first people | **Yes**, flip is one env var, reversible |
| 6 | Watch a few days; you confirm | |
| 7 | Remove `PORTAL_PASSWORD` and the broker's `SURVEY_PASSWORD` branch. Anyone still using the old survey link loses access, by design | **Yes**, not reversible without a redeploy |

## Success criteria (from SCOPE, made checkable)

- [ ] A call center account gets **404 by request** on `/grader`, `/factory/`, `/api/grade`, `/api/kb_list`
      and `/api/survey-call`; a leadership account gets 200 on the same, except the Factory.
- [ ] An unauthenticated request to any page redirects to `/login`; to any `/api/*` gets 401;
      `/api/health` stays open.
- [ ] The cleaner and broker data endpoints answer 401 to anything without the internal secret,
      checked from outside.
- [ ] Invite, sign in, change a role, flip two grants: under a minute, visible on the next page load,
      one audit row per step.
- [ ] The completeness test fails when an unmapped API path is added (shown by adding one in a test).
- [ ] Robin's calls are untouched: `verify_caller`, `get_balance`, `postcall` keep their URLs and stay
      outside every gate.

## Decisions for you

1. **Step 0 now?** Recommended: yes, today, before the rest.
2. **Grants per role** (instead of per organisation). Recommended.
3. **Emailed code** instead of a magic link. Recommended.
4. **The default grid** above, especially: leadership without the Factory and CSV export; viewer
   without transcripts.

## Not verified yet

- Supabase's built-in email limits on Pro (the design does not rely on them).
- Whether INTRUST's mail filtering eats magic links (the design avoids links either way).
- Middleware latency (measured in step 4).
- That Resend's key in the "Lumio Retirement" project is live (step 1).

**Effort:** L (1 to 2 weeks), plus Step 0 (S).
