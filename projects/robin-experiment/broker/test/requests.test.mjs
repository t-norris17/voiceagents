// After-hours requests: the rules for filing, linking, the safety net, the dot and the stat row, and
// the post-call webhook end to end against a faked database.
//
// The seams this guards are the ones that fail silently: a tool result the webhook cannot find (so the
// request never gets its callback number), a re-delivered webhook that files twice, a test agent's call
// landing in the live queue, and a request bug turning a stored call into a 500 that ElevenLabs retries.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test";

const R = await import("../lib/requests.js");
const { linkOrFile } = await import("../lib/request-link.js");
const { buildRow } = await import("../api/file_request.js");
const { answer } = await import("../api/handoff_option.js");
const { toolSecretCheck } = await import("../lib/tool-secret.js");

const ROBIN = R.AGENTS.robin, WEB = R.AGENTS.robin_web, TEST = "agent_test_survey";
const at = (s) => new Date(s);
const PROD = { VERCEL_ENV: "production" };

// The shape ElevenLabs actually stores (keys checked against live transcripts on 2026-10-05):
// result_value is a JSON STRING, not an object.
const toolTurn = (tool_name, value, extra = {}) => ({
  role: "agent", message: null,
  tool_results: [{ request_id: "t1", tool_name, result_value: JSON.stringify(value), is_error: false, type: "webhook", ...extra }],
});
const RID = "3f1c2a9e-5b7d-4c11-9a2e-0d4b6c8e1f20";

test("request types: free text from Data Collection lands in the vocabulary", () => {
  assert.equal(R.normalizeRequestType("loan"), "loan");
  assert.equal(R.normalizeRequestType("Loan request"), "loan");
  assert.equal(R.normalizeRequestType("wants to change contribution %"), "contribution_change");
  assert.equal(R.normalizeRequestType("contribution_change"), "contribution_change");
  assert.equal(R.normalizeRequestType("Update beneficiaries"), "beneficiary");
  assert.equal(R.normalizeRequestType("hardship withdrawal"), "distribution");
  assert.equal(R.normalizeRequestType("locked out of account"), "account_access");
  assert.equal(R.normalizeRequestType("wants a real person"), "speak_to_person");
  assert.equal(R.normalizeRequestType("question about fees"), "other");
  for (const none of [null, undefined, "", "None", "N/A", "no request"]) assert.equal(R.normalizeRequestType(none), null, String(none));
});

test("phone numbers: only something a rep can dial", () => {
  assert.equal(R.normalizePhone("(316) 555-0142"), "+13165550142");
  assert.equal(R.normalizePhone("+1 316 555 0142"), "+13165550142");
  assert.equal(R.normalizePhone("13165550142"), "+13165550142");
  assert.equal(R.normalizePhone("+447700900123"), "+447700900123");
  assert.equal(R.normalizePhone("555-0142"), null, "seven digits is not a callback number");
  assert.equal(R.normalizePhone(""), null);
  assert.equal(R.normalizePhone(undefined), null);
});

test("the webhook finds the request id in the tool result, string-encoded as stored", () => {
  const t = [{ role: "user", message: "hi" }, toolTurn("verify_caller", { verified: true }), toolTurn("file_request", { ok: true, request_id: RID })];
  assert.equal(R.filedRequestId(t), RID);
  assert.equal(R.filedRequestId([toolTurn("file_request", { ok: false, mode: "transfer" })]), null, "a refused filing is not a request");
  assert.equal(R.filedRequestId([toolTurn("file_request", { ok: true, request_id: RID }, { is_error: true })]), null, "an errored call is not a request");
  assert.equal(R.filedRequestId([toolTurn("file_request", { ok: true, request_id: "not-a-uuid" })]), null);
  assert.equal(R.filedRequestId([{ tool_results: [{ tool_name: "file_request", result_value: "{broken", is_error: false }] }]), null);
  assert.equal(R.filedRequestId(null), null);
});

test("the promise heard before a hang-up is recovered from get_handoff_option", () => {
  const t = [toolTurn("get_handoff_option", { mode: "request", callback_by_text: "by Monday, October 5 at 4 PM Central" })];
  assert.equal(R.handoffPromise(t), "by Monday, October 5 at 4 PM Central");
  assert.equal(R.handoffPromise([toolTurn("get_handoff_option", { mode: "transfer" })]), null);
});

