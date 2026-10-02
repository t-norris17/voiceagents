// What the Accuracy page says about grading. Pure, so it is unit-tested: the words around a paid action
// (what a click will do, how many it covers, what happened) are the part that has to be right.

export const PAGE = 40;       // rows fetched per page
export const RUN_MAX = 10;    // the broker's cap per grading run (lib/grade-run.js MAX_PER_RUN)

// What grading costs. An ESTIMATE, from the bill so far: $0.77 over about 29 interactions, so about 2.7 cents each,
// rounded up to 3. It is not measured per interaction (a long one costs more), which is why every use says "about".
// Each run also reports the tokens it actually used (see usageText), so the figure can be checked against the
// provider's console and corrected here, in one place.
export const EST_CENTS = 3;

export function costText(n) {
  const cents = Math.max(0, Math.round(Number(n) || 0)) * EST_CENTS;
  return cents < 100 ? `about ${cents} ${cents === 1 ? "cent" : "cents"}` : `about $${(cents / 100).toFixed(2)}`;
}

// The filter tabs, with whole-table counts from /api/calls `totals`. "No source" only appears when there
// is something in it: those are graded interactions nothing could be checked on, the re-grade candidates.
export function tabsFor(totals) {
  const t = totals || {};
  const tabs = [
    { key: "all", label: "All", count: t.total ?? null },
    { key: "ungraded", label: "Not graded", count: t.ungraded ?? null },
    { key: "graded", label: "Graded", count: t.graded ?? null },
  ];
  if ((t.graded_without_source ?? 0) > 0) tabs.push({ key: "no_source", label: "Graded, no source", count: t.graded_without_source });
  return tabs;
}

export const isFilter = (k) => ["all", "ungraded", "graded", "no_source"].includes(k);

// The label on the main button says what one click will do and how much, before it is clicked.
export function runLabel(ungraded, busy) {
  if (busy) return "Grading…";
  const n = Math.min(RUN_MAX, Number(ungraded) || 0);
  if (n === 0) return "Nothing to grade";
  return `Grade the newest ${n} not graded · ${costText(n)}`;
}

export const selectedLabel = (n) => `${n === 1 ? "Grade 1 selected" : `Grade ${n} selected`} · ${costText(n)}`;
export const oneCost = () => costText(1);

const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;

// What a run actually used, as the model reported it. Tokens, not dollars: the page does not know the price.
export function usageText(u) {
  const i = Number(u?.input_tokens) || 0, o = Number(u?.output_tokens) || 0;
  if (!i && !o) return null;
  return `used ${i.toLocaleString("en-US")} tokens in and ${o.toLocaleString("en-US")} out`;
}

// One sentence for what a run did, then what is still waiting, then anything that failed, in the open.
export function gradeSummary(g) {
  if (!g) return null;
  if (g.error) return { text: `Grading failed: ${g.error}`, failed: [] };
  const parts = [];
  if (g.note) parts.push(g.note);
  else parts.push(`Graded ${plural(g.graded ?? 0, "interaction", "interactions")}`);
  if (g.skipped > 0 && !g.note) parts.push(`${g.skipped} ${g.skipped === 1 ? "was" : "were"} already being graded by another run, so nothing was spent on ${g.skipped === 1 ? "it" : "them"}`);
  if (g.calls_without_source) parts.push(`${g.calls_without_source} could not be checked against a source`);
  if (g.ungraded_total != null) parts.push(`${g.ungraded_total} not graded now`);
  const used = usageText(g.usage);
  if (used) parts.push(used);
  const failed = (g.failed || []).map((f) => ({ id: f.conversation_id, error: f.error }));
  return { text: parts.join(", ") + ".", failed };
}

// A re-grade replaces the old grade, so the page says exactly what changed.
export function regradeSummary(g) {
  const r = g?.results?.[0]?.replaced;
  const used = usageText(g?.usage);
  if (g?.error) return `Re-grade failed: ${g.error}`;
  if (g?.failed?.length) return `Re-grade failed: ${g.failed[0].error}. The old grade was left as it was.`;
  if (!r) return g?.note || "Nothing changed.";
  const sourced = (x) => x.filter((a) => a.grounding && a.grounding !== "no_source").length;
  return `Re-graded. Before: ${plural(r.before.length, "answer", "answers")}, ${sourced(r.before)} checked against a source. Now: ${plural(r.after.length, "answer", "answers")}, ${sourced(r.after)} checked.` +
    (r.removed_score_keys.length ? ` Replaced ${plural(r.removed_score_keys.length, "old row", "old rows")}.` : "") +
    (used ? ` This ${used}.` : "");
}

// Rows that may be picked for a batch: not graded yet.
export const pickable = (c) => !c?.scored_at;

// What a grade rests on, for the small tag beside a graded row.
export function sourceTag(c) {
  if (!c?.scored_at) return null;
  if (c.source_status === "no_source") return "no source";
  if (c.source_status === "no_answers") return "no answers found";
  return null;
}
