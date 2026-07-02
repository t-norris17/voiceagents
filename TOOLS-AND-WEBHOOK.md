# Build artifacts — OTP tool, post-call webhook, topic taxonomy

**Project:** lumio-retirement-voice
**Status:** draft (ready to port to the retirement repo)
**Last updated:** 2026-07-01

These are the vendor-neutral contracts the retirement app must implement. They do
**not** live in wealth-command — they port to the retirement repo when it exists.
Endpoints are described as Vercel serverless (`/api/...`) to match the Lumio stack.

---

## 1. OTP tool (custom server tool for the ElevenLabs agent)

ElevenLabs has no native OTP. The agent calls these two endpoints as custom tools.
OTP verifies **identity only** — it does not authorize any transaction (v1 is answer-only).

### `POST /api/otp/start`

Request (from the agent tool call):
```json
{ "channel": "sms",            // "sms" | "email"
  "destination_ref": "…",       // opaque handle the agent already has (e.g. from SIP header),
                                //   OR a caller-provided phone/email to be validated server-side
  "conversation_id": "…" }      // provider conversation id, for correlation + rate-limiting
```
Response:
```json
{ "ok": true, "attempt_id": "uuid", "expires_in": 300 }
```
Server responsibilities:
- Generate a 6-digit code, hash it, store `{attempt_id, hash, expires_at, tries:0}` (short TTL, e.g. 5 min).
- Send the code via the SMS/email provider.
- **Rate-limit** per destination + per conversation; lock after N sends.
- Never return the code in the response.

### `POST /api/otp/verify`

Request:
```json
{ "attempt_id": "uuid", "code": "123456", "conversation_id": "…" }
```
Response (success):
```json
{ "verified": true, "subject_ref": "opaque-id" }
```
Response (failure):
```json
{ "verified": false, "reason": "invalid" }   // "invalid" | "expired" | "locked"
```
Server responsibilities:
- Compare against the stored hash; enforce max tries (e.g. 3) then lock.
- On success, return an **opaque `subject_ref`** (not raw PII) the agent can attach to
  the conversation and that flows through to `ai_call_events`.
- Emit `auth_outcome` (`verified` / `failed`) for the metrics record.

**Failure handling:** on `locked`/`expired` or repeated `invalid`, the agent should
stop retrying and **transfer to a human** (auth is a hard gate, not a loop).

---

## 2. Post-call webhook receiver

### `POST /api/voice/postcall`

Consumes the ElevenLabs `post_call_transcription` webhook.

Server responsibilities (in order):
1. **Verify HMAC signature** against the shared webhook secret. Reject if invalid.
2. **Idempotency:** upsert on `(provider, conversation_id)` — retries must not double-count.
3. **Map** provider fields → `ai_call_events` columns. Prefer ElevenLabs **Data Collection**
   (LLM-extracted structured fields) over transcript parsing:

   | ai_call_events column | Source |
   |---|---|
   | `conversation_id` | webhook `conversation_id` |
   | `started_at` / `ended_at` / `duration_seconds` | call metadata |
   | `topic` | Data Collection field `topic` → mapped to taxonomy key |
   | `outcome` | Data Collection field `outcome` (`resolved`/`transferred`/`abandoned`) |
   | `transfer_reason` | Data Collection field `transfer_reason` (null unless transferred) |
   | `auth_outcome` | set by the OTP tool during the call; echoed in metadata |
   | `subject_ref` | opaque id from OTP verify |
   | `cost_cents` | call cost if provided |
   | `raw_payload` | full body (**scrub PII first** if present) |

4. **Persist** and return `200` quickly (do heavy work async if needed).

**Security:** service-role DB write; never trust the payload without HMAC; scrub any
raw PII out of `raw_payload` before storing.

---

## 3. Topic taxonomy (single source of truth)

Both Talkdesk Navigator (AI-eligible vs human) and the ElevenLabs procedure triggers
must be driven from **one** authored list. Drift = callers routed to the AI for things
it then bounces back.

```ts
// config/topic-taxonomy.ts  (ported to the retirement repo)
export type Topic = {
  key: string;            // stable id, also stored in ai_call_events.topic
  label: string;          // human label (Navigator prompt + dashboard)
  aiEligible: boolean;    // true → route to AI agent; false → straight to human
  kbaRefs: string[];      // KCS KBA ids backing this topic (free-form procedure grounds on these)
  answerOnly: true;       // v1 invariant: informational only, never transactional
};

// Proposed v1 pilot set — see SCOPE.md (confirm before locking):
export const PILOT_TOPICS: Topic[] = [
  { key: 'portal_login',      label: 'Portal login / password reset', aiEligible: true, kbaRefs: [], answerOnly: true },
  { key: 'balance_statements',label: 'Check balance / find statements', aiEligible: true, kbaRefs: [], answerOnly: true },
  { key: 'contributions',     label: 'How contributions / changes work', aiEligible: true, kbaRefs: [], answerOnly: true },
  { key: 'loans_basics',      label: 'Loan eligibility & how to request', aiEligible: true, kbaRefs: [], answerOnly: true },
  { key: 'distributions',     label: 'Leaving employer: rollover/distribution process', aiEligible: true, kbaRefs: [], answerOnly: true },
  // everything else → aiEligible:false → human queue
];
```

Maintenance: when a KCS KBA changes, update `kbaRefs` and re-sync the ElevenLabs KB
(owner + cadence is an open question in SCOPE).
