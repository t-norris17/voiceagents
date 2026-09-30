import test from "node:test";
import assert from "node:assert/strict";
import { moduleRewrite } from "../lib/module-paths.js";

// The routes that existed before the demo website was added must behave exactly as they did.
test("existing module directory URLs still map to index.html, with or without the slash", () => {
  for (const [path, want] of [
    ["/survey", "/survey/index.html"],
    ["/survey/", "/survey/index.html"],
    ["/survey/slide", "/survey/slide/index.html"],
    ["/survey/slide/", "/survey/slide/index.html"],
    ["/survey/guide/", "/survey/guide/index.html"],
    ["/robin-q-tester/", "/robin-q-tester/index.html"],
    ["/factory", "/factory/index.html"],
  ]) assert.equal(moduleRewrite(path), want, path);
});

test("the demo website maps its directory URL and its clean page URLs", () => {
  assert.equal(moduleRewrite("/demo-website"), "/demo-website/index.html");
  assert.equal(moduleRewrite("/demo-website/"), "/demo-website/index.html");
  assert.equal(moduleRewrite("/demo-website/about"), "/demo-website/about.html");
  assert.equal(moduleRewrite("/demo-website/tester-guide"), "/demo-website/tester-guide.html");
});

test("everything else is left alone", () => {
  for (const p of [
    "/", "/calls", "/grader", "/about", "/api/health",
    "/demo-website/about.html", "/demo-website/assets/style.css",
    "/demo-website/assets/vendor/convai-widget-embed-0.18.3.js", "/demo-website/a.b", "/demo-website/x/y",
    "/demo-websites", "/survey/export.csv",
  ]) assert.equal(moduleRewrite(p), null, p);
});