test("safety net: files only for a phone call, after hours, that named a request", () => {
  const base = { agentId: ROBIN, requestType: "loan", externalNumber: "+13165550142", startedAt: "2026-10-03T21:42:00-05:00", linked: false, env: PROD };
  assert.deepEqual(R.safetyNetDecision(base), { file: true, type: "loan", isTest: false });
  assert.equal(R.safetyNetDecision({ ...base, linked: true }).file, false, "the tool already filed");
  assert.equal(R.safetyNetDecision({ ...base, startedAt: "2026-10-05T10:00:00-05:00" }).file, false, "open hours: Robin transferred");
  assert.equal(R.safetyNetDecision({ ...base, externalNumber: undefined }).file, false, "web call: nobody to call back");
  assert.equal(R.safetyNetDecision({ ...base, agentId: WEB }).file, false, "web agent never files");
  assert.equal(R.safetyNetDecision({ ...base, requestType: "none" }).file, false);
  assert.equal(R.safetyNetDecision({ ...base, agentId: TEST }).file, false, "an unlisted test agent files nothing");
  const t = R.safetyNetDecision({ ...base, agentId: TEST, startedAt: "2026-10-05T10:00:00-05:00", env: { ...PROD, REQUESTS_TEST_AGENT_IDS: TEST } });
  assert.deepEqual(t, { file: true, type: "loan", isTest: true }, "a listed test agent files in the daytime, flagged as test");
});

test("forced-closed is a preview-only switch", () => {
  assert.equal(R.forcedClosed({ REQUESTS_FORCE_CLOSED: "1", VERCEL_ENV: "preview" }), true);
  assert.equal(R.forcedClosed({ REQUESTS_FORCE_CLOSED: "1", VERCEL_ENV: "production" }), false, "production ignores it");
  const open = at("2026-10-05T10:00:00-05:00");
  assert.deepEqual(answer(open, { REQUESTS_FORCE_CLOSED: "1", VERCEL_ENV: "production" }), { mode: "transfer" });
  const forced = answer(open, { REQUESTS_FORCE_CLOSED: "1", VERCEL_ENV: "preview" });
  assert.equal(forced.mode, "request");
  assert.equal(forced.callback_by_text, "by Monday, October 5 at 6 PM Central", "eight open hours from 10 AM");
  assert.equal(answer(at("2026-10-03T21:42:00-05:00"), PROD).callback_by_text, "by Monday, October 5 at 4 PM Central");
});

test("tool secret: fails closed, compares exactly", () => {
  assert.equal(toolSecretCheck({}, {}).status, 503, "unset secret is a 503, never open");
  assert.equal(toolSecretCheck({}, { REQUESTS_TOOL_SECRET: "s3cret" }).status, 401);
  assert.equal(toolSecretCheck({ "x-robin-tool-secret": "s3cre" }, { REQUESTS_TOOL_SECRET: "s3cret" }).status, 401);
  assert.equal(toolSecretCheck({ "x-robin-tool-secret": "s3cret" }, { REQUESTS_TOOL_SECRET: "s3cret" }), null);
});

test("file_request row: the deadline is the server's, whatever the model sends", () => {
  const now = at("2026-10-03T21:42:00-05:00");
  const row = buildRow({ request_type: "Loan", request_detail: "  wants a  general purpose loan ", due_at: "2020-01-01", callback_number: "316-555-0142", callback_window: "mornings" },
    { now, verifiedRef: "a0000000-0000-4000-8000-000000000001", env: PROD });
  assert.equal(row.due_at, at("2026-10-05T16:00:00-05:00").toISOString());
  assert.equal(row.promised_text, "by Monday, October 5 at 4 PM Central");
  assert.equal(row.request_type, "loan");
  assert.equal(row.request_detail, "wants a general purpose loan");
  assert.equal(row.callback_number, "+13165550142");
  assert.equal(row.callback_number_source, "stated");
  assert.equal(row.verified, true);
  assert.equal(row.is_test, false);
  const bare = buildRow({ request_type: "nonsense" }, { now, env: { VERCEL_ENV: "preview" } });
  assert.equal(bare.callback_number, null, "no stated number: the webhook fills caller ID");
  assert.equal(bare.callback_number_source, null);
  assert.equal(bare.verified, false);
  assert.equal(bare.is_test, true, "a preview broker only ever files test rows");
});

