// The theme switch, shared by the Next.js pages (layout.js) and the copied module pages
// (scripts/copy-modules.mjs injects the same two snippets). One localStorage key, "robin-theme",
// holding "light" or "dark"; absent means follow the viewer's system setting.
//
// PRE_PAINT runs in <head> before anything renders, so a dark choice never flashes light.
// CONTROL_JS wires every [data-theme-set] button on the page and keeps aria-pressed honest, and
// guards itself so a page that already carries the snippet does not bind it twice.

export const THEME_KEY = "robin-theme";

export const PRE_PAINT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export const CONTROL_HTML = `<div class="rp-theme" role="group" aria-label="Theme"><button type="button" data-theme-set="light" aria-pressed="false">Light</button><button type="button" data-theme-set="dark" aria-pressed="false">Dark</button></div>`;

export const CONTROL_JS = `(function(){
  if(window.__robinTheme) return; window.__robinTheme=1;
  var KEY="${THEME_KEY}", mq=matchMedia("(prefers-color-scheme: dark)");
  function effective(){ var t=document.documentElement.getAttribute("data-theme"); return (t==="light"||t==="dark")?t:(mq.matches?"dark":"light"); }
  function paint(){ var e=effective(); document.querySelectorAll("[data-theme-set]").forEach(function(b){ b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-set")===e)); }); }
  document.addEventListener("click",function(ev){
    var b=ev.target&&ev.target.closest?ev.target.closest("[data-theme-set]"):null; if(!b) return;
    var t=b.getAttribute("data-theme-set"); document.documentElement.setAttribute("data-theme",t);
    try{ localStorage.setItem(KEY,t); }catch(e){}
    paint();
  });
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",paint); else paint();
  mq.addEventListener("change",paint);
})();`;
