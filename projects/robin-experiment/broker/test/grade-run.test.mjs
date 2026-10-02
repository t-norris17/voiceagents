// The rules that keep a re-grade from losing data. No database and no model: lib/grade-write.js takes
// its Supabase client as an argument, so these tests record every call it would make, in order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGradeRequest, replacedKeys, mergeSecurity, inList, MAX_PER_RUN } from "../lib/grade-run.js";
import { writeGrade } from "../lib/grade-write.js";

test("a plain request grades the newest ungraded, and ids are validated", () => {
  assert.deepEqual(parseGradeRequest(undefined), { ids: null, regrade: false });
  assert.deepEqual(parseGradeRequest({}), { ids: null, regrade: false });
  assert.deepEqual(parseGradeRequest({ conversation_ids: ["conv_abc1", "conv_abc1", "conv_def2"] }), { ids: ["conv_abc1", "conv_def2"], regrade: false });
  assert.match(parseGradeRequest({ conversation_ids: "conv_abc1" }).error, /list/);
  assert.match(parseGradeRequest({ conversation_ids: [] }).error, /empty/);
  assert.match(parseGradeRequest({ conversation_ids: ["conv_abc1", "x); drop table y;--"] }).error, /not a conversation id/);
  assert.match(parseGradeRequest({ conversation_ids: Array.from({ length: MAX_PER_RUN + 1 }, (_, i) => `conv_${1000 + i}`) }).error, /at most/);
});

test("a re-grade takes exactly one conversation id", () => {
  assert.deepEqual(parseGradeRequest({ conversation_ids: ["conv_abc1"], regrade: true }), { ids: ["conv_abc1"], regrade: true });
  assert.match(parseGradeRequest({ regrade: true }).error, /exactly one/);
  assert.match(parseGradeRequest({ conversation_ids: ["conv_abc1", "conv_def2"], regrade: true }).error, /exactly one/);
  // only the literal true counts, so a stringy "false" can never trigger a delete
  assert.equal(parseGradeRequest({ conversation_ids: ["conv_abc1"], regrade: "true" }).regrade, false);
});

test("only old rows the new grade did not write again may be removed", () => {
  assert.deepEqual(replacedKeys(["a", "b", "c"], ["b", "d"]), ["a", "c"]);
  assert.deepEqual(replacedKeys(["a", "a"], ["a"]), []);
  assert.deepEqual(replacedKeys([], ["a"]), []);
});

test("a security flag already raised is never cleared by a re-grade", () => {
  assert.deepEqual(mergeSecurity({ security_flag: true, security_detail: "gave balance unverified" }, { security_flag: false, security_detail: null }),
    { security_flag: true, security_detail: "gave balance unverified" });
  assert.deepEqual(mergeSecurity({ security_flag: false, security_detail: null }, { security_flag: true, security_detail: "new" }),
    { security_flag: true, security_detail: "new" });
  assert.deepEqual(mergeSecurity({ security_flag: false }, { security_flag: false }), { security_flag: false, security_detail: null });
});

test("inList quotes ids and cannot be broken out of", () => {
  assert.equal(inList(["a", "b-1"]), '("a","b-1")');
  assert.equal(inList(['a"),x=("b']), '("a),x=(b")'); // quotes are stripped, not escaped
});

// ---- writeGrade against a recording stub ------------------------------------------------------------
function stub({ oldScores = [], oldQs = [], failOn = null } = {}) {
  const calls = [];
  const sb = async (path, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ method, path: decodeURIComponent(path), body: opts.body });
    if (failOn && failOn(method, path)) throw new Error("boom");
    if (method === "GET" && path.startsWith("call_question_scores")) return oldScores;
    if (method === "GET" && path.startsWith("call_questions")) return oldQs;
    return null;
  };
  const upsertScores = async (rows) => { calls.push({ method: "UPSERT", path: "call_question_scores", body: rows }); };
  return { sb, upsertScores, calls };
}
const call = { conversation_id: "conv_abc1", security_flag: true, security_detail: "was flagged" };
const graded = (over = {}) => ({
  conversation_id: "conv_abc1",
  rows: [{ question_key: "loan-fees", grounding: "grounded", quality_score: 9 }],
  askedRows: [{ canonical_key: "loan-fees" }],
  security_flag: false, security_detail: null, ...over,
});
const order = (calls) => calls.map((c) => `${c.method} ${c.path.split("?")[0]}`);

