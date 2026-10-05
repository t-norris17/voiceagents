// The health check's reading of the cleaner (lib/cleaner-health.js).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanerVerdict } from "../lib/cleaner-health.js";

test("gated and accepting: the state we want after the cleaner gate deploys", () => {
  assert.deepEqual(cleanerVerdict(400, 401), { secret_accepted: true, gated: true, status_with_secret: 400, status_without_secret: 401 });
});

test("open to everyone: today's production cleaner", () => {
  const v = cleanerVerdict(400, 400);
  assert.equal(v.secret_accepted, true);
  assert.equal(v.gated, false);
});

test("gated but refusing the portal: the secrets do not match", () => {
  const v = cleanerVerdict(401, 401);
  assert.equal(v.secret_accepted, false);
  assert.equal(v.gated, true);
});

test("secret unset on the cleaner: it fails closed with 503 to everyone", () => {
  const v = cleanerVerdict(503, 503);
  assert.equal(v.secret_accepted, false);
  assert.equal(v.gated, false);
});
