# Broker — Robin experiment

Dependency-free Vercel functions between ElevenLabs (Robin) and Supabase. Deploy this folder to a
throwaway Vercel project; set env vars from `.env.example` in the project settings.

**Deployed:** `https://voiceagents-seven.vercel.app` (Vercel project `voiceagents`, root directory
`projects/robin-experiment/broker`). `verify_caller` + `get_balance` are live; `postcall` activates
once `ELEVENLABS_WEBHOOK_SECRET` is set (see `../elevenlabs-experiment-setup.md` §6).

| Endpoint | Method | In → Out |
|---|---|---|
| `/api/verify_caller` | POST | `{ member_id, dob }` → `{ verified, subject_ref, first_name, consented }` |
| `/api/get_balance` | POST | `{ subject_ref }` → `{ found, plan_name, balance, vested_balance, fully_vested, outstanding_loan, deferral_pct }` |
| `/api/postcall` | POST | ElevenLabs post-call webhook (HMAC-verified) → upsert `ai_call_events`; every attempt, accepted or turned away, is logged to `webhook_ingest_log` |
| `/api/health` | GET | Is this deployment wired up? Which env vars are set (presence only, never values), which tables it can read, and a fixable-problem list. Read by the dashboard. |
| `/api/ask` | POST | `{ question }` → Robin-style answer grounded in the embedded KB (Phase-1 Q&A test tool) |
| `/api/questions` | GET | `{ questions:[{n,key,category,q,ideal}] }` — the 25 curated questions + answer key (from `lib/questions.js`) |
| `/` (static) | GET | The Phase-1 Q&A test page (`public/index.html`) — paste questions, get answers, resend for variation |

## Phase-1 Q&A test tool (`/` + `/api/ask`)

A boss-facing page to pressure-test Robin's answers without placing a call. Paste plan questions →
each is answered by **Haiku 4.5** (same model Robin runs on) grounded in `lib/kb.js` (the INTRUST KB
embedded from `../kb/*.md`). Needs `ANTHROPIC_API_KEY` set on the project. The endpoint is unauthenticated —
fine for an internal, synthetic-data tool; don't share the link beyond the intended reviewers.

The page renders Markdown (bold/bullets, no raw asterisks), shows each answer's **round-trip latency**,
and — for any question that matches one of the 25 — displays the **ideal answer** (the grader's answer
key) inline for side-by-side comparison. **Load the 25** fills the box with the curated set. The curated
Q&A comes from `lib/questions.js`, which mirrors `../curated-questions.md` — keep the two in sync when you
edit the answer key.

**Regenerate `lib/kb.js`** when the KB docs change:
```bash
cd ../kb && node --input-type=module -e "import {readFileSync,writeFileSync} from 'fs'; \
const f=['intrust-401k-overview.md','intrust-account-access.md','intrust-features-and-money.md']; \
writeFileSync('../broker/lib/kb.js','export const KB = '+JSON.stringify(f.map(x=>readFileSync(x,'utf8')).join('\n\n---\n\n'))+';\n')"
```

## Register in ElevenLabs

- **Webhook tools** (Agent → Tools) → `verify_caller`, `get_balance` pointing at the deployed URLs.
- **Post-call webhook** (Developers → Webhooks, Transcription) → `/api/postcall`; copy the signing
  secret into `ELEVENLABS_WEBHOOK_SECRET`.
- To read `subject_ref` back on `postcall`, add a **Data Collection** field `subject_ref` (plus
  `topic`, `outcome`, `transfer_reason`, `auth_outcome`) so outcomes land structured.

## "Calls are coming in but not showing up"

A call becomes a number on the dashboard only by surviving three hops, and each one could drop it
silently:

```
webhook accepted  →  row with a transcript  →  graded  →  counted in the metrics
```

The dashboard rendered only what survived all three, so a webhook rejecting every call, a provider
sending transcript-less events, and a genuinely quiet afternoon all looked identical. Three changes
close that:

1. **`webhook_ingest_log`** (`supabase/migrations/003_webhook_ingest_log.sql`) records every
   post-call webhook attempt, accepted or not, with the reason. **Run this migration** — until you
   do, the dashboard reports rejections as *unknown* rather than claiming zero. It stores no payload
   and no caller data, only what happened to the request.
