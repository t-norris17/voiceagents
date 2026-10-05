// The masthead is one data file rendered in two places (the Next.js pages and the copied module
// pages). These checks keep that file honest: every destination is a real room, nothing is listed
// twice, the current page is marked, and a rename never changes a route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, mastHtml, mastCss } from "../lib/mast.js";
import { moduleRewrite } from "../lib/module-paths.js";

const all = GROUPS.flatMap((g) => g.items);

test("every destination is unique", () => {
  const hrefs = all.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("every destination is a room the portal actually serves", () => {
  // Next.js pages by their own route; module pages through the middleware rewrite.
  const nextPages = new Set(["/calls", "/requests", "/grader", "/utilization", "/about"]);
  for (const { href, label } of all) {
    assert.ok(nextPages.has(href) || moduleRewrite(href.replace(/\/$/, "")), `${label} (${href}) is not a served route`);
  }
});

test("labels are the names agreed for the portal, routes are the old ones", () => {
  const by = Object.fromEntries(all.map((i) => [i.label, i.href]));
  assert.equal(by["Interactions"], "/calls");
  assert.equal(by["Dry Run"], "/robin-q-tester/");
  assert.equal(by["Accuracy"], "/grader");
  assert.equal(by["About"], "/about");
  assert.ok(!("Calls" in by) && !("Question Tester" in by), "the old names must be gone");
});

test("the bar shows only the four sections, each a button that controls its own menu", () => {
  assert.deepEqual(GROUPS.map((g) => g.label), ["Intake", "Measure", "Improve", "Robin"]);
  const html = mastHtml("/grader");
  for (const g of GROUPS) {
    const id = `rp-m-${g.label.toLowerCase()}`;
    assert.ok(html.includes(`aria-controls="${id}">${g.label}<`), `section ${g.label} is a button for ${id}`);
    assert.ok(html.includes(`<div class="rp-menu" id="${id}">`), `menu ${id} exists`);
  }
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, GROUPS.length, "every menu starts closed");
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /href="\/grader" aria-current="page">Accuracy</);
  assert.match(html, /target="_blank" rel="noopener">Demo Website</);
});

test("the section holding the current page is marked, and only that one", () => {
  const html = mastHtml("/requests");
  assert.equal((html.match(/rp-grp rp-here/g) || []).length, 1);
  assert.match(html, /rp-grp rp-here"><button[^>]*>Intake</);
  assert.ok(!mastHtml("/").includes("rp-here"), "nothing is marked on the landing page");
});

test("Intake holds Interactions and Requests; Measure holds the two reports", () => {
  const by = Object.fromEntries(GROUPS.map((g) => [g.label, g.items.map((i) => i.label)]));
  assert.deepEqual(by.Intake, ["Interactions", "Requests"]);
  assert.deepEqual(by.Measure, ["Quality", "Utilization"]);
});

test("the menu script is guarded, so a page that carries it twice binds it once", async () => {
  const { MAST_JS } = await import("../lib/mast.js");
  assert.match(MAST_JS, /if\(window\.__robinMast\) return; window\.__robinMast=1;/);
  new Function(MAST_JS.replace(/^\(function\(\)\{/, "return;(function(){")); // parses
});

test("no page is marked current on the landing page", () => {
  assert.ok(!mastHtml("/").includes("aria-current"));
});

test("the css takes the page's own width, and a page can widen it with --rp-w", () => {
  assert.match(mastCss(1400), /max-width:var\(--rp-w,1400px\)/);
  assert.match(mastCss(), /max-width:var\(--rp-w,1120px\)/, "the default is the portal's width");
  // Quality reads at 1120 and widens only in Advanced by setting --rp-w, so the wordmark stays put
  // across pages and moves only when someone asks for the wide board.
});

test("the wordmark is Birdnest with its tagline, and it links home", () => {
  const html = mastHtml("/calls");
  assert.match(html, /<a class="rp-wm" href="\/"[^>]*>.*Birdnest.*all your eggs.*in one place/s);
  assert.ok(!/class="rp-wm"[^>]*>Robin</.test(html), "the old Robin wordmark is gone");
  assert.match(html, /<a class="rp-wm"[^>]*><img class="rp-logo" src="\/brand\/nest-logo\.webp" alt=""/, "the nest sits beside the name, and is decorative (the link already says Birdnest)");
});
