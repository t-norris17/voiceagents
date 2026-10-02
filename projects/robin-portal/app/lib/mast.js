// The masthead, written once. Every room of the portal carries the same bar: the Next.js pages render
// it through components/Masthead.js, and scripts/copy-modules.mjs injects the same markup and the same
// CSS into the copied module pages (Quality, Dry Run, Knowledge Factory). Before this the nav lived in
// three hand-copied places, so a rename had to be made three times.
//
// The destinations are grouped by what a person is doing, not by tool name. The group label sits above
// its links, so the links keep one line each. Four groups of similar weight, right-aligned against the
// wordmark, with the theme switch last. Routes are unchanged by a rename: /calls is still
// /calls, only its label changed.
import { CONTROL_HTML } from "./theme.js";

export const GROUPS = [
  { label: "Listen", items: [{ href: "/calls", label: "Interactions" }] },
  { label: "Understand", items: [
    { href: "/survey/", label: "Quality" },
    { href: "/utilization", label: "Utilization" },
  ] },
  { label: "Improve", items: [
    { href: "/grader", label: "Accuracy" },
    { href: "/factory/", label: "Knowledge Factory" },
    { href: "/robin-q-tester/", label: "Dry Run" },
  ] },
  // About the agent herself, and a way to try her. A fourth group of the same weight as the others, so
  // the bar is four even clusters instead of three plus a stray pair on the right.
  { label: "Robin", items: [
    { href: "/about", label: "About" },
    { href: "/demo-website/", label: "Demo Website", newTab: true },
  ] },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const link = (it, current) =>
  `<a href="${esc(it.href)}"${it.href === current ? ' aria-current="page"' : ""}${it.newTab ? ' target="_blank" rel="noopener"' : ""}>${esc(it.label)}</a>`;

// `current` is the href of the page being shown (or null on the landing page and the slide).
export function mastHtml(current) {
  const groups = GROUPS.map((g) =>
    `<div class="rp-grp"><span class="rp-gl">${esc(g.label)}</span><span class="rp-links">${g.items.map((i) => link(i, current)).join("")}</span></div>`
  ).join("");
  return `<div class="rp-mast"><div class="rp-in"><a class="rp-wm" href="/" aria-label="Birdnest, all your eggs in one place"><span class="rp-wmt">Birdnest</span><span class="rp-tag">all your eggs<br>in one place</span></a><nav aria-label="Sections">${groups}</nav><div class="rp-end">${CONTROL_HTML}</div></div></div>`;
}

// Colours come from the page's own tokens where it has them, with the portal's values as the
// fallback, so a page that forces a theme carries the bar with it. `width` matches the page's own
// sheet so the bar and the page align.
export function mastCss(width = 1120) {
  return `
.rp-mast{background:var(--paper,#f2f0ea);border-bottom:2px solid var(--ink,#17181c);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.rp-in{max-width:var(--rp-w,${width}px);margin:0 auto;padding:14px 36px 12px;display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap}
.rp-wm{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:var(--ink,#17181c);padding-bottom:2px}
.rp-wmt{font-size:1.2rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1}
.rp-tag{font:600 .5rem/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--faint,#a29e95)}
.rp-mast nav{display:flex;gap:18px;margin-left:auto;min-width:0;flex-wrap:wrap}
.rp-grp{display:flex;flex-direction:column;gap:5px}
.rp-grp+.rp-grp{border-left:1px solid var(--line,#d7d3c9);padding-left:18px}
.rp-gl{font:600 .56rem ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--faint,#a29e95)}
.rp-links{display:flex;gap:14px}
.rp-mast nav a{font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--sub,#6c7075);text-decoration:none;padding-bottom:3px;border-bottom:2px solid transparent;white-space:nowrap}
.rp-mast nav a:hover,.rp-mast nav a[aria-current="page"]{color:var(--ink,#17181c);border-bottom-color:var(--ink,#17181c)}
.rp-end{display:flex;align-items:flex-end;padding-bottom:1px}
.rp-theme{display:inline-flex;border:1px solid var(--line,#d7d3c9);border-radius:999px;overflow:hidden;align-self:center}
.rp-theme button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;padding:0;background:none;color:var(--sub,#6c7075);border:0;cursor:pointer}
.rp-theme button[aria-pressed="true"]{background:var(--ink,#17181c);color:var(--paper,#f2f0ea)}
.rp-theme button:focus-visible{outline:2px solid var(--accent,#b8501e);outline-offset:2px}
@media (max-width:640px){.rp-in{padding:14px 18px 10px}}
`;
}
