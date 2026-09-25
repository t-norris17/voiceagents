// The guided tour. One engine for every page of the portal; each page registers its own steps.
//
//   RobinTour.register({
//     id: "quality",                       // names the page; with autoStart, remembered per browser as robin-tour-seen:<id>
//     autoStart?: false,                   // true opens the welcome card once per browser; default is Help only
//     welcome: { title, body },            // the first card, centred, with Start and Skip
//     steps: [{ target, title, body, placement?, before?, after? }, ...],
//     done: { title, body },               // the last card
//     onStart?, onStop?,                   // page-level hooks, e.g. switch a view and put it back
//   });
//
// target: a CSS selector or a function returning an element. before/after: optional functions
// (may return a promise) run when the step opens and when it is left, so a step can open a drawer
// or switch a view and put it back. The engine dims the page, cuts a spotlight around the target,
// scrolls it into view and floats a card beside it: Back, Next, a step count and Skip. Escape
// closes; the arrow keys move. On a narrow screen the card docks to the bottom.
//
// The tour opens only when the viewer clicks Help, which the engine adds to the page's footer.
// (A page can pass autoStart: true to open the welcome card the first time a browser sees it; the
// portal has no user accounts, so that memory is per browser, and Quality does not use it.) Every
// colour comes from the page's own tokens, so the tour follows Light / Dark.
(function () {
  if (window.RobinTour) return;

  const KEY = (id) => `robin-tour-seen:${id}`;
  const CSS = `
  .rt-shade{position:fixed;inset:0;z-index:80;background:transparent}
  .rt-spot{position:fixed;z-index:81;border-radius:6px;pointer-events:none;
    box-shadow:0 0 0 9999px color-mix(in srgb, var(--ink,#17181c) 58%, transparent), 0 0 0 2px var(--accent,#b8501e);
    transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease}
  .rt-spot.rt-none{box-shadow:0 0 0 9999px color-mix(in srgb, var(--ink,#17181c) 58%, transparent)}
  .rt-card{position:fixed;z-index:82;width:min(360px,calc(100vw - 32px));background:var(--paper,#f2f0ea);color:var(--ink,#17181c);
    border:2px solid var(--ink,#17181c);border-radius:6px;padding:16px 18px 14px;box-shadow:0 14px 40px rgba(0,0,0,.28);
    font-family:var(--sans,"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif);line-height:1.5}
  .rt-card.rt-centre{left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px))}
  .rt-k{font-size:.62rem;text-transform:uppercase;letter-spacing:.18em;color:var(--sub,#6c7075);font-weight:600}
  .rt-t{font-size:1.05rem;font-weight:800;letter-spacing:-.01em;margin:4px 0 6px}
  .rt-b{font-size:.88rem;color:var(--ink,#17181c)}
  .rt-b p{margin:0 0 8px}.rt-b p:last-child{margin:0}
  .rt-b b{font-weight:700}
  .rt-f{display:flex;align-items:center;gap:10px;margin-top:14px}
  .rt-f .rt-skip{margin-right:auto;font:inherit;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:var(--sub,#6c7075);background:none;border:0;padding:0;cursor:pointer;border-bottom:1px solid var(--line,#d7d3c9)}
  .rt-f .rt-skip:hover{color:var(--ink,#17181c)}
  .rt-btn{font:inherit;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;padding:8px 14px;cursor:pointer;border-radius:3px;
    background:var(--ink,#17181c);color:var(--paper,#f2f0ea);border:1px solid var(--ink,#17181c)}
  .rt-btn.rt-sec{background:none;color:var(--ink,#17181c);border-color:var(--line,#d7d3c9)}
  .rt-btn:focus-visible,.rt-skip:focus-visible{outline:2px solid var(--accent,#b8501e);outline-offset:2px}
  .rt-arrow{position:absolute;width:12px;height:12px;background:var(--paper,#f2f0ea);border:2px solid var(--ink,#17181c);transform:rotate(45deg)}
  .rt-arrow.rt-l{left:-8px;border-right:0;border-top:0}
  .rt-arrow.rt-r{right:-8px;border-left:0;border-bottom:0}
  .rt-arrow.rt-t{top:-8px;border-bottom:0;border-right:0}
  .rt-arrow.rt-bt{bottom:-8px;border-top:0;border-left:0}
  .rt-help{font:inherit;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--ink,#17181c);background:none;border:0;padding:0;cursor:pointer;border-bottom:1px solid var(--line,#d7d3c9)}
  .rt-help:hover{border-bottom-color:var(--ink,#17181c)}
  @media (max-width:720px){
    .rt-card:not(.rt-centre){left:12px!important;right:12px!important;top:auto!important;bottom:12px!important;width:auto;transform:none}
    .rt-arrow{display:none}
  }
  @media (prefers-reduced-motion:reduce){.rt-spot{transition:none}}
  body.rt-on{overflow-x:hidden}`;

  let cfg = null, i = -1, els = null, lastFocus = null, raf = 0;

  function ensureStyle() {
    if (document.getElementById("rt-style")) return;
    const s = document.createElement("style"); s.id = "rt-style"; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function resolve(target) {
    try { return typeof target === "function" ? target() : (target ? document.querySelector(target) : null); } catch { return null; }
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function mount() {
    ensureStyle();
    els = {
      shade: el(`<div class="rt-shade"></div>`),
      spot: el(`<div class="rt-spot rt-none"></div>`),
      card: el(`<div class="rt-card" role="dialog" aria-modal="true" aria-labelledby="rt-title"></div>`),
    };
    document.body.append(els.shade, els.spot, els.card);
    document.body.classList.add("rt-on");
    els.shade.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true);
  }
  function unmount() {
    if (!els) return;
    for (const k in els) els[k].remove();
    els = null; document.body.classList.remove("rt-on");
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch {} }
  }
  function onKey(e) {
    if (!els) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stop(); }
    else if (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest("button, a, input"))) { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    else if (e.key === "Tab") {
      // keep focus inside the card
      const f = els.card.querySelectorAll("button"); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); }

  // Where the card and the spotlight go for the current step.
  let current = null; // { target, placement }
  function place() {
    if (!els || !current) return;
    const t = current.target;
    if (!t) { els.spot.className = "rt-spot rt-none"; els.spot.style.cssText = "top:50%;left:50%;width:0;height:0"; els.card.classList.add("rt-centre"); els.card.style.cssText = ""; return; }
    els.card.classList.remove("rt-centre");
    const r = t.getBoundingClientRect(), pad = 8;
    els.spot.className = "rt-spot";
    Object.assign(els.spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const vw = window.innerWidth, vh = window.innerHeight, gap = 18;
    const cw = Math.min(360, vw - 32), ch = els.card.offsetHeight || 220;
    const fits = { right: r.right + gap + cw <= vw - 12, left: r.left - gap - cw >= 12, bottom: r.bottom + gap + ch <= vh - 12, top: r.top - gap - ch >= 12 };
    const order = [current.placement, "right", "left", "bottom", "top"].filter(Boolean);
    let p = order.find((k) => fits[k]) || "bottom";
    let top, left;
    if (p === "right") { left = r.right + gap; top = r.top + r.height / 2 - ch / 2; }
    else if (p === "left") { left = r.left - gap - cw; top = r.top + r.height / 2 - ch / 2; }
    else if (p === "bottom") { left = r.left + r.width / 2 - cw / 2; top = r.bottom + gap; }
    else { left = r.left + r.width / 2 - cw / 2; top = r.top - gap - ch; }
    left = Math.max(12, Math.min(left, vw - cw - 12)); top = Math.max(12, Math.min(top, vh - ch - 12));
    els.card.style.cssText = `left:${left}px;top:${top}px;width:${cw}px`;
    const a = els.card.querySelector(".rt-arrow");
    if (a) {
      a.className = "rt-arrow " + ({ right: "rt-l", left: "rt-r", bottom: "rt-t", top: "rt-bt" }[p]);
      if (p === "right" || p === "left") a.style.cssText = `top:${Math.max(14, Math.min(r.top + r.height / 2 - top - 6, ch - 22))}px`;
      else a.style.cssText = `left:${Math.max(14, Math.min(r.left + r.width / 2 - left - 6, cw - 22))}px`;
    }
  }

  function render(step, kind) {
    const n = cfg.steps.length;
    const count = kind === "step" ? `<div class="rt-k">Step ${i + 1} of ${n}</div>` : `<div class="rt-k">${kind === "welcome" ? "Guided tour" : "That's the tour"}</div>`;
    const body = Array.isArray(step.body) ? step.body.map((p) => `<p>${p}</p>`).join("") : `<p>${step.body || ""}</p>`;
    const buttons = kind === "welcome"
      ? `<button type="button" class="rt-skip" data-rt="stop">Skip</button><button type="button" class="rt-btn" data-rt="next">Start</button>`
      : kind === "done"
      ? `<button type="button" class="rt-btn" data-rt="stop">Done</button>`
      : `<button type="button" class="rt-skip" data-rt="stop">Skip tour</button>${i > 0 ? `<button type="button" class="rt-btn rt-sec" data-rt="back">Back</button>` : ""}<button type="button" class="rt-btn" data-rt="next">${i === n - 1 ? "Finish" : "Next"}</button>`;
    els.card.innerHTML = `${kind === "step" ? `<span class="rt-arrow"></span>` : ""}${count}<div class="rt-t" id="rt-title">${esc(step.title)}</div><div class="rt-b">${body}</div><div class="rt-f">${buttons}</div>`;
    els.card.querySelectorAll("[data-rt]").forEach((b) => b.addEventListener("click", () => ({ next, back, stop })[b.dataset.rt]()));
    const primary = els.card.querySelector(".rt-btn:not(.rt-sec)"); if (primary) primary.focus();
  }

  async function leave() {
    if (i >= 0 && i < cfg.steps.length && cfg.steps[i].after) { try { await cfg.steps[i].after(); } catch {} }
  }
  async function show(idx) {
    if (!els) return;
    if (idx < 0) { i = -1; current = { target: null }; render(cfg.welcome, "welcome"); place(); return; }
    if (idx >= cfg.steps.length) { i = cfg.steps.length; current = { target: null }; render(cfg.done || { title: "Done", body: "" }, "done"); place(); return; }
    i = idx;
    const step = cfg.steps[i];
    if (step.before) { try { await step.before(); } catch {} }
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    let t = resolve(step.target);
    if (t) { t.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); await new Promise((r) => requestAnimationFrame(r)); }
    current = { target: t, placement: step.placement };
    render(step, "step"); place(); place(); // twice: the card's height is known only after the first render
  }
  async function next() { if (!els) return; if (i >= cfg.steps.length) return stop(); await leave(); show(i + 1); }
  async function back() { if (!els || i <= 0) return; await leave(); show(i - 1); }
  async function stop() {
    if (!els) return;
    await leave();
    try { localStorage.setItem(KEY(cfg.id), "1"); } catch {}
    unmount(); i = -1; current = null;
    if (cfg.onStop) { try { cfg.onStop(); } catch {} }
  }
  function start() {
    if (!cfg) return;
    if (els) unmount();
    lastFocus = document.activeElement;
    if (cfg.onStart) { try { cfg.onStart(); } catch {} }
    mount(); show(-1);
    try { localStorage.setItem(KEY(cfg.id), "1"); } catch {}
  }

  function addHelp() {
    ensureStyle();   // the Help link wears the engine's styles before any tour has opened
    if (document.querySelector(".rt-help")) return;
    const b = el(`<button type="button" class="rt-help" aria-label="Start the guided tour of this page">Help</button>`);
    b.addEventListener("click", start);
    const foot = document.querySelector("footer");
    if (foot) foot.appendChild(b);
    else { b.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:70;background:var(--paper,#f2f0ea);padding:6px 10px"; document.body.appendChild(b); }
  }

  // The tour never opens on its own unless a page asks for it (autoStart: true), and even then
  // only the first time a browser sees the page. Tanner, 2026-09-25: the portal has one shared
  // password and no user accounts, so "seen" can only ever be per browser; a new browser or a
  // private window would have re-opened it. Help is the one way in.
  function register(config) {
    cfg = config;
    addHelp();
    if (!config.autoStart) return;
    let seen = true;
    try { seen = !!localStorage.getItem(KEY(cfg.id)); } catch {}
    if (!seen) setTimeout(start, config.delay ?? 600);
  }

  window.RobinTour = { register, start, stop, next, back };
})();
