// The nest loader is one function, injected as source into the copied module pages, so it must stand alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { loaderHtml } from "../lib/loader.js";

test("the loader renders at its default size and says what it is loading", () => {
  const h = loaderHtml();
  assert.match(h, /--size:160px/);
  assert.match(h, /role="status"/);
  assert.match(h, /aria-label="Loading"/);
  assert.equal((h.match(/<img /g) || []).length, 4, "the nest and three eggs");
  assert.match(loaderHtml({ size: 84, label: "Loading waves", dots: false }), /--size:84px.*Loading waves<\/p>/);
});

test("a label cannot inject markup", () => {
  const h = loaderHtml({ label: '"><script>alert(1)</script>' });
  assert.ok(!h.includes("<script"), h);
});

test("its source survives toString() and runs with nothing else in scope, as it does in the module pages", () => {
  const src = `window.rpLoader=${loaderHtml.toString()}`;
  const window = {};
  vm.runInNewContext(src, { window });
  assert.equal(window.rpLoader({ size: 56, label: "Thinking" }), loaderHtml({ size: 56, label: "Thinking" }));
});

test("every module page the portal copies gets the loader, and its stylesheet", () => {
  const s = readFileSync(new URL("../scripts/copy-modules.mjs", import.meta.url), "utf8");
  assert.match(s, /\/loader\/loader\.css/);
  assert.match(s, /window\.rpLoader=\$\{loaderHtml\.toString\(\)\}/);
});
