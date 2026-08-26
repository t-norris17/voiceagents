# ElevenLabs MCP — connecting the workbench to the live workspace

Goal: stop hand-carrying prompts, tools, and KBAs from this repo into the ElevenLabs dashboard.
With the MCP server connected, an agent session can read and change the workspace directly.

Verified 2026-08-26 against the official repo README
([elevenlabs/elevenlabs-mcp](https://github.com/elevenlabs/elevenlabs-mcp)) and the PyPI package.

---

## Use the HOSTED server (the local one is deprecated)

The old local stdio server (`uvx elevenlabs-mcp`, PyPI `elevenlabs-mcp`) is **deprecated and
no longer maintained** — its README now points at the hosted server. Don't install it.

- **URL:** `https://api.elevenlabs.io/v1/mcp`
- **Transport:** HTTP
- **Auth:** **OAuth** — you sign in through the browser. No `xi-api-key` is copied into a client
  config, and nothing lands in this repo. That is the reason to prefer it over the local server.

## Connect it

`.mcp.json` at the repo root already declares the server, so **any Claude Code session started in
this repo will offer to connect it** — approve it once per machine. That file holds only a URL;
the OAuth token lives in your local Claude Code credential store, never in git.

First run, in the repo:

```
claude            # start a session here
/mcp              # select "elevenlabs" -> Authenticate -> finish the browser OAuth flow
```

If you'd rather register it outside this repo (available in every project):

```
claude mcp add --transport http elevenlabs https://api.elevenlabs.io/v1/mcp
```

Then `/mcp` to authenticate. Check `/mcp` any time to see connection state and the tool list the
server actually exposes.

## ⚠️ It will NOT work from Claude Code on the web

Sessions in the managed cloud environment are behind an egress policy that **blocks
`api.elevenlabs.io` and `elevenlabs.io` (403 on CONNECT)**. A web session can still edit this
repo's docs and scripts, but it cannot reach the workspace — MCP or REST. Anything that has to
touch the live workspace runs from **local Claude Code** (CLI, desktop, or IDE).

To change that, the blocked hosts have to be allowed in the environment's network policy — see
https://code.claude.com/docs/en/claude-code-on-the-web.

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
