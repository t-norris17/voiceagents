# ElevenLabs MCP — connecting the workbench to the live workspace

Goal: stop hand-carrying prompts, tools, and KBAs from this repo into the ElevenLabs dashboard.
With the MCP server connected, an agent session can read and change the workspace directly.

Verified 2026-08-26 against the official repo README
([elevenlabs/elevenlabs-mcp](https://github.com/elevenlabs/elevenlabs-mcp)) and the PyPI package.

---

## Use the HOSTED server (the local one is deprecated)

The old local stdio server (`uvx elevenlabs-mcp`, PyPI `elevenlabs-mcp`) is **deprecated and
no longer maintained** — its README now points at the hosted server. Don't install it.

- **URL:** `https://api.elevenlabs.io/v1/mcp`. Workspaces pinned to a **data-residency region**
  are served from a regional host instead — `https://api.us.elevenlabs.io/v1/mcp` for US. The
  claude.ai connector picks the right one itself; only a hand-written `.mcp.json` has to care.
- **Transport:** HTTP
- **Auth:** **OAuth** — you sign in through the browser. No `xi-api-key` is copied into a client
  config, and nothing lands in this repo. That is the reason to prefer it over the local server.

> **Opening the MCP URL in a browser returns `{"detail":"Method Not Allowed"}`. That is correct
> and healthy** — the endpoint answers MCP POSTs, not browser GETs. It is not the OAuth page and
> not a sign of a broken connector. The authorize page is a separate URL on `elevenlabs.io`.

## Two ways in — pick by where you're working

### A. claude.ai connector (works from the web AND locally) ← preferred

**ElevenLabs is in the claude.ai connector directory** ("Create and manage ElevenLabs voice
agents in your chat"). Connect it once at
[claude.ai/customize/connectors](https://claude.ai/customize/connectors) — Settings → Connectors
→ find ElevenLabs → Connect → OAuth in the browser.

Why this is the good path: **connector traffic does not go through a cloud environment's domain
allowlist.** Cloud sessions get connectors provisioned by the host and routed through Anthropic's
MCP proxy, so a web session can use ElevenLabs even though `api.elevenlabs.io` is blocked by the
egress policy. It also solves OAuth — you sign in once in the browser, not in a headless session.
Local Claude Code picks the same connector up automatically when you're logged in to the same
claude.ai account.

Tools the directory advertises: `create_agent`, `delete_agent`, `duplicate_agent`, `get_agent`,
`get_agent_summaries`, `get_agent_link`, `get_agent_knowledge_size`, `calculate_agent_llm_usage`,
plus three more not shown in the listing.

> On Team and Enterprise plans only an admin can add connectors.

### B. `.mcp.json` + OAuth in local Claude Code

The repo's `.mcp.json` declares the hosted server directly. This is the local-only path: a cloud
session sees the server but can't authenticate it (no browser) and can't reach it (blocked host).

```
claude            # start a session in this repo
/mcp              # select "elevenlabs" -> Authenticate -> finish the browser OAuth flow
```

`.mcp.json` holds only a URL; the OAuth token lives in your local Claude Code credential store,
never in git. To register it outside this repo instead:
`claude mcp add --transport http elevenlabs https://api.elevenlabs.io/v1/mcp`.

A server declared here takes precedence over a connector pointing at the same URL; `/mcp` will
list the connector as hidden. Running both is harmless — just don't be surprised by that notice.

## Egress: what the connector does NOT cover

`api.elevenlabs.io` and `elevenlabs.io` are blocked by this org's egress policy (403 on CONNECT),
and the connector routes around that only for MCP calls. Still blocked from a cloud session:
`curl` to the ElevenLabs API, the REST publish pipeline in
`projects/content-cleaner/cleaner/lib/elevenlabs.js`, and reading `elevenlabs.io` docs pages.

To fix those, add the hosts to the environment's allowlist — at
[claude.ai/code](https://claude.ai/code), select the cloud icon above the message box, hover the
environment, open its settings, set **Network access** to **Custom**, and list under
**Allowed domains**:

```
api.elevenlabs.io
elevenlabs.io
*.elevenlabs.io
```

A leading `*.` matches subdomains but not the apex, so list both. Check **Also include default
list of common package managers** or you lose npm/PyPI/GitHub. Changes apply to **new sessions**,
not running ones, and changing allowed hosts re-runs the setup script to rebuild the environment
cache. Each environment has its own list — there's no org-wide allowlist. Shared Team/Enterprise
environments are edited by an Owner under **Cloud environments** in
[admin settings](https://claude.ai/admin-settings).

## What to check on first connect

The hosted server's exact tool list wasn't verifiable from a cloud session (docs host blocked),
so **confirm it with `/mcp` before assuming a capability**. The things this workbench most wants
covered, in rough priority order:

1. **Update an existing agent** (system prompt, first message, turn timeout, system tools) — the
   whole of §1 and §2 of `projects/nestegg-u-demo/elevenlabs-poc-setup.md` is copy-paste today.
2. **Create/attach webhook (server) tools** — §5, the mock-backend tools.
3. **Procedures** (free-form and structured) — §3. These are **Alpha**; expect them to be the
   last thing exposed, if at all.
4. **Knowledge base** create / RAG-index / attach — §4.
5. **Conversations + transcripts** for post-demo review.

The deprecated local server covered only `create_agent`, `add_knowledge_base_to_agent`,
`list_agents`, `get_agent`, `get_conversation`, `list_conversations`, `simulate_conversation`,
`make_outbound_call`, `list_phone_numbers` — note there was **no agent *update*, no procedures,
no webhook-tool creation**. Treat that as the floor, not the ceiling, for the hosted server.

## Keep the REST path for the publish pipeline

MCP is for interactive work — "read Robin's config, apply the prompt change in
`elevenlabs-poc-setup.md`, tell me what moved." It is not the right tool for a repeatable
pipeline, and it won't run inside a Vercel function.

`projects/content-cleaner/cleaner/lib/elevenlabs.js` already does
create-from-text -> compute-rag-index -> attach-to-agent over the REST API with an
`ELEVENLABS_API_KEY`. **That stays.** The two coexist: MCP for a human-in-the-loop session,
REST for anything that has to run unattended.

Whatever an MCP session changes in the workspace, **write it back into the project's
`elevenlabs-*-setup.md`** in the same session. The dashboard is the runtime; this repo is still
the source of truth.

## Safety

The same rules apply to MCP calls as to everything else here: **synthetic test data only**, and
the only real values in play are the demo inbox and the presenter's transfer number. An MCP
session is authenticated against the *live* workspace — an agent update lands immediately, with
no PR to review it. Confirm before mutating anything shared.
