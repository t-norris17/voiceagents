// What the Utilization page says about the numbers /api/utilization returns. Pure, so it is unit-tested:
// the one rule that matters is that a number built from a PARTIAL set of graded interactions is a floor
// and must say so, never present itself as the whole truth.
export function gaugeView(r) {
  const total = Number(r?.total) || 0, used = Number(r?.used) || 0;
  const coverage = Math.min(1, Math.max(0, Number(r?.coverage) || 0));
  const pct = total ? Math.round((used / total) * 100) : 0;
  const complete = coverage >= 0.995;
  return {
    pct,
    lead: total && !complete ? "At least" : "",
    caption: total ? `${used} of ${total} topics used` : "No topics found",
    coveragePct: Math.round(coverage * 100),
    complete,
    note: total && !complete ? "Only graded interactions are counted, so this is a floor. It rises as more are graded." : null,
  };
}

// ElevenLabs shortens long document names with a trailing "..." and the Vertex ones all share a prefix;
// the page shows the part that tells them apart.
export const docLabel = (name) => String(name || "").replace(/(\.{3}|…)\s*$/, "").replace(/^Vertex Manufacturing 401\(k\)\s*[—-]?\s*/, "").trim() || String(name || "");

export const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");

// The never-used list shows a handful, then the rest on request.
export const FOLD = 8;
export const visible = (list, all) => (all ? list : list.slice(0, FOLD));
