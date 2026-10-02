// Utilization: how much of what Robin KNOWS callers actually use.
//
//   denominator  the sections (H2 headings) of the documents attached to her, read from ElevenLabs
//   numerator    the sections that a graded answer cited: the grader stores, per claim, the VERBATIM
//                span of the source document that backs it, so locating that span in a document finds
//                the section Robin actually relied on
//
// Why not "retrieved"? Robin searches her knowledge on nearly every turn, even for "what is my
// balance", and gets ~4 chunks back each time, so every document looks used by every call. Why not the
// call's topic field? It is free text ("401k loan", "401K loan", "plan_question", empty). A cited quote
// is evidence she used a passage.
//
// The honest limit: only GRADED interactions have quotes, so the number is a FLOOR. It reports how much
// of the window was graded so nobody reads it as the whole truth, and it never grades anything itself
// (grading is a manual, paid click on the Accuracy page).

// Compare text with markdown, case and spacing out of the way. Keeps letters, digits and the dashes and
// arrows the documents actually use, because quotes are verbatim.
export const norm = (s) =>
  String(s || "").toLowerCase().replace(/[*_`>#]/g, "").replace(/\s+/g, " ").trim();

// H2 sections only. The H1 title and any preamble before the first H2 are not topics.
export function splitSections(body) {
  const out = []; let cur = null;
  for (const line of String(body || "").split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { cur = { title: m[1].trim(), text: "" }; out.push(cur); continue; }
    if (/^#\s/.test(line)) { cur = null; continue; }
    if (cur) cur.text += line + "\n";
  }
  return out;
}

// A quote can stitch two spans with an ellipsis; each fragment counts on its own. Very short
// fragments are ignored: "$1,000." appears in more places than one.
export function fragmentsOf(quote) {
  return String(quote || "").split(/\.\.\.|…/).map(norm).filter((f) => f.length >= 12);
}

export function compute({ docs, quotes, interactions, graded, unmet = [], days = 30 }) {
  // Documents that are always in her prompt (usage_mode "prompt") are not retrieved topics; leave them out.
  const ragDocs = docs.filter((d) => d.usage_mode !== "prompt");
  const documents = ragDocs.map((d) => ({
    id: d.id, name: d.name,
    sections: splitSections(d.body).map((s) => ({ title: s.title, norm: norm(s.title + " " + s.text), count: 0 })),
  }));

  const unmatched = [];
  for (const q of quotes) {
    const frags = fragmentsOf(q);
    if (!frags.length) continue;
    let hit = false;
    for (const d of documents) for (const s of d.sections) {
      if (frags.some((f) => s.norm.includes(f))) { s.count++; hit = true; }
    }
    if (!hit) unmatched.push(q);
  }

  const out = documents.map((d) => ({
    id: d.id, name: d.name,
    total: d.sections.length,
    used: d.sections.filter((s) => s.count > 0).length,
    sections: d.sections.map(({ title, count }) => ({ title, count, used: count > 0 })),
  }));
  const total = out.reduce((n, d) => n + d.total, 0);
  const used = out.reduce((n, d) => n + d.used, 0);

  // Demand with no answer: what callers asked that Robin had nothing for, grouped by topic.
  const byTopic = new Map();
  for (const u of unmet) {
    const key = u.canonical_key || norm(u.asked_text);
    if (!key) continue;
    const e = byTopic.get(key) || { question: u.canonical_question || u.asked_text, count: 0, reason: u.fail_reason };
    e.count++; byTopic.set(key, e);
  }

  return {
    window_days: days, interactions, graded,
    coverage: interactions ? graded / interactions : 0,
    used, total, pct: total ? used / total : 0,
    documents: out,
    never_used: out.flatMap((d) => d.sections.filter((s) => !s.used).map((s) => ({ document: d.name, title: s.title }))),
    unmatched_quotes: unmatched.length,
    unmet: [...byTopic.values()].sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
