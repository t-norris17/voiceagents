// Where a request for a copied module page should actually be served from.
//
// The module pages are copied into public/ at build time (scripts/copy-modules.mjs) and Next serves
// public/ files by exact path only. Two kinds of URL therefore need a rewrite:
//
//   directory URLs   /survey/, /factory/, /demo-website/ (with or without the slash) -> .../index.html
//   clean page URLs  /demo-website/about -> /demo-website/about.html (the demo site is authored with
//                    clean URLs, the way it is served on its own)
//
// Everything else returns null and is served as-is. Kept pure and dependency-free so middleware.js
// (Edge runtime) and the tests can both import it.
const MODULE_DIRS = /^\/(survey\/slide|survey\/guide|survey|robin-q-tester|factory|demo-website)\/?$/;
const DEMO_PAGE = /^\/demo-website\/([a-z0-9-]+)$/;

export function moduleRewrite(pathname) {
  const dir = pathname.match(MODULE_DIRS);
  if (dir) return `/${dir[1]}/index.html`;
  const page = pathname.match(DEMO_PAGE);
  if (page) return `/demo-website/${page[1]}.html`;
  return null;
}
