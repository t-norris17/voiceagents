// The markup of the nest loader, written once. The Next.js pages render it through components/NestLoader.js;
// scripts/copy-modules.mjs injects THIS FUNCTION'S SOURCE into the copied module pages as window.rpLoader, so
// the markup cannot drift between the two. It is therefore self-contained on purpose: no imports, no outside
// references, and nothing that does not survive Function.prototype.toString().
//
// opts: size (px, default 160), label (default "Loading"), dots (default true).
export function loaderHtml(o) {
  o = o || {};
  var size = Number(o.size) > 0 ? Math.round(Number(o.size)) : 160;
  var label = String(o.label == null ? "Loading" : o.label).replace(/[<>&"]/g, "");
  var dots = o.dots === false ? "" : "<i>.</i><i>.</i><i>.</i>";
  return '<div class="nest-loader" style="--size:' + size + 'px" role="status" aria-live="polite" aria-label="' + label + '">' +
    '<div class="nest-stage"><div class="nest-bob">' +
    '<img src="/loader/nest.webp" alt="" decoding="async">' +
    '<img class="nest-egg left" src="/loader/egg-left.webp" alt="" decoding="async">' +
    '<img class="nest-egg center" src="/loader/egg-center.webp" alt="" decoding="async">' +
    '<img class="nest-egg right" src="/loader/egg-right.webp" alt="" decoding="async">' +
    '</div></div><div class="nest-shadow" aria-hidden="true"></div>' +
    '<p class="nest-label">' + label + dots + "</p></div>";
}
