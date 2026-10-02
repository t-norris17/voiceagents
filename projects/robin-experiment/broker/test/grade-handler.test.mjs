// POST /api/grade, the whole handler, against a stub of the database (PostgREST) and a stub of the model.
//
// The defect this pins down: two overlapping runs chose the same interactions, both paid the model, and both
// wrote rows (under different, model-invented topic keys), so the interaction appeared twice. Now each
// interaction is claimed first and a run only pays for what it holds. Needs the Anthropic SDK; without it the
// file is SKIPPED, not passed.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

let hasSdk = true;
try { createRequire(import.meta.url)("@anthropic-ai/sdk"); } catch { hasSdk = false; }
const skip = hasSdk ? false : "the Anthropic SDK is not installed here";

process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.ROBIN_INTERNAL_SECRET = "s3cret";
delete process.env.ELEVENLABS_API_KEY;

// ---- an in-memory PostgREST that understands the filters this handler uses ------------------------------
const state = { events: [], scores: [], questions: [], modelCalls: 0, keyCounter: 0, modelFails: false, lastRequest: null };
const TABLES = { ai_call_events: "events", call_question_scores: "scores", call_questions: "questions" };
function match(row, url) {
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
    if (v === "is.null") { if (row[k] != null) return false; }
    else if (v === "not.is.null") { if (row[k] == null) return false; }
    else if (v.startsWith("eq.")) { if (String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith("in.")) { const set = [...v.matchAll(/"([^"]+)"/g)].map((m) => m[1]); if (!set.includes(String(row[k]))) return false; }
  }
  return true;
}
const json = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status: body == null && status === 200 ? 204 : status, headers: { "content-type": "application/json", "request-id": "req_test" } });

globalThis.fetch = async (input, init = {}) => {
  const href = String(input?.url || input);
  if (href.includes("api.elevenlabs.io/v1/convai/agents/")) {
    return json({ conversation_config: { agent: { prompt: { prompt: "You are Robin.", temperature: 0.4, knowledge_base: [{ id: "docloans01", name: "Vertex Manufacturing 401(k) — Loans...", usage_mode: "auto" }] } } } });
  }
  if (href.includes("api.elevenlabs.io/v1/convai/knowledge-base/")) {
    return json({ name: "Loans", extracted_inner_html: "<h1>Loans</h1><h2>Can I take a loan?</h2><p>Yes.</p><h2>Terms and cost</h2><p>Up to 5 years. A $75 fee.</p>" });
  }
  if (href.includes("api.anthropic.com")) {
    state.modelCalls += 1;
    const req = JSON.parse(init.body || "{}");
    state.lastRequest = req;
    await new Promise((r) => setTimeout(r, 25)); // a real call takes seconds; this lets overlapping runs interleave
    if (state.modelFails) return json({ type: "error", error: { type: "invalid_request_error", message: "rejected" } }, 400); // 400: the SDK does not retry it
    const n = ++state.keyCounter; // without a menu: a NEW topic key every call, like the real model before this change
    const menu = req?.output_config?.format?.schema?.properties?.answers?.items?.properties?.canonical_key?.enum;
    const ans = (key, q) => ({ canonical_key: key, question_text: q, answer_text: "A $75 fee.", claims: [], answered_the_question: true, complete: true, appropriately_routed: true, sentiment: "neutral", sentiment_score: 0, note: "" });
    const qst = (key, q) => ({ canonical_key: key, canonical_question: q, asked_text: q.toLowerCase(), category: "loans", answered: true, fail_reason: "" });
    const out = menu
      // with a menu: two questions on ONE topic, as the real model did four ways before
      ? { answers: [ans(menu[1], "What does a loan cost?"), ans(menu[1], "What are the fees?")], all_questions: [qst(menu[1], "What does a loan cost?"), qst(menu[1], "What are the fees?")], security_flag: false, security_detail: "" }
      : { answers: [ans(`loan-fees-${n}`, "What does a loan cost?")], all_questions: [qst(`loan-fees-${n}`, "What does a loan cost?")], security_flag: false, security_detail: "" };
    return json({ id: "msg_1", type: "message", role: "assistant", model: "m", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 1, output_tokens: 1 } });
  }
  if (!href.startsWith("http://db.test/rest/v1/")) return json({ error: "unexpected " + href }, 500);
  const url = new URL(href);
  const table = TABLES[url.pathname.split("/").pop()];
  const method = (init.method || "GET").toUpperCase();
  await Promise.resolve();
  if (url.pathname.endsWith("kb_articles")) return json([]);
  if (!table) return json({ error: "unknown table " + url.pathname }, 400);
  const rows = state[table];
  const body = init.body ? JSON.parse(init.body) : null;
  if (method === "GET") {
    let out = rows.filter((r) => match(r, url));
    const lim = Number(url.searchParams.get("limit")); const off = Number(url.searchParams.get("offset")) || 0;
    const ord = url.searchParams.get("order");
    if (ord?.startsWith("started_at.desc")) out = [...out].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    if (lim) out = out.slice(off, off + lim);
    return json(out.map((r) => ({ ...r })));
  }
  if (method === "PATCH") {
    const hit = rows.filter((r) => match(r, url));
    for (const r of hit) Object.assign(r, body);
    return String(init.headers?.Prefer || "").includes("return=representation") ? json(hit.map((r) => ({ conversation_id: r.conversation_id }))) : json(null, 204);
  }
  if (method === "DELETE") { state[table] = rows.filter((r) => !match(r, url)); return json(null, 204); }
  if (method === "POST") { // upsert on (conversation_id, key)
    const keyCol = table === "scores" ? "question_key" : "canonical_key";
    for (const b of [].concat(body)) {
      const i = rows.findIndex((r) => r.conversation_id === b.conversation_id && r[keyCol] === b[keyCol]);
      if (i >= 0) Object.assign(rows[i], b); else rows.push({ ...b });
    }
    return json(null, 201);
  }
  return json({ error: "unsupported" }, 400);
};

