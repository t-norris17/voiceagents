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
// The honest limit: only interactions graded WITH A SOURCE have quotes, so the number is a FLOOR. An
// interaction graded before the grader could read Robin's documents has stamped scores but no quotes
// (grounding "no_source"); it is reported as unmeasurable, not counted as graded. The page says how
// much of the window was measured so nobody reads the number as the whole truth, and nothing here
// grades anything (grading is a manual, paid click on the Accuracy page).
//
// "Read in" and "used in" per document come from the retrieval records stored with every interaction,
// graded or not: ElevenLabs lists the chunks it returned and the chunks it used. They are exact per
// document and cannot be placed on a section (the stored records carry chunk ids, not chunk text).

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

// What a section says, in a line or two, so a title like "Steps" is not all anyone gets to see.
export function previewOf(text, max = 220) {
  const plain = String(text || "").replace(/<[^>]+>/g, " ").replace(/[*_`>#]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, "") + "…" : plain;
}

// Per document: in how many interactions Robin READ a chunk of it (it came back from retrieval) and in
// how many she USED one (ElevenLabs's used_chunk_ids). Each interaction counts once per document.
export function retrievalByDocument(transcripts) {
  const out = new Map();
  const bump = (id, key) => { const e = out.get(id) || { read_in: 0, used_in: 0 }; e[key] += 1; out.set(id, e); };
  for (const t of transcripts || []) {
    const read = new Set(), used = new Set();
    for (const turn of Array.isArray(t) ? t : []) {
      const rag = turn?.rag_retrieval_info;
      if (!rag || typeof rag !== "object" || !Array.isArray(rag.chunks)) continue;
      const doc = new Map(rag.chunks.map((c) => [c?.chunk_id, c?.document_id]));
      for (const c of rag.chunks) if (c?.document_id) read.add(String(c.document_id));
      for (const id of Array.isArray(rag.used_chunk_ids) ? rag.used_chunk_ids : []) if (doc.get(id)) used.add(String(doc.get(id)));
    }
    for (const id of read) bump(id, "read_in");
    for (const id of used) bump(id, "used_in");
  }
  return out;
}

export function compute({ docs, quotes, interactions, graded, measured = null, unmeasurable = 0, retrieval = new Map(), unmet = [], days = 30 }) {
  // Documents that are always in her prompt (usage_mode "prompt") are not retrieved topics; leave them out.
  const ragDocs = docs.filter((d) => d.usage_mode !== "prompt");
  const documents = ragDocs.map((d) => ({
    id: d.id, name: d.name,
    sections: splitSections(d.body).map((s) => ({ title: s.title, norm: norm(s.title + " " + s.text), preview: previewOf(s.text), count: 0, questions: new Set() })),
  }));

  const unmatched = [];
  for (const entry of quotes) {
    // A quote is a string, or { quote, question } so the section can say which question cited it.
    const quote = typeof entry === "string" ? entry : entry?.quote;
    const question = typeof entry === "string" ? "" : String(entry?.question || "").trim();
    const frags = fragmentsOf(quote);
    if (!frags.length) continue;
    let hit = false;
    for (const d of documents) for (const s of d.sections) {
      if (frags.some((f) => s.norm.includes(f))) { s.count++; hit = true; if (question) s.questions.add(question); }
    }
    if (!hit) unmatched.push(quote);
  }

  const out = documents.map((d) => ({
    id: d.id, name: d.name,
    total: d.sections.length,
    used: d.sections.filter((s) => s.count > 0).length,
    read_in: retrieval.get(d.id)?.read_in ?? 0,
    used_in: retrieval.get(d.id)?.used_in ?? 0,
    sections: d.sections.map(({ title, count, preview, questions }) => ({ title, count, used: count > 0, preview, questions: [...questions].slice(0, 4) })),
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

  // `measured` = interactions graded against a source. Older callers that pass only `graded` keep working.
  const m = measured == null ? graded : measured;
  return {
    window_days: days, interactions, graded, measured: m, unmeasurable,
    coverage: interactions ? m / interactions : 0,
    used, total, pct: total ? used / total : 0,
    documents: out,
    never_used: out.flatMap((d) => d.sections.filter((s) => !s.used).map((s) => ({ document: d.name, title: s.title }))),
    unmatched_quotes: unmatched.length,
    unmet: [...byTopic.values()].sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
