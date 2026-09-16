// Copies the existing module pages into public/ so the portal serves them at the same paths they
// have today. The broker and the cleaner stay the source of truth; nothing here is edited.
//
//   broker/public/survey          -> public/survey          (/survey/, /survey/slide/)
//   broker/public/robin-q-tester  -> public/robin-q-tester  (/robin-q-tester/)
//   broker/public/dashboard       -> public/dashboard       (/dashboard/, linked from the survey footer)
//   cleaner/public/index.html     -> public/factory/index.html (/factory/)
//   cleaner/public/vendor         -> public/vendor          (the cleaner imports /vendor/pdf.min.mjs)
//
// Runs as `prebuild`. Fails loudly if a source is missing: a silently empty door is worse than a
// failed build.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
