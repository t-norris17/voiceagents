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

- **Web test widget** — zero-setup, call from the browser (good for building/demoing).
- **ElevenLabs phone number** — provision a number and dial it (feels like a real line).
- **SIP trunking** — connect existing telephony (e.g. Talkdesk) inbound + outbound; digest auth;
  custom SIP headers pass call context. (Phase 2 for these projects.)
- Docs: `/docs/eleven-agents/phone-numbers/sip-trunking`, `.../sip-reference`

## Voices

- Match the target IVR: for a warm American female support voice, A/B **Sarah** (good default),
  **Rachel**, **Jessica**.
- Settings starting point: Stability ~55–65%, Similarity ~80%, low Style. Use a low-latency
  (Flash/Turbo) model — responsiveness matters most on a call.
