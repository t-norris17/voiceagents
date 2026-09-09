// GET /api/survey-themes -> { ready, themes[], narrative, based_on }
//
// Clusters the free-text answers (Q4, plus the caller's own words on Q2 and Q3) into named themes
// and writes the paragraph a leader reads before looking at a single number.
//
// WHY A MODEL RATHER THAN KEYWORDS: "took forever", "had to repeat myself twice" and "it kept
// asking me the same thing" are one complaint and share no keyword. Keyword counting would report
// three findings of one each and bury the actual signal.
//
// WHY IT IS GATED: below a handful of comments a "theme" is one person's sentence with a label on
// it, which reads as a finding and isn't one. It returns ready:false and says how many more are
// needed rather than manufacturing structure out of noise.
//
// Behind the password gate (see middleware.js).
// TEMPORARY: delete with the instrument after the customer wave.
import Anthropic from "@anthropic-ai/sdk";
import { surveyCalls } from "../lib/survey-data.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY
const MIN_COMMENTS = 8;

// Warm-instance cache keyed by the shape of the data. Themes cost a model call and change only
// when new answers land, so re-running per page load would burn money to redraw the same panel.
// Deliberately in-memory rather than a table: this instrument is temporary and does not deserve
// schema. A cold start just recomputes.
let cache = { key: null, at: 0, value: null };
const TTL_MS = 10 * 60 * 1000;

const THEME_TOOL = {
  name: "report_themes",
  description: "Report the themes found across the survey's free-text answers.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      themes: {
        type: "array",
        description: "Themes, most frequently expressed first. At most 6.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "3-6 words, the theme in the callers' own register, not a category name." },
            summary: { type: "string", description: "One sentence on what people in this theme actually said." },
            sentiment: { type: "string", enum: ["positive", "negative", "mixed"] },
            people: { type: "integer", description: "How many distinct respondents expressed it. Best effort; the server recomputes this from conversation_ids." },
            quote: { type: "string", description: "One short verbatim quote, copied exactly, that typifies the theme." },
            conversation_ids: { type: "array", items: { type: "string" }, description: "Every conversation id in this theme." },
          },
          required: ["label", "summary", "sentiment", "people", "quote", "conversation_ids"],
          additionalProperties: false,
        },
      },
      narrative: {
        type: "string",
        description:
          "3-5 sentences a director can read aloud. What the free text says, what it does NOT say, " +
          "and the single most useful caveat given the sample size. No recommendations.",
      },
    },
    required: ["themes", "narrative"],
    additionalProperties: false,
  },
};

const SYSTEM = `You are analysing free-text answers from a survey measuring whether 401(k) plan
participants would rather handle a question with a voice agent (Robin) or hold for a human.

Rules:
- Report only what the text says. Never infer a cause the caller did not state.
- A theme needs at least two DISTINCT RESPONDENTS. Rows are individual calls, and one person may
  appear several times under the same "respondent" id — three comments from one respondent is one
  person's view, not a theme. Count respondents, never rows.
- Quote verbatim. Do not clean up grammar or fillers.
- The narrative must state the sample size honestly and name what the data cannot yet support.
  If the answers are overwhelmingly positive, say so plainly AND note that a small self-selected
  internal cohort is the weakest evidence for a customer-facing decision.
- Never recommend a course of action. Describe what people said; the decision is not yours.`;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    // CALL-level, not person-level. survey_people holds only a person's first surveyed call, so
    // reading themes from it discards every comment left on a second or third call — which on the
    // data as it stands is 100% of them. Proportions are counted per person; words are not.
    const calls = (await surveyCalls()).filter((c) => c.survey_offered);
    const withText = calls.filter((c) => c.open_comments || c.prefer_agent_raw || c.would_recommend_raw);

    const commented = calls.filter((c) => c.open_comments).length;
    if (commented < MIN_COMMENTS) {
      return res.status(200).json({
        ready: false,
        have: commented,
        need: MIN_COMMENTS,
        reason: `Themes need at least ${MIN_COMMENTS} written comments. Below that a theme is one person's sentence with a label on it.`,
      });
    }

    // Fingerprint the inputs, not the clock: same answers means same themes.
    //
    // The first version keyed on (withText.length, commented, last person's first_at) — all three
    // of which can stay FROZEN while the data changes. A repeat caller who already had a comment
    // leaves another one: counts unchanged (person-level), and first_at is a MIN so it never moves.
    // The cache would then serve themes that predate the new comment for its whole TTL. Keyed on the
    // newest call instead, which is monotonic by construction.
    const newest = calls.reduce((m, c) => (c.started_at > m ? c.started_at : m), "");
    const key = `${withText.length}:${commented}:${newest}`;
    if (cache.key === key && Date.now() - cache.at < TTL_MS) return res.status(200).json(cache.value);

    const rows = withText.map((p) => ({
      conversation_id: p.conversation_id,
      // The same person can appear more than once. Named so the model does not read one talkative
      // tester as a groundswell; the server recounts distinct people afterwards regardless.
      respondent: p.person_key,
      score: p.satisfaction_score,
      prefers: p.preference,
      in_their_words: {
        rating: p.satisfaction_raw,
        preference: p.prefer_agent_raw,
        recommend: p.would_recommend_raw,
        anything_else: p.open_comments,
      },
    }));

    const msg = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      tools: [THEME_TOOL],
      tool_choice: { type: "tool", name: "report_themes" },
      messages: [
        {
          role: "user",
          content:
            `${rows.length} calls carried free text, from ` +
            `${new Set(rows.map((r) => r.respondent).filter(Boolean)).size} distinct respondents. ` +
            `Comments with detectable personal data were dropped upstream and are absent here.` +
            `\n\n${JSON.stringify(rows, null, 1)}`,
        },
      ],
    });

    const call = msg.content.find((b) => b.type === "tool_use" && b.name === "report_themes");
    if (!call) throw new Error("model returned no themes");

    // Recount `people` server-side from the ids the model cited rather than trusting the integer it
    // reported. Two comments from one repeat caller must not read as two people agreeing — that is
    // the same inflation the person-level rule exists to prevent, arriving through the LLM instead
    // of through SQL. Arithmetic beats a self-reported count on a number leadership will quote.
    const personOf = new Map(calls.map((c) => [c.conversation_id, c.person_key]));
    const themes = (call.input.themes || []).map((t) => {
      const ids = (t.conversation_ids || []).filter((id) => personOf.has(id));
      const distinct = new Set(ids.map((id) => personOf.get(id)).filter(Boolean)).size;
      return { ...t, conversation_ids: ids, people: distinct || ids.length, mentions: ids.length };
    // A "theme" needs at least two distinct people. The prompt says so, but the prompt is not an
    // enforcement mechanism; this is.
    }).filter((t) => t.people >= 2);

    const value = {
      ready: true, themes, narrative: call.input.narrative,
      based_on: {
        comments: commented,
        people_who_commented: new Set(calls.filter((c) => c.open_comments).map((c) => c.person_key).filter(Boolean)).size,
      },
    };
    cache = { key, at: Date.now(), value };
    res.setHeader("cache-control", "no-store");
    return res.status(200).json(value);
  } catch (e) {
    console.error("survey-themes failed:", String(e.message || e));
    // Fail soft and SAY SO. A themes panel that silently shows nothing reads as "no themes found",
    // which is a claim about the data rather than about the outage.
    return res.status(200).json({ ready: false, error: "Theme analysis is unavailable right now." });
  }
}
