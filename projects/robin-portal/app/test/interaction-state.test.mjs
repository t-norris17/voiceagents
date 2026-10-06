import { test } from "node:test";
import assert from "node:assert/strict";
import { dotOf, needsLook, FILTERS, topicOf } from "../lib/interaction-state.js";

test("a security flag or a failed verification is the loudest dot", () => {
  assert.equal(dotOf({ security_flag: true, auth_outcome: "verified" }), "bad");
  assert.equal(dotOf({ auth_outcome: "failed" }), "bad");
});
test("a hand-off to a person is a warning, a verified call is fine, the rest is unknown", () => {
  assert.equal(dotOf({ outcome: "transferred", auth_outcome: "verified" }), "warn");
  assert.equal(dotOf({ outcome: "resolved", auth_outcome: "verified" }), "ok");
  assert.equal(dotOf({ auth_outcome: "not_attempted" }), "none");
  assert.equal(dotOf({}), "none");
});
test("needs a look means bad or warn", () => {
  assert.equal(needsLook({ auth_outcome: "failed" }), true);
  assert.equal(needsLook({ outcome: "transferred" }), true);
  assert.equal(needsLook({ auth_outcome: "verified" }), false);
});
test("channel filters match only their channel; an unknown channel is in All only", () => {
  const f = Object.fromEntries(FILTERS.map((x) => [x.key, x.test]));
  assert.equal(f.chat({ channel: "chat" }), true);
  assert.equal(f.chat({ channel: "phone" }), false);
  assert.equal(f.phone({ channel: null }), false);
  assert.equal(f.all({ channel: null }), true);
  assert.equal(f.ungraded({ scored_at: null }), true);
  assert.equal(f.ungraded({ scored_at: "2026-10-01" }), false);
});
test("topics are one line", () => {
  assert.equal(topicOf({ topic: null }), "Interaction");
  assert.equal(topicOf({ topic: "401(k) loan" }), "401(k) loan");
  const long = "x".repeat(200);
  assert.ok(topicOf({ topic: long }).length <= 72 && topicOf({ topic: long }).endsWith("…"));
});

test("an after-hours callback is worth a look, like a transfer", () => {
  assert.equal(dotOf({ outcome: "callback", auth_outcome: "verified" }), "warn");
  assert.equal(needsLook({ outcome: "callback", auth_outcome: "not_attempted" }), true);
});