const { default: handler } = hasSdk ? await import("../api/grade.js") : { default: null };

const TRANSCRIPT = [{ role: "agent", message: "Thanks for calling." }, { role: "user", message: "What does a loan cost?" }, { role: "agent", message: "A $75 fee." }];
function seed(n) {
  state.events = Array.from({ length: n }, (_, i) => ({ conversation_id: `conv_test${String(i).padStart(3, "0")}`, provider: "elevenlabs", started_at: `2026-10-0${1 + (i % 2)}T${String(10 + i).padStart(2, "0")}:00:00Z`, scored_at: null, transcript: TRANSCRIPT, security_flag: false, security_detail: null }));
  state.scores = []; state.questions = []; state.modelCalls = 0; state.keyCounter = 0;
}
function run(body, headers = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method: "POST", body, headers }, res);
  });
}
const perConv = (rows) => { const m = new Map(); for (const r of rows) m.set(r.conversation_id, (m.get(r.conversation_id) || 0) + 1); return m; };

test("one run grades what it holds: one model call each, one row each, all stamped", { skip }, async () => {
  seed(4);
  const r = await run(undefined);
  assert.equal(r.code, 200);
  assert.equal(r.body.graded, 4); assert.equal(r.body.skipped, 0); assert.equal(state.modelCalls, 4);
  assert.ok(state.events.every((e) => e.scored_at), "every interaction is stamped");
  assert.deepEqual([...perConv(state.scores).values()], [1, 1, 1, 1]);
});

test("two OVERLAPPING runs pay once and write once: no interaction is graded twice", { skip }, async () => {
  seed(6);
  const [a, b] = await Promise.all([run(undefined), run(undefined)]);
  assert.equal(state.modelCalls, 6, "the model was called once per interaction, not once per run");
  assert.equal(a.body.graded + b.body.graded, 6);
  assert.equal(a.body.graded + a.body.skipped, 6, "each run saw all six; what it did not hold, it skipped");
  assert.ok(a.body.skipped > 0 || b.body.skipped > 0, "the loser was told so");
  assert.deepEqual([...perConv(state.scores).values()], [1, 1, 1, 1, 1, 1], "one row per interaction: no duplicates");
  assert.deepEqual([...perConv(state.questions).values()], [1, 1, 1, 1, 1, 1]);
});

