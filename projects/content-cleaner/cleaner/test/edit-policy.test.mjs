// Tests for the save-path fact check: when it runs, and what stops a save.
// This is the gate between "a reviewer edited an article" and "a member hears it", so the
// skip conditions matter as much as the block conditions — a wrong skip is a silent failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blockingClaims, shouldFactCheck, BLOCKING_VERDICTS } from "../lib/edit-policy.js";

const edit = (o = {}) => ({ verified: false, force: false, baseline: "old text", body_md: "new text", ...o });

test("a changed article with a previous version gets checked", () => {
  assert.equal(shouldFactCheck(edit()), true);
});

test("an unchanged article isn't checked — there is nothing new to verify", () => {
  assert.equal(shouldFactCheck(edit({ body_md: "old text" })), false);
});

test("a brand-new article isn't checked here — no previous version to check against", () => {
  assert.equal(shouldFactCheck(edit({ baseline: null })), false);
  assert.equal(shouldFactCheck(edit({ baseline: "" })), false);
});

test("text straight out of a cleaning run isn't re-checked", () => {
  // It was already checked against the plan document, which is a stronger baseline than the
  // previous version. Re-checking would flag every legitimate fact an updated source added.
  assert.equal(shouldFactCheck(edit({ verified: true })), false);
});

test("force skips the check — the reviewer has already seen it and decided", () => {
  assert.equal(shouldFactCheck(edit({ force: true })), false);
});

test("an unsupported claim blocks, not just a contradiction", () => {
  // The motivating case: someone types a figure the article never carried. Nothing contradicts it
  // because the previous version is silent. If only contradictions blocked, this would sail through.
  const claims = [
    { claim: "Loans are allowed.", verdict: "supported" },
    { claim: "There's a $75 fee.", verdict: "unsupported" },
  ];
  assert.deepEqual(blockingClaims(claims).map((c) => c.claim), ["There's a $75 fee."]);
});

test("a contradiction blocks", () => {
  assert.equal(blockingClaims([{ claim: "x", verdict: "contradicted" }]).length, 1);
});

test("a clean edit blocks nothing", () => {
  assert.deepEqual(blockingClaims([{ claim: "x", verdict: "supported" }]), []);
});

test("a malformed critic result can't crash the save path or silently pass", () => {
  for (const junk of [null, undefined, "nope", 7, {}]) assert.deepEqual(blockingClaims(junk), []);
  assert.deepEqual(blockingClaims([null, { verdict: "unsupported" }]).length, 1);
});

test("only those two verdicts block", () => {
  assert.deepEqual([...BLOCKING_VERDICTS].sort(), ["contradicted", "unsupported"]);
});
