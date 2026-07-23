#!/usr/bin/env node
// Bulk-download ElevenLabs Conversational AI transcripts.
//
// Two-step flow (per the ElevenLabs docs):
//   1. LIST  GET /v1/convai/conversations           -> conversation IDs + metadata (cursor-paginated)
//   2. FETCH GET /v1/convai/conversations/{id}       -> full turn-by-turn transcript JSON
//
// This script adds the parts a naive loop misses: it walks every page of the
// list (the API returns ~30 at a time with a next_cursor), fetches details with
// a small concurrency limit, retries on rate limits / transient errors with
// backoff, and writes BOTH the raw JSON and a readable .txt per call.
//
// Usage:
//   export ELEVENLABS_API_KEY=sk_...            # required
//   node download-transcripts.mjs               # all conversations in the workspace
//   AGENT_ID=agent_xxx node download-transcripts.mjs   # only one agent (e.g. Robin)
//   OUT_DIR=./robin-calls node download-transcripts.mjs
//
// Node 18+ (uses built-in fetch). No dependencies.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.elevenlabs.io/v1/convai/conversations";
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.env.AGENT_ID || null;      // optional filter
const OUT_DIR = process.env.OUT_DIR || "./transcripts";
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);   // max 100
const CONCURRENCY = Number(process.env.CONCURRENCY || 4); // parallel detail fetches
const MAX_RETRIES = 5;

if (!KEY) {
  console.error("Missing ELEVENLABS_API_KEY. Run:  export ELEVENLABS_API_KEY=sk_...");
  process.exit(1);
}

const headers = { "xi-api-key": KEY };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with retry/backoff on 429 + 5xx. Honors Retry-After when present.
async function getJSON(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await sleep(2 ** attempt * 500);
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`${res.status} ${res.statusText} after ${MAX_RETRIES} retries: ${url}`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
      console.warn(`  ${res.status} on ${url} — backing off ${Math.round(wait)}ms`);
      await sleep(wait);
      continue;
    }
    // 401/403/404 etc. — not retryable
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${url}\n${body}`);
  }
}

// Step 1: page through the full conversation list.
async function listAllConversations() {
  const all = [];
  let cursor = null;
  do {
    const u = new URL(API);
    u.searchParams.set("page_size", String(PAGE_SIZE));
    if (AGENT_ID) u.searchParams.set("agent_id", AGENT_ID);
    if (cursor) u.searchParams.set("cursor", cursor);
    const data = await getJSON(u.toString());
    const batch = data.conversations || [];
    all.push(...batch);
    cursor = data.has_more ? data.next_cursor : null;
    console.log(`  listed ${all.length}${data.has_more ? " (more...)" : ""}`);
  } while (cursor);
  return all;
}

// Render a plain-text transcript from the detail payload.
function toText(detail, meta) {
  const lines = [];
  const started = meta?.start_time_unix_secs
    ? new Date(meta.start_time_unix_secs * 1000).toISOString()
    : "unknown";
  lines.push(`Conversation: ${detail.conversation_id}`);
  lines.push(`Agent:        ${detail.agent_id || meta?.agent_name || "?"}`);
  lines.push(`Started:      ${started}`);
  lines.push(`Duration:     ${meta?.call_duration_secs ?? "?"}s`);
  lines.push(`Status:       ${detail.status || meta?.status || "?"}`);
  lines.push("");
  for (const turn of detail.transcript || []) {
    const who = turn.role === "agent" ? "ROBIN" : "CALLER";
    const t = turn.time_in_call_secs != null ? `[${turn.time_in_call_secs}s] ` : "";
    lines.push(`${t}${who}: ${turn.message ?? ""}`);
  }
  return lines.join("\n") + "\n";
}

// Simple concurrency-limited map.
async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Listing conversations${AGENT_ID ? ` for agent ${AGENT_ID}` : ""}...`);
  const convos = await listAllConversations();
  console.log(`Found ${convos.length} conversations. Fetching transcripts -> ${OUT_DIR}`);

  let ok = 0;
  let failed = 0;
  await mapLimit(convos, CONCURRENCY, async (c, idx) => {
    const id = c.conversation_id;
    try {
      const detail = await getJSON(`${API}/${id}`);
      await writeFile(join(OUT_DIR, `${id}.json`), JSON.stringify(detail, null, 2));
      await writeFile(join(OUT_DIR, `${id}.txt`), toText(detail, c));
      ok++;
      console.log(`  [${idx + 1}/${convos.length}] ${id} saved`);
    } catch (err) {
      failed++;
      console.error(`  [${idx + 1}/${convos.length}] ${id} FAILED: ${err.message}`);
    }
  });

  // Write the list metadata as an index for quick scanning / re-runs.
  await writeFile(join(OUT_DIR, "_index.json"), JSON.stringify(convos, null, 2));
  console.log(`\nDone. ${ok} saved, ${failed} failed. Index: ${join(OUT_DIR, "_index.json")}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