2. **`/api/health`** answers the questions the data can't: is `ELEVENLABS_WEBHOOK_SECRET` set (with
   no secret, every call is turned away), is `ANTHROPIC_API_KEY` set (without it calls arrive but
   nothing is scored), do the tables exist.
3. **`/api/metrics` returns a `pipeline` block** — received / checked / waiting / can't-be-checked,
   plus rejection counts by reason — which the dashboard shows as "Where your calls are".

Two ordering bugs went with it. Calls were ordered by the provider's `started_at` with nulls last,
then cut to the top 20 — so a call with no start time sat at the end of the list and never appeared,
while plainly existing in the database. Ordering is now by arrival (`created_at`), which always
exists. And a call with no transcript was counted as "waiting to be graded" forever, which made the
queue look like it never drained; it's now reported as un-gradable, with what to fix.

Grading runs from the dashboard page, ten calls per request. It now keeps going while there's a
backlog instead of one batch per 30 seconds, and a failing `/api/grade` is shown instead of being
swallowed by an empty `catch`.

## Grading against the real knowledge base

The grader has no answer key. For each call it reconstructs what Robin retrieved — ElevenLabs
records the `document_id` of every chunk in `rag_retrieval_info` — and asks whether what she SAID is
supported by what she READ.

It used to resolve those document ids against our own `kb_articles` table, which only holds
documents *we* published. Measured on the first 39 calls:

| | |
|---|---|
| calls that retrieved something from the KB | 38 of 39 |
| calls we could actually grade against it | **3 of 39** |
| answers graded `no_source` | **100 of 108** |
| average quality of those 100 unchecked answers | **4.24 / 5** |

Five documents carried nearly all the retrieval traffic (30–37 calls each) and none of them were
ours — they had been uploaded straight into the ElevenLabs dashboard. And an answer with no source
has no claims, so it takes no grounding deductions and scores near 5 by default. The dashboard's
"and got it right: 4.2/5" was computed almost entirely from answers nobody had checked.

`lib/elevenlabs-kb.js` closes it: document text now comes from
`GET /v1/convai/knowledge-base/{id}/content`, cached in `kb_document_cache`, whoever uploaded it.
**Set `ELEVENLABS_API_KEY` on the deployment** — without it the grader is still blind and
`/api/health` says so.

### Two scores, never blended

- **Accuracy** — was what she said supported by the documents she retrieved? Contradiction −1.5
  (cap 3), unsupported claim −1.0 (cap 2.5).
- **Quality** — did she answer what was asked, fully, and hand off when she should have?

They're separate because they fail separately, and the dangerous call is the one where they
diverge: fluent, complete, confident, and containing a figure the plan documents never state.
Accuracy is **null when nothing could be checked** — unknown, not good. A null is never averaged in.

### Utilization

`utilization.pct` = **calls where at least one answer was grounded in a KB article / calls where a
plan question was asked.** "62% utilization" means 62% of Robin's calls were answered out of the
knowledge base.

Grounded in an article is stricter than "she said something" — an answer she improvised, read off a
tool, or recited from her system prompt is not the library working, and counting it would make the
number measure Robin's fluency rather than the KB's coverage. Calls where nobody asked a plan
question (wrong numbers, pure transfers, auth failures) are out of the denominator; they aren't a KB
miss. Each call lists exactly which of its questions the KB didn't answer, and why.

`question_kb_pct` (share of individual questions) and `answered_pct` (handled at all, however) sit
alongside it, because they're different facts and showing one invites the other to be assumed.

### Re-grading

`POST /api/grade?regrade=1` re-scores calls that already have a `scored_at` but no `accuracy_score`
— calls graded before the grader could read the KB. Ten per request. The dashboard offers it as a
button rather than doing it automatically: it costs a model call per call.

## Security model

- **Service role key is server-only** (`lib/supabase.js`). Never in the browser or the ElevenLabs
  tool config. RLS-on tables are reachable only via this broker.
- Tools return the **opaque `subject_ref`** (members.id), never the member_id or DOB.
- `get_balance` intentionally omits any loan limit — the guide has none, so Robin routes
  loan-amount questions to a specialist instead of quoting a figure.
- `postcall` **rejects unsigned/mis-signed** payloads (HMAC-SHA256 over `t.rawBody`).

## Verification model

Callers verify with **assigned Member ID + synthetic DOB** (see `../seed/` for the tester cards).
No SSN anywhere. `parse.js` tolerates spoken input ("N E one zero zero zero one", "January 1st 1962").
