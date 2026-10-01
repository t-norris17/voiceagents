// The masthead, written once. Every room of the portal carries the same bar: the Next.js pages render
// it through components/Masthead.js, and scripts/copy-modules.mjs injects the same markup and the same
// CSS into the copied module pages (Quality, Dry Run, Knowledge Factory). Before this the nav lived in
// three hand-copied places, so a rename had to be made three times.
//
// The destinations are grouped by what a person is doing, not by tool name. The group label sits above
// its links, so the links keep one line each. Routes are unchanged by a rename: /calls is still
// /calls, only its label changed.
import { CONTROL_HTML } from "./theme.js";

export const GROUPS = [
  { label: "Listen", items: [{ href: "/calls", label: "Interactions" }] },
  { label: "Understand", items: [{ href: "/survey/", label: "Quality" }] },
  { label: "Improve", items: [
    { href: "/grader", label: "Accuracy" },
    { href: "/factory/", label: "Knowledge Factory" },
    { href: "/robin-q-tester/", label: "Dry Run" },
  ] },
];

// Quiet, on the right: not part of the work itself.
export const SECONDARY = [
  { href: "/demo-website/", label: "Demo Website", newTab: true },
  { href: "/about", label: "About Robin" },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const link = (it, current) =>
  `<a href="${esc(it.href)}"${it.href === current ? ' aria-current="page"' : ""}${it.newTab ? ' target="_blank" rel="noopener"' : ""}>${esc(it.label)}</a>`;

// `current` is the href of the page being shown (or null on the landing page and the slide).
export function mastHtml(current) {
  const groups = GROUPS.map((g) =>
    `<div class="rp-grp"><span class="rp-gl">${esc(g.label)}</span><span class="rp-links">${g.items.map((i) => link(i, current)).join("")}</span></div>`
  ).join("");
  const secondary = SECONDARY.map((i) => link(i, current)).join("");
  return `<div class="rp-mast"><div class="rp-in"><a class="rp-wm" href="/">Robin</a><nav aria-label="Sections">${groups}</nav><div class="rp-end"><span class="rp-sec">${secondary}</span>${CONTROL_HTML}</div></div></div>`;
}

// Colours come from the page's own tokens where it has them, with the portal's values as the
// fallback, so a page that forces a theme carries the bar with it. `width` matches the page's own
// sheet so the bar and the page align.
export function mastCss(width = 1120) {
  return `
.rp-mast{background:var(--paper,#f2f0ea);border-bottom:2px solid var(--ink,#17181c);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.rp-in{max-width:${width}px;margin:0 auto;padding:14px 36px 12px;display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap}
.rp-wm{font-size:1.25rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase;text-decoration:none;color:var(--ink,#17181c);line-height:1;padding-bottom:3px}
.rp-mast nav{display:flex;gap:22px;flex:1 1 auto;min-width:0;flex-wrap:wrap}
.rp-grp{display:flex;flex-direction:column;gap:5px}
.rp-grp+.rp-grp{border-left:1px solid var(--line,#d7d3c9);padding-left:22px}
.rp-gl{font:600 .56rem ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--faint,#a29e95)}
.rp-links{display:flex;gap:16px}
.rp-mast a:not(.rp-wm){font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:var(--sub,#6c7075);text-decoration:none;padding-bottom:3px;border-bottom:2px solid transparent;white-space:nowrap}
.rp-mast a:not(.rp-wm):hover,.rp-mast a[aria-current="page"]{color:var(--ink,#17181c);border-bottom-color:var(--ink,#17181c)}
.rp-end{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:7px}
.rp-sec{display:flex;gap:14px}
.rp-sec a{font-size:.6rem!important;color:var(--faint,#a29e95)!important}
.rp-sec a:hover{color:var(--ink,#17181c)!important}
.rp-theme{display:inline-flex;border:1px solid var(--line,#d7d3c9);border-radius:999px;overflow:hidden;align-self:center}
.rp-theme button{font:inherit;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;padding:5px 11px;background:none;color:var(--sub,#6c7075);border:0;cursor:pointer}
.rp-theme button[aria-pressed="true"]{background:var(--ink,#17181c);color:var(--paper,#f2f0ea)}
.rp-theme button:focus-visible{outline:2px solid var(--accent,#b8501e);outline-offset:2px}
@media (max-width:640px){.rp-in{padding:14px 18px 10px}}
`;
}
