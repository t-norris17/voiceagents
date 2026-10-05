// The masthead, written once. Every room of the portal carries the same bar: the Next.js pages render
// it through components/Masthead.js, and scripts/copy-modules.mjs injects the same markup, CSS and
// script into the copied module pages (Quality, Dry Run, Knowledge Factory). Before this the nav lived
// in three hand-copied places, so a rename had to be made three times.
//
// The destinations are grouped by what a person is doing, not by tool name. Since 2026-10-05 the bar
// shows only the four section names; each opens a small menu of its pages on click (not hover: hover
// menus flicker on a diagonal mouse move and do nothing on a tablet). Showing every page inline had
// filled the bar, and adding Requests would have pushed it onto a second row. The section holding the
// current page stays marked. Routes are unchanged by a rename: /calls is still /calls.
import { CONTROL_HTML } from "./theme.js";

export const GROUPS = [
  // What came in from members: every conversation, and the after-hours callbacks waiting on a person.
  { label: "Intake", items: [
    { href: "/calls", label: "Interactions" },
    { href: "/requests", label: "Requests" },
  ] },
  // Reports to read: how callers rated Robin, and how much of her knowledge gets used.
  { label: "Measure", items: [
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

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const CHEVRON = `<svg class="rp-chev" viewBox="0 0 10 6" width="8" height="5" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// `current` is the href of the page being shown (or null on the landing page and the slide).
// Each section is a button that opens its menu; MAST_JS does the opening and closing.
export function mastHtml(current) {
  const groups = GROUPS.map((g) => {
    const here = g.items.some((i) => i.href === current);
    const id = `rp-m-${slug(g.label)}`;
    return `<div class="rp-grp${here ? " rp-here" : ""}"><button type="button" class="rp-gl" aria-expanded="false" aria-controls="${id}">${esc(g.label)}${CHEVRON}</button><div class="rp-menu" id="${id}">${g.items.map((i) => link(i, current)).join("")}</div></div>`;
  }).join("");
  return `<div class="rp-mast"><div class="rp-in"><a class="rp-wm" href="/" aria-label="Birdnest, all your eggs in one place"><img class="rp-logo" src="/brand/nest-logo.webp" alt="" width="52" height="40"><span class="rp-wmc"><span class="rp-wmt">Birdnest</span><span class="rp-tag">all your eggs<br>in one place</span></span></a><nav aria-label="Sections">${groups}</nav><div class="rp-end">${CONTROL_HTML}</div></div></div>`;
}

// Opens and closes the section menus. One open at a time; a click outside, Escape, or tabbing out of
// a menu closes it. A menu that would run off the right edge of the window opens leftward instead.
// Guarded like the theme script, so a page carrying it twice binds it once.
export const MAST_JS = `(function(){
  if(window.__robinMast) return; window.__robinMast=1;
  function groups(){ return document.querySelectorAll(".rp-mast .rp-grp"); }
  function close(g){ if(!g) return; g.classList.remove("rp-open","rp-flip"); var b=g.querySelector(".rp-gl"); if(b) b.setAttribute("aria-expanded","false"); }
  function closeAll(except){ groups().forEach(function(g){ if(g!==except) close(g); }); }
  function open(g){
    closeAll(g); g.classList.add("rp-open"); g.querySelector(".rp-gl").setAttribute("aria-expanded","true");
    var m=g.querySelector(".rp-menu"); if(m && m.getBoundingClientRect().right > document.documentElement.clientWidth - 8) g.classList.add("rp-flip");
  }
  document.addEventListener("click",function(ev){
    var t=ev.target, b=t&&t.closest?t.closest(".rp-mast .rp-gl"):null;
    if(b){ var g=b.parentNode; if(g.classList.contains("rp-open")) close(g); else open(g); return; }
    if(!(t&&t.closest&&t.closest(".rp-mast .rp-menu"))) closeAll();
  });
  document.addEventListener("keydown",function(ev){
    if(ev.key!=="Escape") return;
    var g=document.querySelector(".rp-mast .rp-grp.rp-open"); if(!g) return;
    close(g); var b=g.querySelector(".rp-gl"); if(b) b.focus();
  });
  document.addEventListener("focusin",function(ev){
    var g=document.querySelector(".rp-mast .rp-grp.rp-open");
    if(g && !g.contains(ev.target)) close(g);
  });
})();`;

// Colours come from the page's own tokens where it has them, with the portal's values as the
// fallback, so a page that forces a theme carries the bar with it. `width` matches the page's own
// sheet so the bar and the page align.
export function mastCss(width = 1120) {
  return `
.rp-mast{background:var(--paper,#f2f0ea);border-bottom:2px solid var(--ink,#17181c);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.rp-in{max-width:var(--rp-w,${width}px);margin:0 auto;padding:14px 36px 12px;display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap}
.rp-wm{display:flex;flex-direction:row;align-items:center;gap:11px;text-decoration:none;color:var(--ink,#17181c);padding-bottom:2px}
.rp-logo{display:block;height:40px;width:auto;flex:none}
.rp-wmc{display:flex;flex-direction:column;gap:4px}
.rp-wmt{font-size:1.2rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1}
.rp-tag{font:600 .5rem/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--faint,#a29e95)}
.rp-mast nav{display:flex;gap:6px;margin-left:auto;min-width:0;flex-wrap:wrap;align-items:flex-end}
.rp-grp{position:relative}
.rp-gl{display:inline-flex;align-items:center;gap:7px;background:none;border:0;border-bottom:2px solid transparent;margin:0;padding:6px 10px 5px;font:600 .7rem system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--sub,#6c7075);cursor:pointer}
.rp-gl:hover,.rp-open>.rp-gl{color:var(--ink,#17181c)}
.rp-here>.rp-gl{color:var(--ink,#17181c);border-bottom-color:var(--ink,#17181c)}
.rp-gl:focus-visible{outline:2px solid var(--accent,#b8501e);outline-offset:2px}
.rp-chev{opacity:.6;transition:transform .15s ease}
.rp-open .rp-chev{transform:rotate(180deg);opacity:1}
.rp-menu{display:none;position:absolute;top:calc(100% + 8px);left:0;z-index:80;min-width:200px;padding:6px 0;background:var(--paper,#f2f0ea);border:1px solid var(--ink,#17181c);box-shadow:0 10px 28px rgba(0,0,0,.14)}
.rp-open>.rp-menu{display:block}
.rp-flip>.rp-menu{left:auto;right:0}
.rp-menu a{display:block;padding:9px 16px;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--sub,#6c7075);text-decoration:none;white-space:nowrap;border-left:2px solid transparent}
.rp-menu a:hover,.rp-menu a:focus-visible{color:var(--ink,#17181c);background:color-mix(in srgb,var(--ink,#17181c) 6%,transparent);outline:none}
.rp-menu a[aria-current="page"]{color:var(--ink,#17181c);border-left-color:var(--ink,#17181c)}
@media (prefers-reduced-motion:reduce){.rp-chev{transition:none}}
.rp-end{display:flex;align-items:flex-end;padding-bottom:1px}
.rp-theme{display:inline-flex;border:1px solid var(--line,#d7d3c9);border-radius:999px;overflow:hidden;align-self:center}
.rp-theme button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;padding:0;background:none;color:var(--sub,#6c7075);border:0;cursor:pointer}
.rp-theme button[aria-pressed="true"]{background:var(--ink,#17181c);color:var(--paper,#f2f0ea)}
.rp-theme button:focus-visible{outline:2px solid var(--accent,#b8501e);outline-offset:2px}
@media (max-width:640px){.rp-in{padding:14px 18px 10px}.rp-mast nav{margin-left:-6px;gap:0}.rp-gl{padding:6px 6px 5px;gap:5px;letter-spacing:.08em;font-size:.66rem}}
`;
}
