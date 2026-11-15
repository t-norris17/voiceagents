# Lunar Notes: design handoff

**What this is.** The complete design system behind Birdnest (Robin's portal): paper, ink, burnt orange. Hand this file to any Claude session that is designing or building something that should look like Birdnest. It is self-contained: the CSS below is copied verbatim from the live code, so you can paste it and build without access to the repository.

- **Live reference page:** https://claude.ai/artifact/JvvEUKh5rbvQ9s7tbvfA2m (tokens, type, 12 components with previews, the logo and loader art). Private to Tanner; share it if the other session needs it.
- **Source of truth:** `t-norris17/voiceagents` at `main@d312be0`, `projects/robin-portal/app/app/globals.css`. If the code and this file ever disagree, the code wins.

**Rules for the session receiving this:**
1. Use the tokens by name (`var(--paper)`, `var(--accent)`), never raw hex in components.
2. Burnt orange is `--accent` in the code. One use per view.
3. Every new colour needs a light and a dark value, and must pass 4.5:1 for text on `--paper`.
4. No cards, no shadows (two exceptions below), no rounded corners, no icon libraries, no emoji.
5. If something isn't covered here, follow the nearest existing component rather than inventing a pattern, and say that you did.
6. Only colours and the two font stacks are CSS variables in the code (`--paper`, `--ink`, `--accent`, `--sub`, `--faint`, `--line`, `--hair`, `--ok`, `--warn`, `--bad`, `--sans`, `--mono`). The spacing, radius, layout and type-style names below (`space-gutter`, `page-title`, …) name values the code writes literally; use the values, not `var()` of those names.

Paper, ink, burnt orange. The design system Birdnest is built in: a printed-page look for an operations tool, where content lies on paper, rules do the dividing, and one warm colour points at the thing that matters.

## The three colours

| Name | Token | Light | Dark | Job |
|---|---|---|---|---|
| **Paper** | `paper` | `#f2f0ea` | `#15161a` | The ground. Every page, drawer and menu. |
| **Ink** | `ink` | `#17181c` | `#ecebe6` | Text, the 2px rules, outlines, primary buttons. |
| **Burnt orange** | `--accent` (called `burnt-orange` on the reference page) | `#b8501e` | `#e08a4a` | The one thing to look at: a deadline, a playhead, a gauge level, the spoken line, a focus ring. |

Everything else is support: two greys for secondary text (`sub`, `faint`), two rules (`line` for quiet borders, `hair` for row dividers and the one fill tint), and three status colours (`ok`, `warn`, `bad`) that only ever appear small, as a dot or a word. In the code burnt orange exists only as `--accent`; write `var(--accent)`, never `var(--burnt-orange)`.

## Principles

1. **Paper, not cards.** Content sits on the page. There are no white cards, no panels with shadows, no rounded containers. Groups are made with space and rules.
2. **Rules do the dividing.** A 2px `ink` rule marks a major edge (under the masthead, under a drawer header, the drawer's left edge). A 1px `ink` rule opens a block (above the stat row). A 1px `hair` rule separates rows. That hierarchy is the system's structure; respect it before adding anything.
3. **One burnt orange per view.** If two things are orange, neither is. It is reserved for what the reader must act on or is looking at right now.
4. **Status is a dot.** A 7px dot in `ok`, `warn` or `bad`, or a hollow `faint` ring for "nothing yet". Rows, titles and backgrounds never change colour to show state.
5. **Square.** `radius-none` everywhere. Pills exist for exactly three things (chips, the theme switch, the home pill); circles only for dots.
6. **Labels are mono and uppercase; content is not.** Kickers, stat labels, filters, tags, timestamps: monospace, small, tracked out. Everything a person reads for meaning is sans in sentence case.
7. **Numbers bare.** Big tabular figures with a small label under them. No boxes, icons or sparklines around a number.

## Voice

Birdnest speaks in plain sentences to people who are busy. Say what something is for, what happened, and what to do, with the real numbers. Write "Couldn't play the recording: the link expired. The transcript is unaffected.", not "Error 400". Name things by what they mean to the reader ("Call back by"), not by the system ("SLA due_at"). Buttons say the action ("Close request", "Save note"). No exclamation marks, no emoji, no "Oops". When something is machine-written (an ElevenLabs summary), the label says so. When something is logged ("this listen is logged"), say so.

## Type

Three stacks, no web fonts: Helvetica Neue for everything people read (`sans`), the platform monospace for labels and figures (`mono`), and the system UI face in the masthead only (`system`, see Known drift). Sizes are in rem off a 16px root.

- **Display:** `page-title` 2.1rem/700, `home-title` up to 2.6rem/800, `stat-number` 2.3rem/700, `door-title` 1.25rem/800. Negative tracking (-.01 to -.025em) on everything above 1.2rem.
- **Text:** `lede` 1rem in `sub` (58ch max), `row-title` 1rem/600, `body` .88rem/1.55 for transcripts and drawer text, `drawer-title` .95rem/800 uppercase.
- **Labels:** `kicker` .66rem mono 600 +.16em, `stat-label` .62rem, `filter` .66rem, `meta` .72rem mono, `tag` .6rem; sans `label` .66rem +.18em and `button` .72rem +.12em. All label styles are uppercase except `meta`.
- Figures that line up (stats, phone numbers, times) use `font-variant-numeric: tabular-nums`.

## Layout and spacing

- The page is a single centred column, `sheet-max` 1120px, with `space-gutter` (36px) sides, `space-gutter-sm` (18px) under 640px. No sidebars.
- Lists are full-width rows (`space-row` 13px top and bottom). The stat row spaces numbers `space-stat` (56px) apart.
- Detail opens in a right-hand drawer, `drawer-max` 640px, never a centred modal.
- There is no formal spacing scale in the code; the spacing tokens are the values the code actually repeats. Prefer them over new numbers.

## Elevation and motion

- Flat. Two shadows exist, each for one thing: `shadow-menu` (masthead dropdowns) and `shadow-pill` (the floating home pill). The drawer is lifted by its scrim and its 2px ink edge, not a shadow.
- Motion is small and purposeful: .12–.15s colour swaps on hover, a .7s fill on gauges, the nest loader's bob. Every animation stops or slows under `prefers-reduced-motion`.
- Hover inverts: a door, a button or the home pill swaps ink and paper. Links and row titles get an underline in `line`.

## Dark mode

Same system, inverted ground. Paper becomes `#15161a`, ink `#ecebe6`, burnt orange lifts to `#e08a4a` so it keeps its weight. The viewer's OS setting decides unless they choose in the masthead switch; the choice is stored in `localStorage` key `robin-theme` and applied before first paint (`data-theme` on `<html>`), so dark never flashes light. Every token has both values; never hard-code a colour.

## Accessibility

Focus is always a 2px burnt orange outline with a 2–3px offset. Contrast of text tokens on paper, measured:

| Token | Light | Dark | Verdict |
|---|---|---|---|
| ink | 15.57:1 | 15.15:1 | pass |
| sub | 4.37:1 | 6.72:1 | **light just under 4.5:1**: fine for labels and 1rem ledes; don't use for long small text |
| burnt orange | 4.38:1 | 6.80:1 | **light under 4.5:1 for small text**: use at 1rem bold or larger (deadlines, the playhead time) |
| faint | 2.34:1 | 3.53:1 | **fails**: decorative and redundant only (timestamps beside information shown elsewhere, the footer, the hollow dot) |
| ok / warn / bad | 6.58 / 4.95 / 6.58 | 8.92 / 9.46 / 8.60 | pass |

These are the values Birdnest ships; they are flagged here, not changed. The fix, when someone takes it on, is to darken `sub` and `faint` in light mode a step, not to change burnt orange.

## Iconography and imagery

Almost none, on purpose. The nest logo (`assets/Logos/`) beside the wordmark is the only brand image; the nest loader's art (`assets/Loader/`) is the only illustration. Interface icons are a handful of inline SVGs drawn at 1.5px stroke in `currentColor` (sun, moon, chevron, play, pause), 12–16px. No icon library, no emoji, no photos, no illustrations of people.

## Components

Masthead, PageHeader, ListRow, Drawer, CallPlayer, DeadlineBlock, Note, Button, Door, Gauge, NestLoader, HomePill. Their CSS is below, copied from the code with the code's class names, so markup built from it drops into Birdnest unchanged; the reference page shows each one rendered.

## Do and don't

- Do put content on paper and divide it with `hair` rules. Don't wrap it in cards.
- Do use burnt orange for the one thing that needs action. Don't use it for headings, links or decoration.
- Do show state with a dot. Don't tint rows, titles or backgrounds.
- Do keep corners square. Don't round buttons, drawers or menus.
- Do write labels in mono uppercase and content in sentence case. Don't uppercase sentences.
- Do say what's machine-written and what's logged. Don't dress a guess up as a fact.

## Known drift in the code

- The masthead uses `system` (system-ui) while every other surface uses Helvetica Neue.
- The home page's live dot is a hard-coded `#2f8f5b` (`live` token), not `ok`.
- The drawer scrim is `color-mix(ink 42%)`, which a token cannot express.
- `faint` and light-mode `sub` contrast, above.

---

## Paste-ready CSS

### 1. Tokens (light, dark, and the manual switch)

```css
:root {
  --paper: #f2f0ea; --ink: #17181c; --sub: #6c7075; --faint: #a29e95;
  --line: #d7d3c9; --hair: #e4e1d8; --accent: #b8501e;
  --ok: #3f5c39; --warn: #8a5f12; --bad: #9a2f1e;
  --sans: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
/* The viewer's setting decides unless they chose: data-theme on <html> is set before paint from
   localStorage "robin-theme" (see layout.js) and by the Light / Dark control in the masthead. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --paper: #15161a; --ink: #ecebe6; --sub: #9a9ea4; --faint: #6a6e74; --line: #2b2d33; --hair: #212329; --accent: #e08a4a; --ok: #9cc091; --warn: #d6b878; --bad: #e0a596; color-scheme: dark; }
}
:root[data-theme="dark"] { --paper: #15161a; --ink: #ecebe6; --sub: #9a9ea4; --faint: #6a6e74; --line: #2b2d33; --hair: #212329; --accent: #e08a4a; --ok: #9cc091; --warn: #d6b878; --bad: #e0a596; color-scheme: dark; }
```

The switch: store `"light"` or `"dark"` in `localStorage["robin-theme"]`; before first paint set `document.documentElement.dataset.theme` to it; absent means follow the OS. Buttons carry `data-theme-set="light|dark"` and `aria-pressed`.

### 2. Base

```css
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); line-height: 1.5; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.sheet { max-width: 1120px; margin: 0 auto; padding: 30px 36px 64px; }
.tnum { font-variant-numeric: tabular-nums; }
.lbl { font-size: .66rem; text-transform: uppercase; letter-spacing: .18em; color: var(--sub); font-weight: 600; }
```

### 3. Page header, stats, filters

```css
.kicker { font: 600 .66rem var(--mono); letter-spacing: .16em; text-transform: uppercase; color: var(--sub); margin-top: 6px; }
.page-h { margin-top: 4px; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.page-h h1 { font-size: 2.1rem; line-height: 1.15; font-weight: 700; letter-spacing: -.01em; margin: 6px 0 8px; }
.page-h p { margin: 0; color: var(--sub); font-size: 1rem; max-width: 58ch; }
.stat-row { display: flex; gap: 56px; flex-wrap: wrap; margin: 30px 0 8px; padding: 18px 0; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--hair); }
.stat .n { font-size: 2.3rem; font-weight: 700; letter-spacing: -.02em; line-height: 1; font-variant-numeric: tabular-nums; }
.stat .k { font: 600 .62rem var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--sub); margin-top: 6px; }
.filters { display: flex; gap: 22px; flex-wrap: wrap; margin: 18px 0 4px; }
.filters button { background: none; border: 0; border-bottom: 1px solid transparent; padding: 0; font: 600 .66rem var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--faint); cursor: pointer; }
.filters button:hover { color: var(--ink); }
.filters button.on { color: var(--ink); border-bottom-color: var(--ink); }
.stat .n.rq-bad { color: var(--bad); }
```

### 4. Buttons

```css
.btn { font: 600 .72rem var(--sans); letter-spacing: .12em; text-transform: uppercase; padding: 11px 18px; background: var(--ink); color: var(--paper); border: 1px solid var(--ink); cursor: pointer; }
.btn:hover:not(:disabled) { background: var(--paper); color: var(--ink); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.sec { background: none; color: var(--ink); }
.btn.sec:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
.btn.sm { padding: 6px 11px; font-size: .62rem; letter-spacing: .1em; }
```

### 5. List rows, status dots, tags, notes

```css
.list { margin-top: 0; }
.row { display: grid; grid-template-columns: 14px 1fr auto; gap: 3px 10px; padding: 13px 0; border-bottom: 1px solid var(--hair); align-items: baseline; cursor: pointer; }
.row:hover .main .t { text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
.row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.row .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; transform: translateY(-1px); }
.d-ok { background: var(--ok); }
.d-none { background: none; border: 1.5px solid var(--faint); }
.row .main { font-weight: 600; font-size: 1rem; }
.row .sub { font: .72rem var(--mono); color: var(--faint); margin-top: 3px; font-weight: 400; }
.row .meta { font: .7rem var(--mono); color: var(--sub); white-space: nowrap; text-align: right; }
.tag { font: 600 .6rem var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--sub); margin-left: 10px; border: 1px solid var(--line); padding: 1px 6px; vertical-align: 2px; }
.tag.bad { color: var(--bad); border-color: var(--bad); }
.empty { color: var(--faint); font-size: .9rem; padding: 18px 0; }
.banner { font-size: .8rem; color: var(--sub); border-left: 2px solid var(--warn); padding: 2px 0 2px 12px; margin: 16px 0; }
```

### 6. Drawer, transcript, summary

```css
.drw { position: fixed; inset: 0; background: color-mix(in srgb, var(--ink) 42%, transparent); display: flex; justify-content: flex-end; z-index: 50; }
.drw-p { background: var(--paper); width: min(640px, 100%); height: 100%; overflow-y: auto; padding: 0 clamp(18px, 4vw, 32px) 44px; border-left: 2px solid var(--ink); }
.drw-h { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 24px 0 12px; border-bottom: 2px solid var(--ink); position: sticky; top: 0; z-index: 2; background: var(--paper); }
.drw-h .t { font-size: .95rem; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; }
.drw-x { font: inherit; font-size: .66rem; letter-spacing: .12em; text-transform: uppercase; background: none; border: 0; color: var(--sub); cursor: pointer; padding: 4px; }
.drw-meta { font-size: .74rem; color: var(--sub); margin-top: 12px; line-height: 1.7; }
.drw-meta b { color: var(--ink); font-weight: 600; }
.turn { padding: 10px 0; border-bottom: 1px solid var(--hair); }
.turn .who { font-size: .6rem; text-transform: uppercase; letter-spacing: .16em; font-weight: 700; color: var(--faint); }
.turn .said { font-size: .88rem; line-height: 1.55; margin-top: 3px; }
.turn.caller .said { font-weight: 600; }
.section { margin-top: 22px; }
.sum { margin-top: 14px; padding: 12px 14px; background: var(--hair); }
.sum .h { font-size: .66rem; text-transform: uppercase; letter-spacing: .18em; color: var(--sub); font-weight: 600; }
.sum .t { font-weight: 700; margin-top: 4px; }
.sum p { margin: 6px 0 0; font-size: .86rem; line-height: 1.5; white-space: pre-line; }
.drw-a { margin-left: auto; margin-right: 10px; display: inline-flex; align-items: center; }
.drw-stick { position: sticky; top: 0; z-index: 2; background: var(--paper); }
.drw-stick .drw-h { position: static; }
```

### 7. Callback deadline block

```css
.rq-due { margin-top: 16px; padding: 12px 16px; border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.rq-due .row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.rq-due .said { margin-top: 4px; font-size: .88rem; line-height: 1.45; color: var(--ink); }
.rq-due .k { font: 600 .66rem var(--mono); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
.rq-due .t { font-size: 1.45rem; font-weight: 800; letter-spacing: -.01em; color: var(--accent); }
.rq-due.late { border-left-color: var(--bad); background: color-mix(in srgb, var(--bad) 9%, transparent); }
.rq-due.late .k, .rq-due.late .t { color: var(--bad); }
.rq-due.met { border-left-color: var(--line); background: var(--hair); }
.rq-due.met .k, .rq-due.met .t { color: var(--sub); }
```

### 8. Call player and timed transcript lines

```css
.pl { padding: 14px 0 10px; border-bottom: 1px solid var(--ink); }
.pl-row { display: flex; align-items: center; gap: 12px; }
.pl-btn { flex: none; width: 40px; height: 40px; display: grid; place-items: center; background: var(--ink); color: var(--paper); border: 0; cursor: pointer; }
.pl-btn svg { width: 16px; height: 16px; fill: currentColor; }
.pl-btn:disabled { opacity: .5; cursor: progress; }
.pl-t { flex: none; min-width: 38px; font: 600 .78rem var(--mono); font-variant-numeric: tabular-nums; }
.pl-t.end { color: var(--sub); font-weight: 400; text-align: right; }
.pl-bar { flex: 1; min-width: 0; position: relative; padding: 8px 0 2px; cursor: pointer; touch-action: none; }
.pl-track { position: relative; height: 10px; border: 1.5px solid var(--ink); }
.pl-fill { position: absolute; inset: 0 auto 0 0; background: var(--accent); }
.pl-head { position: absolute; top: -6px; bottom: -6px; width: 2px; margin-left: -1px; background: var(--ink); }
.pl-ticks { position: relative; height: 7px; margin-top: 3px; }
.pl-ticks i { position: absolute; top: 0; width: 1px; height: 5px; background: var(--line); }
.pl-ticks i.caller { height: 7px; background: var(--ink); }
.pl-speed { flex: none; font: 600 .7rem var(--mono); color: var(--ink); background: none; border: 1px solid var(--line); padding: 6px 8px; cursor: pointer; }
.pl-btn:focus-visible, .pl-bar:focus-visible, .pl-speed:focus-visible, .pl-follow:focus-visible, .turn .at:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.pl-note { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font: .66rem/1.5 var(--mono); color: var(--faint); }
.pl-note b { color: var(--sub); font-weight: 600; }
.pl-note.bad { color: var(--bad); }
.pl-follow { font: inherit; color: var(--faint); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
.pl-follow.on { color: var(--ink); text-decoration: underline; }
.pl-load { margin-top: 6px; min-height: 38px; display: flex; align-items: center; }
.pl-load .nest-loader { flex-direction: row; gap: 10px; color: var(--sub); }
.pl-load .nest-shadow { display: none; }
.turn.timed { display: grid; grid-template-columns: 52px 1fr; column-gap: 12px; margin: 0 -12px; padding: 10px 12px; }
.turn.timed .who, .turn.timed .said { grid-column: 2; }
.turn .at { grid-column: 1; grid-row: 1 / span 2; align-self: start; font: .68rem var(--mono); font-variant-numeric: tabular-nums; color: var(--faint); background: none; border: 0; padding: 1px 0; text-align: left; cursor: pointer; }
.turn.seekable { cursor: pointer; }
.turn.seekable:hover .at { color: var(--ink); }
.turn.now { background: color-mix(in srgb, var(--accent) 9%, transparent); box-shadow: inset 3px 0 0 var(--accent); }
.turn.now .at { color: var(--accent); font-weight: 700; }
```

### 9. Doors (home tiles)

```css
.doors { margin-top: 44px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.door { display: flex; flex-direction: column; gap: 10px; min-height: 168px; padding: 18px 18px 16px; border: 1px solid var(--ink); text-decoration: none; color: var(--ink); background: var(--paper); transition: background .12s, color .12s; }
.door:hover { background: var(--ink); color: var(--paper); }
.door:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.door .t { font-size: 1.25rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
.door .d { font-size: .82rem; color: var(--sub); flex: 1; }
.door:hover .d { color: inherit; opacity: .8; }
.door .n { font-size: 1.8rem; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
.door .n .un { font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; margin-left: 6px; opacity: .7; }
.door.full { grid-column: 1 / -1; min-height: 0; }
```

### 10. Gauges

```css
.strip .cov { width: 120px; height: 8px; border: 1px solid var(--ink); position: relative; display: inline-block; }
.strip .cov i { position: absolute; inset: 0 auto 0 0; background: var(--accent); }
.tube { width: 92px; height: 420px; border: 2px solid var(--ink); position: relative; flex: none; }
.tube .fill { position: absolute; left: 0; right: 0; bottom: 0; background: var(--accent); }
.tube .lvl { position: absolute; left: -2px; right: -2px; border-top: 2px solid var(--ink); }
.u-doc .bar { height: 8px; border: 1px solid var(--ink); position: relative; }
.u-doc .bar i { position: absolute; inset: 0 auto 0 0; background: var(--accent); }
```

### 11. Responsive and reduced motion

```css
@media (max-width: 640px) { .sheet { padding: 24px 18px 56px; } }
@media (max-width: 720px) { .about { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .doors { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .doors { grid-template-columns: 1fr; } }
@media print { #rp-home { display: none; } }
@media (max-width: 900px) { .u-main { grid-template-columns: 1fr; gap: 36px; } }
@media (max-width: 640px) { .u-topic > summary { grid-template-columns: 1fr auto; } .u-topic .w { grid-column: 1 / -1; } .u-body { padding-left: 0; } }
@media (max-width: 760px) { .ab-cols { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .rq-row { grid-template-columns: 14px 1fr; } .rq-row .rq-meta { grid-column: 2; text-align: left; margin-top: 6px; } .rq-ev { grid-template-columns: 1fr; gap: 2px; } }
@media (prefers-reduced-motion: no-preference) { .tube .fill { transition: height .7s cubic-bezier(.2,.7,.2,1); } .tube .lvl { transition: bottom .7s cubic-bezier(.2,.7,.2,1); } }
```

The masthead (`lib/mast.js`), the nest loader (`public/loader/loader.css`, `lib/loader.js`) and the home pill (`#rp-home` in globals.css) are in the repo and on the reference page; they depend on the logo and loader images, which live at `projects/robin-portal/app/public/brand/` and `public/loader/`.

## Markup patterns

```html
<!-- Page header -->
<div class="kicker">Intake</div>
<div class="page-h"><div><h1>Requests</h1><p>One sentence on what this page is for.</p></div></div>
<div class="stat-row">
  <div class="stat"><div class="n">4</div><div class="k">Open</div></div>
  <div class="stat"><div class="n rq-bad">1</div><div class="k">Overdue</div></div>
</div>
<div class="filters"><button class="on">Open</button><button>Done</button><button>All</button></div>

<!-- A list row: dot, title + tag, mono sub-line, meta -->
<div class="row">
  <i class="dot d-ok"></i>
  <div><div class="main"><span class="t">Loan question, callback filed</span><span class="tag">Phone</span></div>
       <div class="sub">Sat Oct 3, 9:42 PM · 3 min</div></div>
  <div class="meta">callback requested</div>
</div>

<!-- Drawer -->
<div class="drw"><div class="drw-p" role="dialog" aria-modal="true">
  <div class="drw-h"><span class="t">Dana Whitfield</span><button class="drw-x">Close ×</button></div>
  <div class="drw-meta"><b>Loan</b> · filed by Robin during the call</div>
  <div class="section"><div class="lbl">What they need</div><p>…</p></div>
</div></div>

<!-- Deadline (add .late or .met) -->
<div class="rq-due"><div class="row"><span class="k">Call back by</span><span class="t">Mon 4:00 PM</span></div>
  <div class="said">Robin told them “by Monday, October 5 at 4 PM Central”</div></div>
```
