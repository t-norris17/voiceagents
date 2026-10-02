// /api/calls filter, paging and totals: the real handler against a stubbed database.
//
// The defect this pins down: the Accuracy page listed the newest 100 interactions while the grader
// graded the OLDEST ungraded ones, so grading changed nothing the page could show. Here the table is
// 150 newest-first calls where only the 30 OLDEST are graded, exactly the shape of the live data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceStatusByCall, selectIds, totals, parseFilter, parseOffset } from "../lib/calls.js";

process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const { default: handler } = await import("../api/calls.js");

const N = 150;
// c000 is the newest. The 30 oldest (c120..c149) are graded; c140..c149 had no source, c120..c139 did.
const ROWS = Array.from({ length: N }, (_, i) => {
  const id = `c${String(i).padStart(3, "0")}`;
  return { conversation_id: id, started_at: new Date(Date.UTC(2026, 9, 2) - i * 3600e3).toISOString(),
    scored_at: i >= 120 ? "2026-10-02T15:41:00Z" : null, topic: "401(k) loan", outcome: "resolved" };
});
const SCORES = ROWS.filter((r) => r.scored_at).map((r) => ({ conversation_id: r.conversation_id, grounding: Number(r.conversation_id.slice(1)) >= 140 ? "no_source" : "grounded" }));

function stub() {
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    const reply = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (u.includes("call_question_scores")) return reply(SCORES);
    const m = u.match(/conversation_id=in\.\((.*?)\)&select/);
    if (m) {
      const ids = m[1].split(",").map((s) => s.replace(/"/g, ""));
      return reply(ROWS.filter((r) => ids.includes(r.conversation_id)));
    }
    return reply(ROWS.map(({ conversation_id, started_at, scored_at }) => ({ conversation_id, started_at, scored_at })));
  };
}
function run(query) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method: "GET", query }, res);
  });
}

test("totals count the whole table, not the rows on the page", async () => {
  stub();
  const r = await run({ limit: "100" });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.totals, { total: 150, graded: 30, ungraded: 120, graded_without_source: 10 });
  assert.equal(r.body.calls.length, 100);
  assert.equal(r.body.matching, 150);
});

test("the default view is unchanged: the newest rows, newest first", async () => {
  stub();
  const r = await run({ limit: "5" });
  assert.deepEqual(r.body.calls.map((c) => c.conversation_id), ["c000", "c001", "c002", "c003", "c004"]);
  assert.ok(r.body.calls.every((c) => c.source_status === "ungraded"));
});

test("the graded filter reaches the graded interactions that the newest 100 hide", async () => {
  stub();
  const r = await run({ filter: "graded", limit: "100" });
  assert.equal(r.body.matching, 30);
  assert.equal(r.body.calls.length, 30);
  assert.ok(r.body.calls.every((c) => Number(c.conversation_id.slice(1)) >= 120));
  const all = await run({ limit: "100" });
  assert.ok(!all.body.calls.some((c) => c.scored_at), "without the filter, none of them are in the first 100: the old symptom");
});

test("no_source returns exactly the graded calls nothing could be checked on, with their status", async () => {
  stub();
  const r = await run({ filter: "no_source", limit: "100" });
  assert.deepEqual(r.body.calls.map((c) => c.conversation_id).sort(), Array.from({ length: 10 }, (_, i) => `c${140 + i}`));
  assert.ok(r.body.calls.every((c) => c.source_status === "no_source"));
  const g = await run({ filter: "graded", limit: "100" });
  assert.equal(g.body.calls.find((c) => c.conversation_id === "c125").source_status, "sourced");
});

test("paging walks the table with no gaps and no repeats", async () => {
  stub();
  const seen = [];
  for (let offset = 0; offset < 150; offset += 40) {
    const r = await run({ filter: "ungraded", limit: "40", offset: String(offset) });
    seen.push(...r.body.calls.map((c) => c.conversation_id));
  }
  assert.equal(seen.length, 120);
  assert.equal(new Set(seen).size, 120);
  assert.equal(seen[0], "c000"); assert.equal(seen.at(-1), "c119");
});

test("unknown filters and junk offsets fall back instead of failing", () => {
  assert.equal(parseFilter("everything"), "all");
  assert.equal(parseFilter(undefined), "all");
  assert.equal(parseOffset("-5"), 0);
  assert.equal(parseOffset("abc"), 0);
  assert.equal(parseOffset("999999"), 5000);
});

test("a graded call with no score rows is no_answers, not no_source", () => {
  const map = sourceStatusByCall([{ conversation_id: "a", grounding: "no_source" }, { conversation_id: "b", grounding: "grounded" }, { conversation_id: "b", grounding: "no_source" }]);
  assert.equal(map.get("a"), "no_source");
  assert.equal(map.get("b"), "sourced", "one checked answer is enough");
  assert.equal(map.get("c"), undefined);
  const rows = [{ conversation_id: "a", scored_at: "x" }, { conversation_id: "c", scored_at: "x" }];
  assert.deepEqual(selectIds(rows, "no_source", map), ["a"]);
  assert.equal(totals(rows, map).graded_without_source, 1);
});

const { sbAll } = await import("../lib/supabase.js"); // after the env is set above: the client reads it at load
test("sbAll walks past PostgREST's 1000-row cap, with no gaps and no repeats", async () => {
  const table = Array.from({ length: 2350 }, (_, i) => ({ i }));
  const asked = [];
  const fetcher = async (path) => {
    asked.push(path);
    const limit = Number(/limit=(\d+)/.exec(path)[1]), offset = Number(/offset=(\d+)/.exec(path)[1]);
    return table.slice(offset, offset + Math.min(limit, 1000)); // the server never returns more than 1000
  };
  const rows = await sbAll("t?select=i&order=i.asc", { fetcher });
  assert.equal(rows.length, 2350); assert.equal(new Set(rows.map((r) => r.i)).size, 2350);
  assert.equal(asked.length, 3);
  assert.match(asked[0], /^t\?select=i&order=i\.asc&limit=1000&offset=0$/);
  assert.equal((await sbAll("t", { fetcher })).length, 2350, "a path without a query string works too");
  assert.deepEqual(await sbAll("t", { fetcher: async () => [] }), []);
});
