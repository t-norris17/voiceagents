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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const HOME_LINK = `
<a id="rp-home" href="/" aria-label="Back to the Robin portal">&larr; Robin portal</a>
<style>
#rp-home{position:fixed;left:18px;bottom:18px;z-index:70;font:700 .68rem/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;padding:10px 14px;background:#17181c;color:#f2f0ea;border:1px solid #17181c;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.18)}
#rp-home:hover{background:#f2f0ea;color:#17181c}
@media (prefers-color-scheme:dark){#rp-home{background:#ecebe6;color:#15161a;border-color:#ecebe6}#rp-home:hover{background:#15161a;color:#ecebe6}}
@media print{#rp-home{display:none}}
</style>
`;

// The masthead. Colours come from each page's own tokens where it has them (all three define
// --paper/--ink/--sub), with the portal's values as the fallback, so a page that forces a theme
// carries the bar with it.
const MAST = (current) => `
<div class="rp-mast"><div class="rp-in"><a class="rp-wm" href="/">Robin</a><nav aria-label="Sections">${[
  ["/survey/", "Quality"], ["/grader", "Accuracy"], ["/factory/", "Knowledge Factory"],
  ["/robin-q-tester/", "Question Tester"], ["/calls", "Calls"], ["/about", "About Robin"],
].map(([h, l]) => `<a href="${h}"${h === current ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav></div></div>
<style>
.rp-mast{background:var(--paper,#f2f0ea);border-bottom:2px solid var(--ink,#17181c);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.rp-in{max-width:920px;margin:0 auto;padding:16px 40px 12px;display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap}
.rp-wm{font-size:1.25rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase;text-decoration:none;color:var(--ink,#17181c)}
.rp-mast nav{display:flex;gap:16px;flex-wrap:wrap}
.rp-mast nav a{font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:var(--sub,#6c7075);text-decoration:none;padding-bottom:3px;border-bottom:2px solid transparent}
.rp-mast nav a:hover,.rp-mast nav a[aria-current="page"]{color:var(--ink,#17181c);border-bottom-color:var(--ink,#17181c)}
@media (max-width:640px){.rp-in{padding:14px 18px 10px}}
.rp-hide-tag .tag{display:none}
</style>
`;

const pages = [
  ["survey/index.html", "/survey/"],
  ["robin-q-tester/index.html", "/robin-q-tester/"],
  ["factory/index.html", "/factory/"],
  ["survey/guide/index.html", "/survey/"],
  ["survey/slide/index.html", null],
];
for (const [rel, current] of pages) {
  const file = join(app, "public", rel);
  let html = readFileSync(file, "utf8");
  if (!html.includes("</body>") || !html.includes("<body>")) {
    console.error(`copy-modules: no <body> in ${rel}, cannot add the portal chrome`);
    process.exit(1);
  }
  if (current) {
    // The masthead goes first inside <body>; the page's own small kicker line (.tag) is hidden
    // because the masthead now says whose page this is.
    html = html.replace("<body>", `<body class="rp-hide-tag">${MAST(current)}`);
  }
  html = html.replace("</body>", `${HOME_LINK}</body>`);
  writeFileSync(file, html);
  console.log(`copy-modules: portal chrome -> public/${rel}`);
}