test("a run that holds nothing says so and spends nothing", { skip }, async () => {
  seed(2);
  for (const e of state.events) e.scored_at = "2026-10-01T00:00:00.000Z"; // graded by someone else just now
  const r = await run({ conversation_ids: [state.events[0].conversation_id] }, { "x-robin-internal": "s3cret" });
  assert.equal(r.code, 200); assert.equal(r.body.graded, 0); assert.equal(state.modelCalls, 0);
});

test("if grading fails, the claim is given back so the interaction is not left looking graded", { skip }, async () => {
  seed(2);
  state.modelFails = true;
  try {
    const r = await run(undefined);
    assert.equal(r.body.graded, 0); assert.equal(r.body.failed.length, 2);
    assert.ok(state.events.every((e) => e.scored_at == null), "claims released: both are ungraded again");
    assert.equal(state.scores.length, 0);
  } finally { state.modelFails = false; }
});

test("a re-grade of an interaction holding an old pass replaces it, leaving exactly the new rows", { skip }, async () => {
  seed(1);
  const id = state.events[0].conversation_id;
  state.events[0].scored_at = "2026-09-15T21:18:46.063+00:00";
  state.scores = ["old-a", "old-b", "old-c"].map((k) => ({ conversation_id: id, question_key: k, grounding: "no_source" }));
  state.questions = ["old-a", "old-b", "old-c"].map((k) => ({ conversation_id: id, canonical_key: k, answered: true }));
  const r = await run({ conversation_ids: [id], regrade: true }, { "x-robin-internal": "s3cret" });
  assert.equal(r.body.graded, 1, JSON.stringify(r.body));
  assert.equal(state.modelCalls, 1);
  assert.equal(state.scores.length, 1); assert.equal(state.questions.length, 1);
  assert.match(state.scores[0].question_key, /^loan-fees-/);
  assert.ok(state.events[0].scored_at && state.events[0].scored_at !== "2026-09-15T21:18:46.063+00:00", "restamped");
});

test("grading by id and re-grading are refused without the internal secret, and spend nothing", { skip }, async () => {
  seed(1);
  const r = await run({ conversation_ids: [state.events[0].conversation_id] });
  assert.equal(r.code, 403); assert.equal(state.modelCalls, 0); assert.equal(state.events[0].scored_at, null);
});

test("with Robin's documents readable, the grader holds the model to a topic menu and leaves ONE row per topic", { skip }, async () => {
  seed(1);
  process.env.ELEVENLABS_API_KEY = "k"; process.env.ELEVENLABS_AGENT_ID = "agent_test";
  try {
    const r = await run(undefined);
    assert.equal(r.body.graded, 1, JSON.stringify(r.body));
    const schemaIds = state.lastRequest.output_config.format.schema.properties.answers.items.properties.canonical_key.enum;
    assert.ok(schemaIds.includes("loans--terms-and-cost") && schemaIds.includes("account-figures") && schemaIds.includes("other"), "the menu is Robin's sections plus the two fixed entries");
    assert.ok(!schemaIds.some((i) => /common/.test(i)));
    assert.match(state.lastRequest.messages[0].content, /TOPIC MENU/);
    assert.equal(state.scores.length, 1, "two answers on one topic are one row");
    assert.equal(state.questions.length, 1);
    assert.equal(state.scores[0].question_key, "loans--terms-and-cost", "the key is the topic itself");
    assert.equal(state.questions[0].canonical_key, "loans--terms-and-cost");
    assert.equal(state.questions[0].category, "loans");
    assert.match(state.questions[0].canonical_question, /What does a loan cost\? \/ What are the fees\?/, "both questions are kept in the text");
  } finally { delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_AGENT_ID; }
});

test("if Robin's documents cannot be read, grading carries on with free-form keys instead of stopping", { skip }, async () => {
  seed(1);
  state.lastRequest = null;
  // no ELEVENLABS_API_KEY: liveRobin throws, and the grader must not
  const r = await run(undefined);
  assert.equal(r.body.graded, 1);
  assert.equal(state.lastRequest.output_config.format.schema.properties.answers.items.properties.canonical_key.enum, undefined, "no menu, no enum");
  assert.match(state.scores[0].question_key, /^loan-fees-/);
});
