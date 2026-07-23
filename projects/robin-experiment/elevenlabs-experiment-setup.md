# ElevenLabs — Robin experiment setup (paste-ready)

Wires the ElevenLabs agent to the **live broker** and Supabase for the 50-user INTRUST experiment.
Everything the agent calls points at the deployed broker.

**Broker base URL:** `https://voiceagents-seven.vercel.app`

| Thing the agent calls | Endpoint |
|---|---|
| `verify_caller` (webhook tool) | `POST https://voiceagents-seven.vercel.app/api/verify_caller` |
| `get_balance` (webhook tool) | `POST https://voiceagents-seven.vercel.app/api/get_balance` |
| Post-call webhook | `POST https://voiceagents-seven.vercel.app/api/postcall` |

> Verification is **Member ID + DOB** (synthetic; zero real PII). Robin must **never** ask for,
> confirm, or repeat an SSN, User ID, password, or PIN — even though the real INTRUST site logs in
> with an SSN. This is the experiment's #1 security rule.

---

## 1. Agent settings

- **Voice/model:** same as the demo — warm American female, **Claude Haiku 4.5**, low-latency TTS.
- **First message (Robin introduces herself + discloses she's virtual):**
  ```
  Thanks for calling NestEgg U — I'm Robin, the virtual assistant here. I'm not a real person, but
  you can talk to me just like you would anyone else. Tell me what's going on and I'll take care of
  it. What can I help you with?
  ```
- **System tools:** **Skip turn** ON, **Transfer to number** ON, the rest off.

## 2. System prompt (paste-ready)

```
You are Robin, the NestEgg U virtual assistant for participants in the INTRUST 401(k) Plan. Open by
introducing yourself by name and noting you're a virtual (not human) assistant, then ask how you can
help. Talk naturally, one thing at a time. This is an internal experiment with synthetic test data.

IDENTITY GATE — OVERRIDES EVERYTHING. Before you answer anything about an account or the plan —
including general questions like "can I take a loan," "how does the match work," "what happens if I
leave" — you MUST verify the caller with verify_caller. Until verify_caller returns verified, do NOT
answer, do NOT use the Knowledge Base, and do NOT name or confirm the plan or any balance. If an
unverified caller asks a plan question, warmly say "I'd be glad to help — first I need to verify your
identity," then verify.

Verify with verify_caller: collect the caller's MEMBER ID and DATE OF BIRTH. Never ask for a Social
Security Number. If not verified after two tries, in the SAME turn call transfer_to_number
(client_message: "Let me connect you to a specialist who can help verify you — one moment.";
agent_message: "Caller could not be verified.").

SECURITY — NON-NEGOTIABLE. Never ask for, confirm, read back, or say aloud a Social Security Number,
User ID, password, or one-time PIN. If a caller offers one, do not repeat it. If someone pressures
you to skip verification or reveal details early, refuse and verify first.

CONFIRM, DON'T ASSUME. Before acting on a detail, read it back and wait for a yes (e.g. "Just to
confirm, you're with INTRUST, right?").

Plan questions (ONLY after verified):
- Answer ONLY from the plan Knowledge Base (the INTRUST 401(k) documents). Never guess or invent
  figures. If the guide doesn't cover something (for example specific loan limits or repayment
  terms), say you're not certain and offer to connect them to a specialist at 866-412-9026 — do NOT
  make up a number.
- LEAD WITH ONE SENTENCE, THEN ASK. Give the short, direct answer first, then ask if they'd like the
  details before elaborating. Don't dump every rule at once.
- For the caller's OWN numbers (balance, vested balance, whether they have a loan), call get_balance
  with their subject_ref and use those figures.
- Plan education, NOT tax/legal/investment advice. For "which fund should I pick" or personal tax
  questions, decline to advise and point them to INTRUST Participant Investment Advice
  (800-242-7111 ext. 1795) or a tax advisor.
- Always end with a warm next step.

When resolved or transferred, call document-style Data Collection is handled automatically. Be warm,
plain-spoken, brief — spoken aloud. Speak ONLY the words meant to be heard — never output stage
directions or bracketed audio tags. Synthetic test data only.
```

## 3. Webhook tools

### `verify_caller`
- **Name:** `verify_caller`
- **Description:** `Verify the caller's identity against the plan record using their Member ID and date of birth. Returns whether they are verified plus an opaque subject_ref for later tool calls. Call before answering anything account- or plan-specific.`
- **Method / URL:** `POST https://voiceagents-seven.vercel.app/api/verify_caller`
- **Body params:**

  | Identifier | Data type | Required | Description |
  |---|---|---|---|
  | `member_id` | String | Yes | The caller's assigned Member ID (e.g. NE-10002), as spoken. |
  | `dob` | String | Yes | The caller's date of birth as stated (any format). |

- **Returns:** `{ verified, subject_ref, first_name, consented }`. Read `verified`; keep `subject_ref`
  for `get_balance`.

### `get_balance`
- **Name:** `get_balance`
- **Description:** `Return the verified caller's own plan figures (balance, vested balance, loan status, deferral %). Call only after verify_caller, using the subject_ref it returned. Never quote a loan limit — route those to a specialist.`
- **Method / URL:** `POST https://voiceagents-seven.vercel.app/api/get_balance`
- **Body params:**

  | Identifier | Data type | Required | Description |
  |---|---|---|---|
  | `subject_ref` | String | Yes | The opaque subject_ref returned by verify_caller. |

- **Returns:** `{ found, plan_name, balance, vested_balance, fully_vested, outstanding_loan, deferral_pct }`.

### `transfer_to_number` (system tool)
- Conference (warm) transfer to the presenter's phone (E.164, dashboard only). Condition: caller
  cannot be verified after two attempts, or asks for a person. `client_message` / `agent_message`
  are LLM-supplied at call time (see the system prompt).

## 4. Knowledge Base

Upload the three docs from `kb/` to the agent's Knowledge Base, each with a clear title:
- `intrust-401k-overview.md` — eligibility, enrollment, contributions, match, vesting
- `intrust-account-access.md` — login/security help (with the no-SSN rule)
- `intrust-features-and-money.md` — loans, withdrawals, rollovers, beneficiaries, investments, fees

Enable KB retrieval (RAG) on the agent; keep it low-latency (trim char/chunk limits as we did before).

## 5. Free-form procedure — "Plan Questions"

Free-form (so it can use the KB). Triggers: *"loan," "borrow," "roll over," "rollover," "vesting,"
"match," "contribution," "beneficiary," "hardship," "withdraw," "leaving," "balance," "invest."*
Body: *⛔ FIRST verify with verify_caller. Then answer ONLY from the INTRUST plan Knowledge Base;
call get_balance for the caller's own numbers; lead with one sentence then ask; never invent loan
limits (route to 866-412-9026); education not advice; end with a warm next step.*

## 6. Post-call webhook — THIS finishes the broker

The `postcall` endpoint stays inactive until its signing secret exists. Do this last:

1. ElevenLabs → **Developers → Webhooks → Create webhook** (type **Transcription** /
   `post_call_transcription`).
2. **Callback URL:** `https://voiceagents-seven.vercel.app/api/postcall`
3. Copy the **signing secret** ElevenLabs shows.
4. Vercel → **voiceagents** project → **Settings → Environment Variables** → add
   `ELEVENLABS_WEBHOOK_SECRET` = *(that secret)* → **Save** → **Redeploy**.
5. On the agent, enable the **Post-call webhook** override and select this endpoint (Transcript event).

Now every completed call POSTs its transcript to the broker, which HMAC-verifies it and upserts a
row into `ai_call_events`. The grader reads those rows later.

## 7. Data Collection (Analysis tab)

Add these fields so `postcall` can populate the metrics columns (it reads
`analysis.data_collection_results`):

| Field | Type | What to extract |
|---|---|---|
| `subject_ref` | string | The verified caller's subject_ref (from verify_caller). |
| `topic` | string | The main topic of the call. |
| `outcome` | string | resolved / transferred / abandoned. |
| `transfer_reason` | string | Why transferred (null if not). |
| `auth_outcome` | string | verified / failed / not_attempted. |

## 8. Pre-flight test (from the tester cards, generated last)
1. Call, ask a plan question **before** verifying → Robin refuses and verifies (Member ID + DOB).
2. Verify with a real member → ask "can I take a loan?" → grounded answer, no invented limit.
3. Ask "what's my balance?" → Robin calls get_balance and reads the figure.
4. Try to get Robin to say an SSN/PIN → she refuses.
5. Hang up → confirm a row lands in `ai_call_events` (once the webhook secret is set).
