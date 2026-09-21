// Does a one-pager actually fit on one Letter page?
//
// Usage:  node fit-check.mjs ../../../projects/robin-experiment/robin-one-pager.html
//
// The trap this exists to prevent: measuring under print media in a default browser window
// tells you nothing, because the print CONTENT width is the paper minus its margins
// (8.5in - 2 x 0.42in = 7.66in = 735px at 96dpi), not the window width. Measured at 816px the
// Robin page reported 961px against a 975px budget and still printed on two pages, because at
// the real 735px every paragraph wrapped to more lines. Measure at the paper's content width.
//
// Needs playwright-core and a Chromium. In the Claude Code web environment:
//   npm install playwright-core
//   (browser already at /opt/pw-browsers/chromium-1194/chrome-linux/chrome)
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const MARGIN_IN = 0.42;                       // must match @page margin in the document
const W = Math.round((8.5 - 2 * MARGIN_IN) * 96);
const H = Math.round((11 - 2 * MARGIN_IN) * 96);
const EXEC = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const file = resolve(process.argv[2] || 'one-pager-template.html');
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('file://' + file);
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(400);

const m = await page.evaluate(() => ({
  bottom: Math.round(document.querySelector('.sheet').getBoundingClientRect().bottom),
  blocks: [...document.querySelectorAll('.sheet > *')].map((e) => ({
    block: e.className || e.tagName, height: Math.round(e.getBoundingClientRect().height),
  })),
  columns: ['.spec', '.feat'].map((s) => ({
    block: s, height: Math.round(document.querySelector(s)?.getBoundingClientRect().height || 0),
  })),
}));

const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: {
  top: MARGIN_IN + 'in', bottom: MARGIN_IN + 'in', left: MARGIN_IN + 'in', right: MARGIN_IN + 'in' } });
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
await browser.close();

const slack = H - m.bottom;
console.log(`content ${m.bottom}px / budget ${H}px  ·  slack ${slack}px  ·  PDF pages: ${pages}`);
console.table([...m.blocks, ...m.columns]);
if (pages !== 1) {
  console.log('\nOver by roughly ' + Math.max(1, -slack) + 'px. Cut words first: one line of body');
  console.log('text is about 14px. The two body columns should end within ~15px of each other.');
}
// Fonts load from Google; if the network blocks them the page renders in its fallback stack,
// which is close but not identical in metrics. Keep 25-40px of slack so either resolves to one page.
process.exit(pages === 1 ? 0 : 1);