test("the dot: red, amber, green, late", () => {
  const req = { due_at: "2026-10-05T16:00:00-05:00", status: "open" };
  assert.equal(R.slaState(req, [], at("2026-10-05T16:01:00-05:00")), "red");
  assert.equal(R.slaState(req, [], at("2026-10-05T09:00:00-05:00")), "amber");
  assert.equal(R.slaState(req, [], at("2026-10-04T23:00:00-05:00")), "none", "Sunday night: due tomorrow");
  assert.equal(R.slaState(req, [{ kind: "note", at: "2026-10-05T09:00:00-05:00" }], at("2026-10-05T17:00:00-05:00")), "red", "a note is not an attempt");
  assert.equal(R.slaState(req, [{ kind: "no_answer", at: "2026-10-05T09:00:00-05:00" }], at("2026-10-05T17:00:00-05:00")), "green", "the clock stops at the first attempt");
  assert.equal(R.slaState(req, [{ kind: "reached", at: "2026-10-05T16:30:00-05:00" }], at("2026-10-05T17:00:00-05:00")), "late");
});

test("the stat row", () => {
  const now = at("2026-10-05T14:10:00-05:00");
  const reqs = [
    { id: "a", status: "open", filed_at: "2026-10-03T21:42:00-05:00", due_at: "2026-10-05T16:00:00-05:00" },
    { id: "b", status: "open", filed_at: "2026-10-01T21:14:00-05:00", due_at: "2026-10-02T16:00:00-05:00" },
    { id: "c", status: "closed", closed_at: "2026-10-02T10:00:00-05:00", filed_at: "2026-10-01T19:00:00-05:00", due_at: "2026-10-02T16:00:00-05:00" },
    { id: "d", status: "closed", closed_at: "2026-09-30T10:00:00-05:00", filed_at: "2026-09-29T19:00:00-05:00", due_at: "2026-09-30T16:00:00-05:00" },
  ];
  const ev = {
    c: [{ kind: "reached", at: "2026-10-02T09:00:00-05:00" }],
    d: [{ kind: "voicemail", at: "2026-09-30T09:00:00-05:00" }],
  };
  assert.deepEqual(R.queueStats(reqs, ev, now), { open: 2, overdue: 1, due_today: 1, done_this_month: 1, median_open_minutes_to_first_attempt: 60 });
});

// ---- linkOrFile against a fake database ----------------------------------------------------------

// A tiny in-memory PostgREST: just enough of the calls linkOrFile makes, with the unique key on
// conversation_id enforced the way Postgres would.
function fakeDb(rows = []) {
  const events = [];
  const calls = [];
  const db = async (path, { method = "GET", body } = {}) => {
    calls.push({ path, method, body });
    if (path.startsWith("service_request_events")) { events.push(body); return null; }
    const id = (path.match(/id=eq\.([0-9a-f-]+)/) || [])[1];
    if (method === "PATCH") {
      const r = rows.find((x) => x.id === id && (!path.includes("conversation_id=is.null") || x.conversation_id == null));
      if (!r) return [];
      Object.assign(r, body);
      return [r];
    }
    if (method === "POST" && path.startsWith("service_requests")) {
      if (rows.some((x) => x.conversation_id === body.conversation_id)) return [];
      const r = { id: crypto.randomUUID(), ...body };
      rows.push(r);
      return [r];
    }
    throw new Error(`fake db: unexpected ${method} ${path}`);
  };
  return { db, rows, events, calls };
}
const pickFrom = (dc) => (k) => dc[k] ?? null;

test("link: the tool's row gets its call, caller ID and name, once", async () => {
  const f = fakeDb([{ id: RID, conversation_id: null, callback_number: null, caller_name: null }]);
  const args = { conversationId: "conv_1", agentId: ROBIN, startedAt: "2026-10-04T02:42:00Z",
    transcript: [toolTurn("file_request", { ok: true, request_id: RID })], externalNumber: "+13165550142",
    pick: pickFrom({ caller_name: "Dana", request_type: "loan" }), db: f.db, env: PROD };
  assert.deepEqual(await linkOrFile(args), { action: "linked", request_id: RID });
  assert.equal(f.rows[0].conversation_id, "conv_1");
  assert.equal(f.rows[0].callback_number, "+13165550142");
  assert.equal(f.rows[0].callback_number_source, "caller_id");
  assert.equal(f.rows[0].caller_name, "Dana");
  assert.equal(f.rows.length, 1, "the safety net did not also file");
  // Re-delivery of the same webhook changes nothing and files nothing.
  assert.equal((await linkOrFile(args)).action, "none");
  assert.equal(f.rows.length, 1);
  assert.equal(f.events.filter((e) => e.kind === "linked").length, 1);
});

test("link: a number the caller stated is not replaced by caller ID", async () => {
  const f = fakeDb([{ id: RID, conversation_id: null, callback_number: "+19135550199", callback_number_source: "stated", caller_name: null }]);
  await linkOrFile({ conversationId: "conv_2", agentId: ROBIN, startedAt: "2026-10-04T02:42:00Z",
    transcript: [toolTurn("file_request", { ok: true, request_id: RID })], externalNumber: "+13165550142",
    pick: pickFrom({}), db: f.db, env: PROD });
  assert.equal(f.rows[0].callback_number, "+19135550199");
  assert.equal(f.rows[0].callback_number_source, "stated");
});