test("a normal grade writes and stamps; it never reads old rows or deletes", async () => {
  const s = stub();
  const out = await writeGrade({ conversation_id: "conv_abc1" }, graded(), false, s);
  assert.equal(out.status, "graded"); assert.equal(out.sourced, true);
  assert.ok(!s.calls.some((c) => c.method === "DELETE" || c.method === "GET"));
  assert.equal(s.calls.at(-1).method, "PATCH");
});

test("a re-grade writes the new rows BEFORE it deletes, and deletes only the replaced keys", async () => {
  const s = stub({ oldScores: [{ question_key: "loan-fees", grounding: "no_source" }, { question_key: "old-topic", grounding: "no_source" }], oldQs: [{ canonical_key: "loan-fees" }, { canonical_key: "old-q" }] });
  const out = await writeGrade(call, graded(), true, s);
  const o = order(s.calls);
  assert.ok(o.indexOf("UPSERT call_question_scores") < o.indexOf("DELETE call_question_scores"), "write first");
  const dels = s.calls.filter((c) => c.method === "DELETE");
  assert.equal(dels.length, 2);
  assert.match(dels[0].path, /question_key=in\.\("old-topic"\)/);
  assert.ok(!/loan-fees/.test(dels[0].path), "a key the new grade wrote again is not deleted");
  assert.match(dels[1].path, /canonical_key=in\.\("old-q"\)/);
  assert.deepEqual(out.replaced.removed_score_keys, ["old-topic"]);
  assert.equal(out.replaced.before.length, 2); assert.equal(out.replaced.after.length, 1);
});

test("a re-grade keeps a raised security flag in the stamp", async () => {
  const s = stub({ oldScores: [{ question_key: "x" }] });
  await writeGrade(call, graded(), true, s);
  const patch = s.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.body.security_flag, true);
  assert.equal(patch.body.security_detail, "was flagged");
});

test("a re-grade whose new grade is empty deletes nothing and writes nothing", async () => {
  const s = stub({ oldScores: [{ question_key: "keep-me" }] });
  await assert.rejects(() => writeGrade(call, graded({ rows: [], askedRows: [] }), true, s), /old grade was left as it was/);
  assert.equal(s.calls.length, 0, "not even a read: the guard fires before the database is touched");
});

test("if the new write fails, nothing is deleted", async () => {
  const s = stub({ oldScores: [{ question_key: "old-topic" }], failOn: (m, p) => m === "POST" });
  await assert.rejects(() => writeGrade(call, graded(), true, s), /boom/);
  assert.ok(!s.calls.some((c) => c.method === "DELETE"), "no delete after a failed write");
  assert.ok(!s.calls.some((c) => c.method === "PATCH"), "and the call is not re-stamped");
});

test("the demand record is replaced only when the new run produced one", async () => {
  const s = stub({ oldScores: [{ question_key: "a" }], oldQs: [{ canonical_key: "keep-demand" }] });
  const out = await writeGrade(call, graded({ askedRows: [] }), true, s);
  assert.deepEqual(out.replaced.removed_question_keys, []);
  assert.ok(!s.calls.some((c) => c.method === "DELETE" && /call_questions/.test(c.path)));
});

import { parseGradeOutput } from "../lib/grade-run.js";
test("a reply cut off at the token limit is reported as that, not as a JSON error", () => {
  const cut = { stop_reason: "max_tokens", content: [{ type: "text", text: '{"answers":[{"canonical_key":"a","question_text":"unterminated' }] };
  assert.throws(() => parseGradeOutput(cut), /cut off at the model's output limit, so nothing was written/);
});
test("a good reply parses; a reply with no text or bad JSON fails with a plain message", () => {
  const ok = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "…" }, { type: "text", text: '{"answers":[],"all_questions":[]}' }] };
  assert.deepEqual(parseGradeOutput(ok), { answers: [], all_questions: [] });
  assert.throws(() => parseGradeOutput({ stop_reason: "end_turn", content: [] }), /no text block/);
  assert.throws(() => parseGradeOutput({ stop_reason: "end_turn", content: [{ type: "text", text: "{nope" }] }), /not valid JSON.*nothing was written/);
});
