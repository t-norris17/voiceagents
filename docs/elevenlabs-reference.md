# ElevenLabs Conversational AI — capability reference

Verified against the live docs during the NestEgg demo work (2026-07). Check here before
answering capability questions — don't rely on memory. Procedures are **Alpha**; expect change.

---

## Procedures

- A **procedure** = a trigger (when it applies) + content (what to do). The agent loads the
  matching procedure by its trigger.
- **Free-form** — natural-language instructions the agent interprets/adapts; **can reference
  Knowledge Base documents and other procedures.** Use for KBA-grounded answers.
- **Structured** — ordered typed steps, run the same way every time; **cannot reference the KB.**
- **You cannot convert** a procedure from one type to the other. Pick correctly up front.
- Content cap: 50,000 characters.
- Trigger *matching internals are not documented* — design conservatively (tight scope in the
  system prompt, default to transfer when unsure).
- Docs: `/docs/eleven-agents/customization/procedures`

## Knowledge Base

- Upload docs (e.g. corrected KBAs); free-form procedures ground their answers on them.
- Keep a mapping of KBA → procedure so updates propagate.
- **Retrieval is native and in-runtime** (ElevenLabs does the embedding + retrieval during the
  call — they publish a "RAG engineered 50% faster" post). So a *managed* KB should **publish into
  ElevenLabs' KB**, not have the agent query an external DB mid-call (that adds a round-trip).

### Knowledge Base API (verified vs live docs, 2026-07-23)

Programmatic KB management exists — you can publish articles from code, no dashboard upload needed:
- **Create from text:** `POST /v1/convai/knowledge-base/text` with `{ text, name? }` → returns
  `{ id, name }`. Auth header `xi-api-key`. Also **create-from-file** and **create-from-url**.
- **Lifecycle:** List / Get / Update / Delete document endpoints exist (manage versions/removals).
- **RAG index (required for retrieval mode):** `POST /v1/convai/knowledge-base/{id}/rag-index`
  (pick an embedding model, e.g. `multilingual_e5_large_instruct`) triggers indexing; poll
  `GET …/rag-index` for status. `GET /v1/convai/knowledge-base/rag-index` gives a size overview.
- **Attach to an agent:** call **Update agent** (`PATCH /v1/convai/agents/{agent_id}`) and add the
  document to the agent's `knowledge_base`, choosing a **usage mode**: **Full context** (whole doc
  in the prompt — small docs only) or **RAG / Auto** (indexed ahead of time; only relevant passages
  retrieved per query — default, best for many/large docs).
- **Publish flow (Architecture A):** create-from-text → compute rag-index → attach to agent. Robin
  then retrieves natively at call time — **no added call-time latency**, no external DB in the loop.
- Docs: `/docs/api-reference/knowledge-base/create-from-text`,
  `/docs/eleven-agents/api-reference/knowledge-base/compute-rag-index`,
  `/docs/eleven-agents/customization/knowledge-base/rag`, `/docs/api-reference/agents/update`.

## Tools (actions mid-call)

- **Server / webhook tools** — the agent calls your external API mid-conversation, filling
  params from the dialogue (e.g. verify caller, send email, document resolution). SMS/email =
  a webhook tool to your provider.
- **Client tools** — run on the client side.
- **System tools** — built-in (see Skip turn, Transfer below).
- Docs: `/docs/agents-platform/customization/tools/server-tools`,
  `/docs/eleven-agents/customization/tools/webhook-tools`

## Transfer to a human

- **`transfer_to_number`** system tool → phone number or SIP URI. Modes: **conference** (warm,
  with an agent message), **blind**, and **SIP REFER** (when the call is over SIP).
- Markets syncing full history to your CCaaS/CRM on handoff.
- Docs: `/docs/conversational-ai/customization/tools/system-tools/transfer-to-human`,
  `.../agent-transfer`

## Conversation flow — staying on the line / check-ins

- **"Take turn after silence"** (1–30s): the agent proactively speaks after the caller is quiet
  — this drives "how's it going?" check-ins. Native max is **30s** (literal 60s needs
  client-side activity pings).
- **Skip turn** system tool: the agent deliberately yields/waits while the caller works.
- **User activity events** reset the turn timeout to keep long calls alive.
- Docs: `/docs/eleven-agents/customization/conversation-flow`,
  `/docs/agents-platform/customization/tools/system-tools/skip-turn`

## Post-call data / metrics

- **Post-call webhook** (`post_call_transcription`): transcript + analysis + metadata to your
  endpoint after the call. Verify the HMAC signature; idempotency on the conversation id.
- **Data Collection**: LLM extracts structured fields you define (topic, outcome, reason) —
  prefer this over parsing transcripts.
- Docs: `/docs/eleven-agents/workflows/post-call-webhooks`,
  `/docs/conversational-ai/customization/agent-analysis/data-collection`

## Telephony

- **Web test widget** — zero-setup, call from the browser (good for building/demoing). No PSTN
  leg, so a live `transfer_to_number` to a real phone won't actually connect from the widget.
- **Phone number = bring-your-own.** ElevenLabs does **not** provision/sell native numbers
  (verified via docs, 2026-07). You **import a Twilio number** (paid Twilio account + a number;
  ElevenLabs auto-detects inbound/outbound on import) or connect a **SIP trunk**.
- **SIP trunking** — connect existing telephony (e.g. Talkdesk, Twilio, Vonage, Telnyx, Plivo…)
  inbound + outbound; digest auth; custom SIP headers pass call context. (Phase 2 for these projects.)
- Docs: `/docs/eleven-agents/phone-numbers/twilio-integration/native-integration`,
  `/docs/eleven-agents/phone-numbers/sip-trunking`

## Voices

- Match the target IVR: for a warm American female support voice, A/B **Sarah** (good default),
  **Rachel**, **Jessica**.
- Settings starting point: Stability ~55–65%, Similarity ~80%, low Style. Use a low-latency
  (Flash/Turbo) model — responsiveness matters most on a call.
