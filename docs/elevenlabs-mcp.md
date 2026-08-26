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
- **Data residency matters at connect time.** The connector's OAuth page renders **blank** if the
  region is wrong for the workspace. Setting residency to **Global** is what fixed it here; a `.us.`
  host produced a white authorize screen even while logged in. If you get a blank page, change the
  region before debugging the browser.
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

### B. Local `.mcp.json` — removed, don't re-add

An earlier pass declared the hosted server in a repo `.mcp.json`. It's gone: a server added in
Claude Code takes precedence over a connector, so keeping both risks shadowing the working
connector with an unauthenticated duplicate. The connector covers local Claude Code too.

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

## Verified tool surface (connected 2026-08-26)

Far wider than the deprecated local server, and it covers every part of
`elevenlabs-poc-setup.md` that used to be copy-paste:

- **Agents:** `agents_list`, `agents_get`, `agents_create`, **`agents_update`**, `agents_delete`,
  `agents_duplicate`, `agents_get_link`, `agents_get_widget`, `agents_get_summaries`.
- **Procedures — yes, these are exposed:** `agents_list_procedures`, `agents_get_procedure`,
  `agents_create_procedure`, `agents_update_procedure_draft`, `agents_compile_procedures`,
  `agents_delete_procedure`.
- **Tools:** `agents_list_tools`, `agents_get_tool`, `agents_create_tool`, `agents_update_tool`,
  `agents_delete_tool`, `agents_get_tool_dependents`, `agents_get_tool_executions`.
- **Knowledge base:** `agents_create_kb_text`, `agents_create_kb_url`, `agents_update_kb_document`,
  `agents_list_knowledge_base`, `agents_search_knowledge_base`, `agents_query_knowledge_base_rag`,
  `agents_get_kb_dependents`, `agents_bulk_*`.
- **Branches, drafts, versions, deployments:** `agents_create_branch`, `agents_merge_branch`,
  `agents_merge_branch_preview`, `agents_create_draft`, `agents_get_version`,
  `agents_create_deployment` — safe review-then-merge edits instead of live mutation.
- **Tests:** `agents_create_test`, `agents_run_tests`, `agents_list_test_runs`, `agents_get_test_run`.
- **Conversations:** `agents_list_conversations`, `agents_get_conversation`,
  `agents_search_conversation_messages`, `agents_get_topics`, `agents_resolve_conversation`.
- **Phone numbers, MCP servers, triage tickets** round it out, plus a `creative_*` family for
  TTS/image/video generation.

`agents_update` and `agents_create_procedure` existing is the headline: §1–§5 of a project's
`elevenlabs-*-setup.md` no longer have to be pasted into the dashboard by hand.

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
