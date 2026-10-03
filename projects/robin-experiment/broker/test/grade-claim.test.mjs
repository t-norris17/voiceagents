// The claim: two runs can never hold, or pay for, the same interaction. The stub below behaves like the
// database where it matters: an UPDATE changes each row once, so of two callers racing for the same row
// exactly one gets it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimUngraded, claimRegrade, releaseClaim } from "../lib/grade-claim.js";

function fakeDb(rows) {
  const table = new Map(rows.map((r) => [r.conversation_id, { ...r }]));
  const log = [];
  // Understands exactly the three filters the claim uses, and applies a PATCH to each matching row at once.
  const sb = async (path, opts = {}) => {
    const url = new URL("http://x/" + path);
    const f = (k) => url.searchParams.get(k);
    log.push({ method: opts.method, path: decodeURIComponent(path), body: opts.body });
    const inList = f("conversation_id")?.startsWith("in.") ? [...f("conversation_id").matchAll(/"([^"]+)"/g)].map((m) => m[1]) : null;
    const eqId = f("conversation_id")?.startsWith("eq.") ? f("conversation_id").slice(3) : null;
    const sc = f("scored_at");
    const hit = [...table.values()].filter((r) =>
      (inList ? inList.includes(r.conversation_id) : eqId ? r.conversation_id === eqId : true) &&
      (sc === "is.null" ? r.scored_at == null : sc?.startsWith("eq.") ? r.scored_at === sc.slice(3) : true));
    await Promise.resolve(); // yield, so concurrent callers interleave
    const changed = [];
    for (const r of hit) {
      // re-check at write time: the row may have been changed by the other caller while this one yielded
      const stillMatches = sc === "is.null" ? table.get(r.conversation_id).scored_at == null : sc?.startsWith("eq.") ? table.get(r.conversation_id).scored_at === sc.slice(3) : true;
      if (!stillMatches) continue;
      table.get(r.conversation_id).scored_at = opts.body.scored_at;
      changed.push({ conversation_id: r.conversation_id });
    }
    return opts.prefer === "return=representation" ? changed : null;
  };
  return { sb, table, log };
}

test("a claim returns only the interactions that were still ungraded, and stamps them", async () => {
  const db = fakeDb([{ conversation_id: "a", scored_at: null }, { conversation_id: "b", scored_at: "2026-09-15T00:00:00.000Z" }, { conversation_id: "c", scored_at: null }]);
  const got = await claimUngraded(["a", "b", "c"], "S1", db);
  assert.deepEqual([...got].sort(), ["a", "c"], "b was already graded and is not claimed");
  assert.equal(db.table.get("a").scored_at, "S1");
  assert.equal(db.table.get("b").scored_at, "2026-09-15T00:00:00.000Z", "a graded interaction is untouched");
});

test("two runs racing for the same interactions get disjoint sets: nothing is held twice", async () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const db = fakeDb(ids.map((id) => ({ conversation_id: id, scored_at: null })));
  const [one, two] = await Promise.all([claimUngraded(ids, "RUN-1", db), claimUngraded(ids, "RUN-2", db)]);
  const both = [...one].filter((id) => two.has(id));
  assert.deepEqual(both, [], "no interaction is held by both runs");
  assert.equal(one.size + two.size, ids.length, "and every one of them is held by exactly one");
});

test("with nothing to claim, nothing is sent", async () => {
  const db = fakeDb([]);
  assert.equal((await claimUngraded([], "S", db)).size, 0);
  assert.equal(db.log.length, 0);
});

test("two re-grades of the same interaction cannot both proceed", async () => {
  const db = fakeDb([{ conversation_id: "a", scored_at: "T0" }]);
  const [x, y] = await Promise.all([claimRegrade("a", "T0", "S1", db), claimRegrade("a", "T0", "S2", db)]);
  assert.deepEqual([x, y].sort(), [false, true]);
  assert.equal(await claimRegrade("a", "T0", "S3", db), false, "the value they read is gone, so a late third is refused too");
});

test("a re-grade claim needs the value the caller read, and refuses without it", async () => {
  const db = fakeDb([{ conversation_id: "a", scored_at: "T0" }]);
  assert.equal(await claimRegrade("a", null, "S", db), false);
  assert.equal(await claimRegrade("", "T0", "S", db), false);
  assert.equal(db.table.get("a").scored_at, "T0");
});

test("releasing a claim restores the old value, but only while the row still carries our stamp", async () => {
  const db = fakeDb([{ conversation_id: "a", scored_at: null }]);
  await claimUngraded(["a"], "MINE", db);
  await releaseClaim("a", "MINE", null, db);
  assert.equal(db.table.get("a").scored_at, null, "released");

  await claimUngraded(["a"], "MINE", db);
  db.table.get("a").scored_at = "SOMEONE-ELSES-GRADE"; // another run finished and stamped it
  await releaseClaim("a", "MINE", null, db);
  assert.equal(db.table.get("a").scored_at, "SOMEONE-ELSES-GRADE", "a release never undoes someone else's work");
});
