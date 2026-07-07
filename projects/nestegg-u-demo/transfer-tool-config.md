# ElevenLabs — Transfer tool + system-tool config (rebuild sheet)

Quick-rebuild reference for Robin's system tools, in case a dashboard setting gets deleted.
**Synthetic/demo:** the transfer number is the presenter's own phone — it is deliberately kept
**out of the repo**; set it in the ElevenLabs dashboard only.

## System-tool states (Agent → Tools → System tools)

| System tool | State |
|---|---|
| **Skip turn** | **ON** |
| **Transfer to number** | **ON** |
| End conversation | off |
| Detect language | off |
| Update state | off |
| Transfer to agent | off |
| Play keypad touch tone | off |
| Voicemail detection | off |

## `transfer_to_number` — full config

- **Name:** `transfer_to_number`
- **Description:** leave **blank** (uses the default optimized prompt)
- **Interruptions:** Allow
- **Human Transfer Rule** (Add Rule):
  - **Transfer Type:** **Conference** (warm)
  - **Number type:** **Phone**
  - **Phone number:** `+1XXXXXXXXXX` — **E.164** (leading `+1`, no dashes) = the presenter's demo
    phone. *(Actual number lives only in the dashboard, not here.)*
  - **Condition:**
    > Transfer when there is no email on file for the caller (has_email_on_file is false), OR the
    > caller cannot be verified after two attempts, OR the caller explicitly asks to speak with a
    > person or specialist.
- **Spoken messages:** `client_message` (to the caller) and `agent_message` (warm summary to the
  human operator) are **LLM-supplied at call time**, not fields on this tool — they're defined in
  the system prompt (`elevenlabs-poc-setup.md` §2). Nothing to enter here for them.

## Webhook tools (for completeness — details in `elevenlabs-poc-setup.md` §5)

Base URL: `https://lumio-retirement.vercel.app`

| Tool | Method / path |
|---|---|
| `verify_caller` | `POST /api/poc/verify_caller` |
| `send_reset_email` | `POST /api/poc/send_reset_email` |
| `document_resolution` | `POST /api/poc/document_resolution` |
| `get_plan_details` | `POST /api/poc/get_plan_details` |

Post-call webhook (Developers → Webhooks, type Transcription): `POST /api/poc/postcall`.