test("safety net: a hang-up files one request, due from the call's start, never verified", async () => {
  const f = fakeDb();
  const args = { conversationId: "conv_3", agentId: ROBIN, startedAt: "2026-10-04T02:42:00Z", // Sat 9:42 PM Central
    transcript: [toolTurn("verify_caller", { verified: true }), toolTurn("get_handoff_option", { mode: "request", callback_by_text: "by Monday, October 5 at 4 PM Central" })],
    externalNumber: "+13165550142", pick: pickFrom({ request_type: "loan", request_detail: "general purpose loan", subject_ref: "a0000000-0000-4000-8000-000000000001", caller_name: "Dana" }),
    db: f.db, env: PROD, now: at("2026-10-04T02:50:00Z") };
  const out = await linkOrFile(args);
  assert.equal(out.action, "filed");
  const r = f.rows[0];
  assert.equal(r.source, "postcall");
  assert.equal(r.due_at, at("2026-10-05T16:00:00-05:00").toISOString());
  assert.equal(r.promised_text, "by Monday, October 5 at 4 PM Central");
  assert.equal(r.verified, false, "Data Collection's reading is not a verification");
  assert.equal(r.subject_ref, "a0000000-0000-4000-8000-000000000001");
  assert.equal(r.callback_number, "+13165550142");
  assert.equal(r.is_test, false);
  assert.equal((await linkOrFile(args)).action, "none", "re-delivery hits the unique key");
  assert.equal(f.rows.length, 1);
});

test("safety net: nothing for an in-hours call or a web call", async () => {
  const f = fakeDb();
  const base = { conversationId: "conv_4", agentId: ROBIN, transcript: [], pick: pickFrom({ request_type: "loan" }), db: f.db, env: PROD };
  assert.equal((await linkOrFile({ ...base, startedAt: "2026-10-05T15:00:00Z", externalNumber: "+13165550142" })).action, "none");
  assert.equal((await linkOrFile({ ...base, agentId: WEB, startedAt: "2026-10-04T02:42:00Z" })).action, "none");
  assert.equal(f.calls.length, 0, "no database call at all");
});

// ---- the post-call handler, end to end ------------------------------------------------------------

function signedReq(payload, secret) {
  const raw = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const v0 = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const req = (async function* () { yield Buffer.from(raw); })();
  req.method = "POST";
  req.headers = { "elevenlabs-signature": `t=${t},v0=${v0}` };
  return req;
}
function resCapture() {
  const out = { status: null, body: null };
  return { out, status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; }, setHeader() {} };
}
function payload(agent_id, extra = {}) {
  return { type: "post_call_transcription", data: { agent_id, conversation_id: "conv_pc", transcript: [],
    metadata: { start_time_unix_secs: 1759545720, call_duration_secs: 60, phone_call: { external_number: "+13165550142" } },
    analysis: { data_collection_results: { request_type: { value: "loan" } } }, ...extra } };
}

test("postcall: an unlisted agent is answered 200 and stores nothing", async () => {
  process.env.ELEVENLABS_WEBHOOK_SECRET = "whsec";
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response("", { status: 201 }); };
  try {
    const { default: handler } = await import("../api/postcall.js");
    const res = resCapture();
    await handler(signedReq(payload("agent_somebody_else"), "whsec"), res);
    assert.equal(res.out.status, 200);
    assert.equal(res.out.body.ignored, "agent not in allowlist");
    assert.equal(seen.length, 0);
  } finally { globalThis.fetch = realFetch; }
});

test("postcall: a request failure never fails the stored call", async () => {
  process.env.ELEVENLABS_WEBHOOK_SECRET = "whsec";
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push(String(url));
    if (String(url).includes("ai_call_events")) return new Response("", { status: 201 });
    return new Response("boom", { status: 500 }); // every request-table write fails
  };
  try {
    const { default: handler } = await import("../api/postcall.js");
    const res = resCapture();
    // 1759545720 = Sat 2025-10-04 02:42 UTC = Fri 9:42 PM Central, after hours.
    await handler(signedReq(payload(ROBIN), "whsec"), res);
    assert.equal(res.out.status, 200, "the call record was stored; the request bug is logged, not returned");
    assert.equal(res.out.body.request, "error");
    assert.ok(seen[0].includes("ai_call_events"), "the call record is written first");
  } finally { globalThis.fetch = realFetch; }
});
