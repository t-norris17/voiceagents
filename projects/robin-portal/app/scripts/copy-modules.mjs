// Copies the existing module pages into public/ so the portal serves them at the same paths they
// have today. The broker and the cleaner stay the source of truth; nothing here is edited.
//
//   broker/public/survey          -> public/survey          (/survey/, /survey/slide/)
//   broker/public/robin-q-tester  -> public/robin-q-tester  (/robin-q-tester/)
//   broker/public/dashboard       -> public/dashboard       (/dashboard/, linked from the survey footer)
//   cleaner/public/index.html     -> public/factory/index.html (/factory/)
//   cleaner/public/vendor         -> public/vendor          (the cleaner imports /vendor/pdf.min.mjs)
//
// After the copy, each module page gets one thing the sources do not have: a fixed "Robin portal"
// link back to the landing page (bottom-left; the survey's Ask button owns bottom-right). It is
// appended to the copy only, so the pages stay byte-identical where they are served on their own.
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
  [join(broker, "dashboard"), join(app, "public", "dashboard")],
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

const pages = ["survey/index.html", "survey/slide/index.html", "robin-q-tester/index.html", "dashboard/index.html", "factory/index.html"];
for (const rel of pages) {
  const file = join(app, "public", rel);
  const html = readFileSync(file, "utf8");
  if (!html.includes("</body>")) {
    console.error(`copy-modules: no </body> in ${rel}, cannot add the portal link`);
    process.exit(1);
  }
  writeFileSync(file, html.replace("</body>", `${HOME_LINK}</body>`));
  console.log(`copy-modules: portal link -> public/${rel}`);
}
