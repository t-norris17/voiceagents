// The Factory page's publish dock must only ever publish answers approved under the plan of the run on
// screen. The server also holds approved rows from other plans and earlier days; a batch press that
// carried one into Robin's live knowledge base is the defect this test pins down.
//
// Drives the real page in Chromium against a stubbed API (nothing here touches ElevenLabs or
// Supabase). Needs Playwright; without it the whole file is SKIPPED rather than passed.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = process.env.FACTORY_PUBLIC || join(here, "..", "public"); // override: point at another copy of the page

function loadPlaywright() {
  for (const base of [import.meta.url, "/opt/node22/lib/node_modules/", "/usr/lib/node_modules/", "/usr/local/lib/node_modules/"]) {
    try { return createRequire(base)("playwright"); } catch { /* try the next */ }
  }
  return null;
}
const pw = loadPlaywright();
const skip = !pw ? "Playwright is not installed here" : false;

// The July row from the live database, in miniature: approved, a different plan, never published.
const STALE = { id: "stale-1", plan_id: "intrust-401k-plan", slug: "employer-right-to-terminate", title: "Can INTRUST end the plan?",
  version: 1, state: "approved", updated_at: "2026-07-30 14:50:14.137+00", body_md: "stale body" };

function makeStub(seed, extra = {}) {
  let rows = seed.map((r) => ({ ...r })); let n = 0; const log = [];
  const art = (slug, title) => ({ slug, title, md: `${title}\n\nYes. A one hundred dollar fee applies.\n`, findings: [],
    review: { score: 5, counts: { claims: 1 }, issues: [], claims: [{ claim: "$100 fee", verdict: "supported", source_quote: "$100 fee" }], omissions: [], deductions: [] },
    coverage_flags: [], candidate_questions: [] });
  async function handle(route) {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.fallback();
    const name = url.pathname.slice(5);
    let body = null; try { body = route.request().postDataJSON(); } catch { /* GET */ }
    log.push({ name, body });
    const json = (o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
    if (name === "kb_list") return json({ rows, ...extra });
    if (name === "clean") return json({ meta: { slug: body.slug, environment: body.env, source: null },
      articles: [art(`${body.slug}-loan`, "Can I take a loan?"), art(`${body.slug}-match`, "Is my match vested?")],
      summary: { articles: 2 }, reports: { drop: "", coverage: "", questions: "" }, dropped: [], coverage_gaps: [], terminology_notes: [] });
    if (name === "approve") {
      const a = body.article; let r = rows.find((x) => x.plan_id === a.plan_id && x.slug === a.slug && x.state === "approved");
      if (!r) { r = { id: `row-${++n}`, plan_id: a.plan_id, slug: a.slug, title: a.title, version: 1, state: "approved", updated_at: new Date().toISOString(), body_md: a.body_md }; rows.push(r); }
      return json({ ok: true, staged: { id: r.id } });
    }
    if (name === "publish") { const r = rows.find((x) => x.id === body.id); r.state = "published"; r.elevenlabs_rag_indexed = true; return json({ ok: true }); }
    return json({ error: "unstubbed " + name }, 404);
  }
  return { handle, log, rows: () => rows };
}

async function withPage(seed, fn, extra = {}) {
  const server = createServer((req, res) => {
    const path = join(PUBLIC, new URL(req.url, "http://x").pathname === "/" ? "index.html" : new URL(req.url, "http://x").pathname);
    if (!path.startsWith(PUBLIC) || !existsSync(path)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": path.endsWith(".mjs") || path.endsWith(".js") ? "text/javascript" : "text/html" }).end(readFileSync(path));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const stub = makeStub(seed, extra); await page.route("**/api/**", stub.handle);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await fn(page, stub);
  } finally { await browser.close(); server.close(); }
}
async function cleanAndApproveFirst(page) {
  await page.click("#pastebtn"); await page.fill("#src", "x"); await page.fill("#env", "Meridian Plan"); await page.click("#run");
  await page.waitForSelector(".rev .it");
  await page.click(".it:has-text('loan')"); await page.click("#approvebtn");
  await page.waitForSelector("#dock:not([hidden])");
}

test("a stale approved row from another plan is not in the dock on load", { skip }, async () => {
  await withPage([STALE], async (page) => {
    await page.waitForFunction(() => document.querySelector("#libbtn").textContent.includes("waiting"));
    assert.equal(await page.$eval("#dock", (e) => e.hidden), true, "dock must stay hidden before anything is approved in a run");
    assert.match(await page.textContent("#libbtn"), /1 waiting/);
  });
});

test("publishing the dock's batch never carries the stale row", { skip }, async () => {
  await withPage([STALE], async (page, stub) => {
    await cleanAndApproveFirst(page);
    assert.match(await page.textContent("#dock"), /1 approved in this run/);
    await page.click("#dock .btn.go");
    await page.waitForFunction(() => /live/.test(document.querySelector("#dock").textContent));
    const published = stub.log.filter((l) => l.name === "publish").map((l) => l.body.id);
    assert.equal(published.length, 1);
    assert.ok(!published.includes("stale-1"), "the stale row must not be published by the dock");
    assert.equal(stub.rows().find((r) => r.id === "stale-1").state, "approved", "the stale row is untouched");
  });
});

test("the Library shows the stale row's plan and date, and asks before publishing it", { skip }, async () => {
  await withPage([STALE], async (page, stub) => {
    await page.waitForFunction(() => document.querySelector("#libbtn").textContent.includes("waiting"));
    await page.click("#libbtn"); await page.waitForSelector("#v-library .pub");
    const meta = await page.textContent("#v-library .pubmeta");
    assert.match(meta, /plan intrust-401k-plan/); assert.match(meta, /approved 2026-07-30/);
    await page.click("#v-library .pubact button:has-text('Publish')");
    assert.match(await page.textContent("#v-library .pubact"), /Publish it to Robin\?/);
    assert.equal(stub.log.filter((l) => l.name === "publish").length, 0, "one click must not publish an outside row");
    await page.click("#v-library .pubact button:has-text('Cancel')");
    assert.equal(stub.log.filter((l) => l.name === "publish").length, 0);
  });
});

test("a stale approved row under the SAME plan name is excluded too", { skip }, async () => {
  const sameName = { ...STALE, id: "stale-same", plan_id: "meridian-plan", slug: "old-answer" };
  await withPage([sameName], async (page, stub) => {
    await cleanAndApproveFirst(page);
    assert.match(await page.textContent("#dock"), /1 approved in this run/);
    await page.click("#dock .btn.go");
    await page.waitForFunction(() => /live/.test(document.querySelector("#dock").textContent));
    assert.deepEqual(stub.log.filter((l) => l.name === "publish").map((l) => l.body.id), ["row-1"]);
    assert.equal(stub.rows().find((r) => r.id === "stale-same").state, "approved");
  });
});

test("after a reload and restore the dock is still scoped to the run's plan", { skip }, async () => {
  await withPage([STALE], async (page) => {
    await cleanAndApproveFirst(page);
    await page.reload(); await page.waitForSelector("#restore .msg");
    assert.equal(await page.$eval("#dock", (e) => e.hidden), true, "no run on screen yet, so no dock");
    await page.click("#restore button:has-text('Restore')"); await page.waitForSelector(".rev .it");
    await page.waitForSelector("#dock:not([hidden])");
    assert.match(await page.textContent("#dock"), /1 approved in this run/, "the approval survives the reload, the stale row is still excluded, and the restored run remembers which rows it approved");
  });
});

// ---- the Library says what Robin actually has -------------------------------------------------------
const PUBLISHED_ATTACHED = { id: "p1", plan_id: "meridian", slug: "loans", title: "Loans", version: 1, state: "published", elevenlabs_document_id: "DOC_A", attached: true, updated_at: "2026-10-01T00:00:00Z" };
const PUBLISHED_ORPHAN = { id: "p2", plan_id: "intrust-401k-plan", slug: "old", title: "Old INTRUST answer", version: 1, state: "published", elevenlabs_document_id: "DOC_O", attached: false, updated_at: "2026-07-24T00:00:00Z" };
const ATTACHED = [{ id: "DOC_A", name: "Loans (Factory)", type: "text", usage_mode: "auto" }, { id: "DOC_D", name: "Vertex 401(k) Loans (dashboard)", type: "file", usage_mode: "auto" }];

test("live means attached: the Library lists what is attached, and sets published-but-detached rows apart", { skip }, async () => {
  await withPage([PUBLISHED_ATTACHED, PUBLISHED_ORPHAN], async (page) => {
    await page.waitForFunction(() => /live/.test(document.querySelector("#libbtn").textContent));
    assert.match(await page.textContent("#libbtn"), /Library · 2 live/, "the count is attached documents, not published rows");
    await page.click("#libbtn"); await page.waitForSelector("#v-library .pub");
    const text = await page.textContent("#v-library");
    assert.match(text, /Live in Robin's knowledge base · 2/);
    assert.match(text, /Vertex 401\(k\) Loans \(dashboard\)/);
    assert.match(text, /added in the ElevenLabs dashboard/);
    assert.match(text, /Published, but not attached to Robin · 1/);
    assert.match(text, /Old INTRUST answer/);
    // a dashboard document is shown but cannot be edited or unpublished from here
    const dashCard = page.locator("#v-library .pub", { hasText: "Vertex 401(k) Loans (dashboard)" });
    assert.equal(await dashCard.locator("button").count(), 0);
  }, { attached: ATTACHED, attached_known: true });
});

test("when the agent cannot be read, nothing is called live", { skip }, async () => {
  await withPage([PUBLISHED_ATTACHED, PUBLISHED_ORPHAN], async (page) => {
    await page.waitForFunction(() => /Library · /.test(document.querySelector("#libbtn").textContent));
    assert.match(await page.textContent("#libbtn"), /Library · 2 published/);
    await page.click("#libbtn"); await page.waitForSelector("#v-library .pub");
    const text = await page.textContent("#v-library");
    assert.match(text, /Couldn't tell which documents are attached to Robin/);
    assert.ok(!/Live in Robin's knowledge base/.test(text));
  }, { attached: [], attached_known: false, attached_error: "403" });
});
