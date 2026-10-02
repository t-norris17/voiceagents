// Stable topics: a fixed menu the grader files each question under, instead of a label it makes up.
//
// Before this, the grader invented a topic key for every question in every interaction. Measured on the live
// tables (2026-10-02): 260 distinct keys, 222 of them in exactly ONE interaction, and one interaction held
// the same question under four keys ("down-payment-vested-balance", "down-payment-required-balance", ...). So
// "how often was this asked" was scattered across hundreds of one-off labels, and inflated inside a call.
//
// The menu is the section titles of the documents attached to Robin (read live, so it follows her knowledge),
// plus two fixed entries: the caller's own account figures (answered from tools, not documents) and "other".
// A question is filed under the section whose content would answer it, even when she answered thinly or not at
// all, which is what lets "asked about X, and X is where the gap is" line up with Utilization's sections.
//
// The model is held to the menu by the response schema (an enum), not by asking nicely; normalize() still
// treats anything off-menu as "other", so a bad reply cannot create a new key.
//
// Row keys: a menu topic is its own key, so one interaction has at most ONE row per topic (several questions on
// one topic are merged). "other" keeps one row per distinct question (`other~<question slug>`), because two
// unrelated things nobody covers must not collapse into one.
import { splitSections, previewOf } from "./utilization.js";

export const OTHER = "other";
export const ACCOUNT = "account-figures";

const slug = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ElevenLabs shortens long names with a trailing "..." and the Vertex ones share a prefix.
export const docLabel = (name) =>
  String(name || "").replace(/(\.{3}|…)\s*$/, "").replace(/^Vertex Manufacturing 401\(k\)\s*[—-]?\s*/, "").trim() || String(name || "");

// A "Common questions" list restates other sections, so it is not a topic: the question belongs where the full
// answer lives.
const isFaq = (title) => /^common questions\b/i.test(String(title || "").trim());

// docs: [{ name, usage_mode, body }] as read by liveRobin(). Returns [{ id, label, group, hint }].
export function buildMenu(docs) {
  const menu = [], used = new Set();
  const add = (id, label, group, hint) => {
    let u = id, n = 2;
    while (used.has(u)) u = `${id}-${n++}`;
    used.add(u);
    menu.push({ id: u, label, group, hint: hint || "" });
  };
  for (const d of docs || []) {
    const dl = docLabel(d.name), g = slug(dl) || "document";
    if (d.usage_mode === "prompt") { add(g, dl, g, previewOf(d.body, 110)); continue; } // always in her prompt: one topic
    for (const s of splitSections(d.body)) {
      if (isFaq(s.title)) continue;
      add(`${g}--${slug(s.title) || "section"}`, `${dl}: ${s.title}`, g, previewOf(s.text, 110));
    }
  }
  add(ACCOUNT, "The caller's own account figures", "account", "their balance, vested amount, loan on file or contributions on record; answered from tools, not documents");
  add(OTHER, "Anything else, or not covered by any document", "other", "say the question plainly in canonical_question");
  return menu;
}

export const menuIds = (menu) => menu.map((m) => m.id);
export const groupOf = (menu, key) => menu.find((m) => m.id === topicOfKey(key))?.group || "other";

export const topicOfKey = (key) => (String(key || "").startsWith(`${OTHER}~`) ? OTHER : String(key || ""));
export function rowKey(topicId, question) {
  if (topicId !== OTHER) return topicId;
  return `${OTHER}~${slug(question).slice(0, 40) || "unspecified"}`;
}

// The menu as the grader reads it.
export function menuPrompt(menu) {
  return `TOPIC MENU. Every \`canonical_key\` you return, in BOTH lists, must be exactly one id from this menu, copied as written.
File a question under the section whose content would answer it, even when Robin's answer was thin or she had nothing. A "Common questions" list restates other sections: use the section that holds the full answer. Use "${ACCOUNT}" for questions about the caller's OWN balance, vested amount, loan on file or contributions on record. Use "${OTHER}" only when no section fits.
Return ONE entry per topic in each list. If the caller asked two questions that belong to the same topic, combine them into one entry: name both in canonical_question, and join the answers.
${menu.map((m) => `- ${m.id}: ${m.label}${m.hint ? `. ${m.hint}` : ""}`).join("\n")}`;
}

// The response schema with the enum on canonical_key. Deep-copies, never mutates the base.
export function schemaWithMenu(base, menu) {
  const s = JSON.parse(JSON.stringify(base));
  const ids = menuIds(menu);
  const key = { type: "string", enum: ids, description: "The id of the ONE topic in the TOPIC MENU this belongs under." };
  s.properties.answers.items.properties.canonical_key = key;
  s.properties.all_questions.items.properties.canonical_key = { ...key };
  return s;
}

const uniq = (xs) => [...new Set(xs.filter(Boolean))];

// Collapse the model's two lists to one entry per row key. Answers: claims are joined, judgments AND together
// (one weak answer on the topic makes the topic's answer weak), text and notes are joined. Questions: answered
// only if every question on the topic was; the first unanswered one supplies the reason.
export function normalize(out, menu) {
  const ids = new Set(menuIds(menu));
  const topic = (k) => (ids.has(k) ? k : OTHER);

  const answers = new Map();
  for (const a of out?.answers || []) {
    const t = topic(a.canonical_key), key = rowKey(t, a.question_text);
    const prev = answers.get(key);
    if (!prev) { answers.set(key, { ...a, canonical_key: key, claims: [...(a.claims || [])] }); continue; }
    const seen = new Set(prev.claims.map((c) => c.claim));
    prev.claims.push(...(a.claims || []).filter((c) => !seen.has(c.claim)));
    prev.question_text = uniq([prev.question_text, a.question_text]).join(" / ");
    prev.answer_text = uniq([prev.answer_text, a.answer_text]).join(" / ");
    prev.answered_the_question = prev.answered_the_question !== false && a.answered_the_question !== false;
    prev.complete = prev.complete !== false && a.complete !== false;
    prev.appropriately_routed = prev.appropriately_routed !== false && a.appropriately_routed !== false;
    prev.note = uniq([prev.note, a.note]).join(" · ");
  }

  const questions = new Map();
  for (const q of out?.all_questions || []) {
    const t = topic(q.canonical_key), key = rowKey(t, q.canonical_question);
    const prev = questions.get(key);
    if (!prev) { questions.set(key, { ...q, canonical_key: key }); continue; }
    prev.canonical_question = uniq([prev.canonical_question, q.canonical_question]).join(" / ");
    prev.asked_text = uniq([prev.asked_text, q.asked_text]).join(" / ");
    if (prev.answered && !q.answered) { prev.answered = false; prev.fail_reason = q.fail_reason; }
  }
  // everything else the model returned (the security verdict) passes through untouched
  return { ...out, answers: [...answers.values()], all_questions: [...questions.values()] };
}
