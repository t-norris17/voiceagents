# Robin Portal (app)

One front door for Robin. See `../SCOPE.md`, `../SPEC.md`, `../BUILD.md`.

## Run locally

```
npm install
PORTAL_PASSWORD=pw ROBIN_INTERNAL_SECRET=dev BROKER_URL=https://voiceagents-seven.vercel.app \
CLEANER_URL=https://voiceagents-qewy.vercel.app ELEVENLABS_API_KEY=... \
ELEVENLABS_AGENT_ID=agent_8301kwj5qa8ve1atremxxwjjp9f8 npm run dev
```

`predev`/`prebuild` copy the module pages from the broker and the cleaner into `public/`
(gitignored). The broker must have the same `ROBIN_INTERNAL_SECRET` set or its gated endpoints
answer 401 through the proxy.

## Deploy

Vercel project with **root directory `projects/robin-portal/app`**, linked to this repo. Env vars:

| Name | Value |
|---|---|
| `PORTAL_PASSWORD` | the one shared password (v0) |
| `ROBIN_INTERNAL_SECRET` | long random string; set the same value on the `voiceagents` (broker) project |
| `BROKER_URL` | `https://voiceagents-seven.vercel.app` |
| `CLEANER_URL` | `https://voiceagents-qewy.vercel.app` |
| `ELEVENLABS_API_KEY` | read-only use here: agent, version, KB names |
| `ELEVENLABS_AGENT_ID` | `agent_8301kwj5qa8ve1atremxxwjjp9f8` |

## Tests

`npm test` covers the route map. The gate and proxy were exercised end to end against a mock of the
upstreams (see `../BUILD.md`, Session 1).
