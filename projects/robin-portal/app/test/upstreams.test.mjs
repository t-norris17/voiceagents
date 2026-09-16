// The route map is the portal's whole security posture for proxied paths: a segment not listed
// never leaves the portal, and Robin's own endpoints are never listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { upstreamFor, BROKER_PATHS, CLEANER_PATHS } from "../lib/upstreams.js";

const env = { BROKER_URL: "https://broker.example/", CLEANER_URL: "https://cleaner.example" };

test("listed paths resolve to the right upstream, trailing slash normalised", () => {
  assert.deepEqual(upstreamFor("metrics", env), { base: "https://broker.example", name: "broker" });
  assert.deepEqual(upstreamFor("clean", env), { base: "https://cleaner.example", name: "cleaner" });
});

test("Robin's own endpoints are never proxied", () => {
  for (const seg of ["verify_caller", "get_balance", "postcall"]) {
    assert.equal(BROKER_PATHS.has(seg), false);
    assert.equal(CLEANER_PATHS.has(seg), false);
    assert.equal(upstreamFor(seg, env), null);
  }
});

test("unlisted, empty and odd segments are 404s, and a missing upstream URL is too", () => {
  for (const seg of ["", undefined, "..", "metrics/../postcall", "admin"]) assert.equal(upstreamFor(seg, env), null);
  assert.equal(upstreamFor("metrics", {}), null);
});

test("the two upstreams have no overlapping paths", () => {
  for (const seg of BROKER_PATHS) assert.equal(CLEANER_PATHS.has(seg), false, seg);
});
