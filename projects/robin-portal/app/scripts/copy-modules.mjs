// Copies the existing module pages into public/ so the portal serves them at the same paths they
// have today. The broker and the cleaner stay the source of truth; nothing here is edited.
//
//   broker/public/survey          -> public/survey          (/survey/, /survey/slide/)
//   broker/public/robin-q-tester  -> public/robin-q-tester  (/robin-q-tester/)
//   cleaner/public/index.html     -> public/factory/index.html (/factory/)
//   cleaner/public/vendor         -> public/vendor          (the cleaner imports /vendor/pdf.min.mjs)
//
// After the copy, each module page gets two things the sources do not have: the portal's masthead
// (wordmark and the same nav as the landing page) at the top, and a fixed "Robin portal" link at the
// bottom-left (the survey's Ask button owns bottom-right). Both are added to the copy only, so the
// pages stay byte-identical where they are served on their own. The slide gets neither: it is the
// projector artifact.
//
// Runs as `prebuild`. Fails loudly if a source is missing: a silently empty door is worse than a
// failed build.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRE_PAINT, CONTROL_JS } from "../lib/theme.js";
import { mastHtml, mastCss } from "../lib/mast.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const projects = resolve(app, "..", "..");
const broker = join(projects, "robin-experiment", "broker", "public");
const cleaner = join(projects, "content-cleaner", "cleaner", "public");

const jobs = [
  [join(broker, "survey"), join(app, "public", "survey")],
  [join(broker, "robin-q-tester"), join(app, "public", "robin-q-tester")],
  [join(cleaner, "index.html"), join(app, "public", "factory", "index.html")],
  [join(cleaner, "vendor"), join(app, "public", "vendor")],
  // The guided-tour engine, shared by every page (the Next.js layout loads it too).
  [join(broker, "robin-tour.js"), join(app, "public", "robin-tour.js")],
  // The Vertex Manufacturing demo website (vertex-demo-site stays the source of truth). Mounted under
  // /demo-website/ so it is served from the portal's own domain, behind the portal's password.
  [join(projects, "vertex-demo-site", "site"), join(app, "public", "demo-website")],
];

for (const [from, to] of jobs) {
  if (!existsSync(from)) {
    console.error(`copy-modules: missing source ${from}`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`copy-modules: ${from.replace(projects + "/", "")} -> ${to.replace(app + "/", "")}`);
}

// The demo website is authored to be served from a site root (/assets/..., /about). It is mounted
// here under /demo-website/, so every root-absolute URL in the copy gets the prefix. The copy gets
// NO portal masthead, on purpose: it has to read as a real employer's site, so a tester (or a boss)
// sees Vertex, and Robin appears only as the widget. The one addition is a small back link, below. Its own vercel.json (headers for
// its standalone deployment) is dropped. Fails loudly if a root-absolute URL survives the rewrite.
const DEMO_PREFIX = "/demo-website";
const demoDir = join(app, "public", "demo-website");
rmSync(join(demoDir, "vercel.json"), { force: true });
const demoFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? demoFiles(join(dir, e.name)) : [join(dir, e.name)]
  );
let demoRewritten = 0;
for (const file of demoFiles(demoDir)) {
  let text;
  if (file.endsWith(".html")) {
    text = readFileSync(file, "utf8").replace(/\b(href|src)="\/(?!\/)/g, `$1="${DEMO_PREFIX}/`);
  } else if (file.endsWith(".css")) {
    text = readFileSync(file, "utf8").replace(/url\((["']?)\/(?!\/)/g, `url($1${DEMO_PREFIX}/`);
  } else continue;
  writeFileSync(file, text);
  demoRewritten++;
  const left = text.match(/\b(?:href|src)="\/(?!demo-website\/|\/)|url\(["']?\/(?!demo-website\/|\/)/g);
  if (left) {
    console.error(`copy-modules: root-absolute URL left in ${file.replace(app + "/", "")}: ${left[0]}`);
    process.exit(1);
  }
}
console.log(`copy-modules: demo website mounted under ${DEMO_PREFIX}/ (${demoRewritten} files rewritten)`);

const HOME_LINK = `
<a id="rp-home" href="/" aria-label="Back to the Robin portal">&larr; Robin portal</a>
<style>
#rp-home{position:fixed;left:18px;bottom:18px;z-index:70;font:700 .68rem/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;padding:10px 14px;background:#17181c;color:#f2f0ea;border:1px solid #17181c;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.18)}
#rp-home:hover{background:#f2f0ea;color:#17181c}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) #rp-home{background:#ecebe6;color:#15161a;border-color:#ecebe6}:root:not([data-theme="light"]) #rp-home:hover{background:#15161a;color:#ecebe6}}
:root[data-theme="dark"] #rp-home{background:#ecebe6;color:#15161a;border-color:#ecebe6}:root[data-theme="dark"] #rp-home:hover{background:#15161a;color:#ecebe6}
@media print{#rp-home{display:none}}
</style>
`;

// The masthead is written once, in lib/mast.js (the Next.js pages render the same bar). A page's own
// small kicker line (.tag) and its own Light / Dark control (.pg-theme) are hidden under it. The
// theme control itself is the portal's (lib/theme.js).
const MAST = (current, width) => `
${mastHtml(current)}
<style>
${mastCss(width)}
.rp-hide-tag .tag,.rp-hide-tag .pg-theme{display:none}
</style>
<script>${CONTROL_JS}</script>
`;

const pages = [
  ["survey/index.html", "/survey/", 1400],
  ["robin-q-tester/index.html", "/robin-q-tester/", 1120],
  ["factory/index.html", "/factory/", 1120],
  ["survey/guide/index.html", "/survey/", 1120],
  ["survey/slide/index.html", null, 920],
];
for (const [rel, current, width] of pages) {
  const file = join(app, "public", rel);
  let html = readFileSync(file, "utf8");
  if (!html.includes("</body>") || !html.includes("<body>") || !html.includes("<head>")) {
    console.error(`copy-modules: no <head>/<body> in ${rel}, cannot add the portal chrome`);
    process.exit(1);
  }
  // The stored theme is applied before first paint on every page, the slide included.
  html = html.replace("<head>", `<head><script>${PRE_PAINT}</script>`);
  if (current) {
    // The masthead goes first inside <body>; the page's own small kicker line (.tag) is hidden
    // because the masthead now says whose page this is.
    html = html.replace("<body>", `<body class="rp-hide-tag">${MAST(current, width)}`);
  }
  html = html.replace("</body>", `${HOME_LINK}</body>`);
  writeFileSync(file, html);
  console.log(`copy-modules: portal chrome -> public/${rel}`);
}

// The demo website gets ONLY the fixed "Robin portal" link, bottom-left (the chat widget owns
// bottom-right), so a tester who opened it from the portal can get back. No masthead: the site must
// still read as a real employer's. It goes into the portal's copy only, so the standalone deployment
// of the site has no trace of the portal.
let demoLinks = 0;
for (const file of demoFiles(demoDir)) {
  if (!file.endsWith(".html")) continue;
  const html = readFileSync(file, "utf8");
  if (!html.includes("</body>")) {
    console.error(`copy-modules: no </body> in ${file.replace(app + "/", "")}, cannot add the portal link`);
    process.exit(1);
  }
  writeFileSync(file, html.replace("</body>", `${HOME_LINK}</body>`));
  demoLinks++;
}
console.log(`copy-modules: portal link -> ${demoLinks} demo website pages`);
