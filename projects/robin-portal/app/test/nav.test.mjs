// The masthead is one data file rendered in two places (the Next.js pages and the copied module
// pages). These checks keep that file honest: every destination is a real room, nothing is listed
// twice, the current page is marked, and a rename never changes a route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, SECONDARY, mastHtml, mastCss } from "../lib/mast.js";
import { moduleRewrite } from "../lib/module-paths.js";

const all = [...GROUPS.flatMap((g) => g.items), ...SECONDARY];

test("every destination is unique", () => {
  const hrefs = all.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("every destination is a room the portal actually serves", () => {
  // Next.js pages by their own route; module pages through the middleware rewrite.
  const nextPages = new Set(["/calls", "/grader", "/about"]);
  for (const { href, label } of all) {
    assert.ok(nextPages.has(href) || moduleRewrite(href.replace(/\/$/, "")), `${label} (${href}) is not a served route`);
  }
});

test("labels are the names agreed for the portal, routes are the old ones", () => {
  const by = Object.fromEntries(all.map((i) => [i.label, i.href]));
  assert.equal(by["Interactions"], "/calls");
  assert.equal(by["Dry Run"], "/robin-q-tester/");
  assert.equal(by["Accuracy"], "/grader");
  assert.ok(!("Calls" in by) && !("Question Tester" in by), "the old names must be gone");
});

test("groups render with their label above the links, and the current page is marked", () => {
  const html = mastHtml("/grader");
  for (const g of GROUPS) assert.ok(html.includes(`>${g.label}<`), `group ${g.label}`);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /href="\/grader" aria-current="page">Accuracy</);
  assert.match(html, /target="_blank" rel="noopener">Demo Website</);
});

test("no page is marked current on the landing page", () => {
  assert.ok(!mastHtml("/").includes("aria-current"));
});

test("the css takes the page's own width", () => {
  assert.match(mastCss(1400), /max-width:1400px/);
  assert.match(mastCss(), /max-width:1120px/);
});
