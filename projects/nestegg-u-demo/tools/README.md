# Tools

Small operational scripts for the NestEgg U demo. Not part of the agent or the mock backend.

## `download-transcripts.mjs` — bulk-download ElevenLabs call transcripts

Pulls every conversation from your ElevenLabs workspace (or one agent) and saves each as
**raw JSON** + a **readable `.txt`** transcript. Handles cursor pagination, rate-limit backoff,
and concurrent fetches. Node 18+ , no dependencies.

### Run

```bash
export ELEVENLABS_API_KEY=sk_...        # from ElevenLabs > Profile + API keys
cd projects/nestegg-u-demo/tools

# everything in the workspace
node download-transcripts.mjs

# just Robin's calls (find the agent_id in the ElevenLabs agent URL/settings)
AGENT_ID=agent_xxx node download-transcripts.mjs

# custom output folder
OUT_DIR=./robin-calls node download-transcripts.mjs
```

### What you get

```
transcripts/
  <conversation_id>.json   # full turn-by-turn payload (transcript, metadata, analysis)
  <conversation_id>.txt    # readable: CALLER / ROBIN lines with timestamps
  _index.json              # the list metadata (all conversations, for scanning/re-runs)
```

### Knobs (env vars)

| Var | Default | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | — | **Required.** Sent as the `xi-api-key` header. |
| `AGENT_ID` | (all) | Filter to one agent. |
| `OUT_DIR` | `./transcripts` | Where files land. |
| `PAGE_SIZE` | `100` | List page size (max 100). |
| `CONCURRENCY` | `4` | Parallel detail fetches. Lower it if you hit 429s. |

### Notes
- **API key stays in your shell/env — never commit it.** The script only reads it from the
  environment.
- Endpoints used: `GET /v1/convai/conversations` (list) and
  `GET /v1/convai/conversations/{id}` (detail), per the ElevenLabs Conversational AI API.
- Transcripts of real calls may contain caller PII — treat the output folder as sensitive and keep
  it out of git (it is not committed here).
