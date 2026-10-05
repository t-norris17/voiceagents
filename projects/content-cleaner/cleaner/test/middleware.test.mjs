// The cleaner's door (middleware.js): the portal's x-robin-internal secret, or nothing.
//
// The gate cannot be observed on a preview deployment (Vercel's own SSO answers first), so its rules
// are tested here and checked from outside on production after deploy (kb_list must answer 401).
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import middleware from "../middleware.js";

const SECRET = "s3cret-value-for-tests";
const req = (path, headers = {}) => new Request(`https://cleaner.test${path}`, { headers });

// Every kind of path the cleaner serves: the write endpoints that touch Robin's live knowledge base,
// the paid one, the reads, and the static console.
const PATHS = ["/api/publish", "/api/unpublish", "/api/clean", "/api/kb_list", "/api/kb_article?id=x", "/", "/index.html", "/vendor/x.js"];

test("fails closed with a 503 that names the fix when the secret is unset", () => {
  delete process.env.ROBIN_INTERNAL_SECRET;
  for (const p of PATHS) {
    const res = middleware(req(p, { "x-robin-internal": "anything" }));
    assert.equal(res?.status, 503, p);
  }
});

test("refuses every path without the header, or with a wrong one", () => {
  process.env.ROBIN_INTERNAL_SECRET = SECRET;
  for (const p of PATHS) {
    assert.equal(middleware(req(p))?.status, 401, `${p} no header`);
    assert.equal(middleware(req(p, { "x-robin-internal": "wrong" }))?.status, 401, `${p} wrong`);
    assert.equal(middleware(req(p, { "x-robin-internal": SECRET + "x" }))?.status, 401, `${p} longer`);
    assert.equal(middleware(req(p, { authorization: "Basic " + btoa("u:" + SECRET) }))?.status, 401, `${p} password is not a way in`);
  }
});

test("lets the portal through on every path", () => {
  process.env.ROBIN_INTERNAL_SECRET = SECRET;
  for (const p of PATHS) assert.equal(middleware(req(p, { "x-robin-internal": SECRET })), undefined, p);
});

test("never throws on a malformed request", () => {
  process.env.ROBIN_INTERNAL_SECRET = SECRET;
  assert.equal(middleware(undefined)?.status, 401);
  assert.equal(middleware({})?.status, 401);
});
