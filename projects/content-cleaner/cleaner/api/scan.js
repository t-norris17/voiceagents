// POST /api/scan  { segments:[{i,title,chars,snippet}], env }  ->  { sections:[{i,title,topic,recommend,reason}] }
// Triage pass for a LARGE source document. The client splits the text into candidate sections and
// sends only each section's title + a short snippet — never the whole document — so this stays a few
// thousand tokens and a few cents, instead of shipping a 300-page plan document through the model.
//
// The point is to spend a little Sonnet to avoid a lot of Opus: the human then unchecks the fund
// tables, ERISA boilerplate, and glossaries before paying to clean them. Sonnet only RECOMMENDS —
// the person decides, and nothing is cleaned until they press continue.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_API_KEY

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      description: "One entry per input segment, in the same order, with the same i.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          i: { type: "number", description: "The segment's index, copied from the input." },
          title: { type: "string", description: "A short, human-readable section title (5 words or fewer where possible). Clean up the raw heading; if there is none, name it from the content." },
          topic: { type: "string", description: "Topic area in a word or two, e.g. loans, enrollment, investments, legal, tables." },
          recommend: { type: "boolean", description: "True if this section contains participant-facing plan knowledge a voice agent should be able to answer from." },
          reason: { type: "string", description: "Six words or fewer on why, e.g. 'participant-facing' or 'fund tables — not spoken answers'." },
          continues_previous: { type: "boolean", description: "True if this is NOT a real new section but a continuation of the one before it — a page header/footer, a stray line, a repeated document title, or the rest of the previous topic. Scanned/OCR'd documents produce many of these." },
        },
        required: ["i", "title", "topic", "recommend", "reason", "continues_previous"],
      },
    },
  },
  required: ["sections"],
};

const SYSTEM = `You triage the sections of a retirement-plan document so a human can pick which ones are worth
turning into knowledge-base articles for a VOICE agent that answers participant questions.

You see each section's raw heading (if any), its size, and a short snippet — not the full text. Judge from that.

RECOMMEND (true) sections that hold participant-facing plan knowledge someone would call and ASK about:
eligibility, enrollment, contributions, employer match, vesting, loans, withdrawals, hardship, rollovers,
beneficiaries, distributions, investment elections, account access.

DO NOT RECOMMEND (false) sections that cannot become a spoken answer: fund performance and fee tables,
ERISA rights statements and legal boilerplate, plan-amendment and trustee provisions, definitions and
glossaries, signature pages, forms, tables of contents, and index or appendix material.

MERGING MATTERS AS MUCH AS LABELLING. The segments come from crude heading detection over extracted text,
and scanned or OCR'd documents split badly — repeated page headers and footers, the document's own title
reappearing, running heads, stray capitalised lines, and topics broken across several segments. Set
continues_previous = true for any segment that is not genuinely the start of a new topic, so it gets folded
back into the section before it. Expect to merge aggressively: a real plan document has on the order of a
dozen or two real sections, so if you are given many more than that, most of the extras are fragments. The
first segment is never a continuation.

When a section is ambiguous, lean toward recommending it — the human can uncheck it, and a wrongly skipped
section is a silent gap in what the agent knows. Give every input segment exactly one entry, same index,
same order. Return ONLY the structured tool.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const segs = (req.body && req.body.segments) || [];
    const env = String((req.body && req.body.env) || "").trim();
    if (!Array.isArray(segs) || !segs.length) return res.status(400).json({ error: "need segments" });
    if (segs.length > 200) return res.status(400).json({ error: "too many segments" });

    const list = segs
      .map((s) => `[${s.i}] heading: ${String(s.title || "(none)").slice(0, 120)}\n    size: ${s.chars} chars\n    starts: "${String(s.snippet || "").slice(0, 220).replace(/\s+/g, " ")}"`)
      .join("\n");

    const user = `DOCUMENT APPLIES TO: ${env || "a workplace retirement plan"}

SECTIONS FOUND (${segs.length}):
${list}

Triage every section.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content.find((b) => b.type === "text");
    if (!text) throw new Error("scan returned no text block");
    const out = JSON.parse(text.text);

    // Never lose a segment: if the model skipped one, fall back to recommending it so a real
    // section can't silently vanish from the picker.
    const byIdx = new Map((out.sections || []).map((s) => [Number(s.i), s]));
    const sections = segs.map((s, idx) => {
      const m = byIdx.get(Number(s.i));
      return {
        i: s.i,
        title: String(m?.title || s.title || `Section ${s.i + 1}`).slice(0, 120),
        topic: String(m?.topic || "").slice(0, 40),
        recommend: m ? !!m.recommend : true,
        reason: String(m?.reason || "not classified — included by default").slice(0, 80),
        // The first segment can never fold into a previous one.
        continues_previous: idx > 0 && !!m?.continues_previous,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, sections });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
