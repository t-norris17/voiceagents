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
    note: total && !complete ? "Only interactions graded against a source are counted, so this is a floor. It rises as more are measured." : null,
  };
}

// The coverage strip. "Measured" means graded with a document to check against; an interaction stamped
// graded before the grader could read Robin's documents is not measured, and is counted apart so the
// strip never claims more than the number rests on.
export function coverageView(r) {
  const interactions = Number(r?.interactions) || 0;
  const measured = Number(r?.measured ?? r?.graded) || 0;
  const unmeasurable = Number(r?.unmeasurable) || 0;
  return {
    line: `${measured} of ${interactions} interactions measured`,
    unmeasurable,
    unmeasurableLine: unmeasurable > 0 ? `${unmeasurable} more ${unmeasurable === 1 ? "was" : "were"} graded before their documents could be read` : null,
  };
}

// "Read in 150, used in 40": how often Robin pulled a chunk of the document, and how often she used one.
// Exact per document, from the retrieval record stored with every interaction (graded or not).
export const readLine = (d) => `Read in ${d?.read_in ?? 0}, used in ${d?.used_in ?? 0} interactions`;

// What to say about one section: what cited it, or why nothing did. The reason is honest about what
// cannot be known: the stored retrieval records place a read on a document, not on a section.
export function sectionNote(doc, sec) {
  if (sec.used) {
    const q = (sec.questions || []).length ? ` Asked as: ${(sec.questions || []).map((x) => `“${x}”`).join(", ")}.` : "";
    return `Quoted in ${sec.count} measured ${sec.count === 1 ? "answer" : "answers"}.${q}`;
  }
  if (!doc || !(doc.read_in > 0)) return "Robin never retrieved this document in the window, so nothing in it could be used.";
  return `Robin read this document in ${doc.read_in} interactions and used it in ${doc.used_in}, but no measured answer quoted this section. It may not have been asked about, or the interactions that did were not measured.`;
}

// ElevenLabs shortens long document names with a trailing "..." and the Vertex ones all share a prefix;
// the page shows the part that tells them apart.
export const docLabel = (name) => String(name || "").replace(/(\.{3}|…)\s*$/, "").replace(/^Vertex Manufacturing 401\(k\)\s*[—-]?\s*/, "").trim() || String(name || "");

export const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");

// The never-used list shows a handful, then the rest on request.
export const FOLD = 8;
export const visible = (list, all) => (all ? list : list.slice(0, FOLD));
