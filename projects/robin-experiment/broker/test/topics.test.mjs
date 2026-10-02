// Stable topics: the menu, the schema that holds the model to it, and the collapse to one row per topic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenu, menuIds, menuPrompt, schemaWithMenu, normalize, rowKey, topicOfKey, groupOf, docLabel, OTHER, ACCOUNT } from "../lib/topics.js";

const LOANS = `# Loans\n\n## Can I take a loan against my 401(k)?\n\nYes, the plan allows loans.\n\n## Terms and cost\n\nUp to 5 years. Prime + 1%. A $75 fee.\n\n## Common questions\n\n*How much?* Lesser of $50,000 or 50%.\n`;
const LEAVING = `# Leaving\n\n## Vesting when you leave\n\n3-year cliff.\n\n## Common questions\n\nrestated.\n`;
const DOCS = [
  { name: "Vertex Manufacturing 401(k) — Loans...", usage_mode: "auto", body: LOANS },
  { name: "Vertex Manufacturing 401(k) — Leaving...", usage_mode: "auto", body: LEAVING },
  { name: "Online Portal", usage_mode: "prompt", body: "The portal is at nesteggu.com." },
];

test("the menu is Robin's section titles, minus the FAQ restatements, plus the two fixed entries", () => {
  const m = buildMenu(DOCS);
  assert.deepEqual(menuIds(m), ["loans--can-i-take-a-loan-against-my-401-k", "loans--terms-and-cost", "leaving--vesting-when-you-leave", "online-portal", ACCOUNT, OTHER]);
  assert.ok(!menuIds(m).some((id) => /common-questions/.test(id)), "a Common questions list restates other sections and is not a topic");
  assert.equal(m.find((x) => x.id === "loans--terms-and-cost").label, "Loans: Terms and cost");
  assert.match(m.find((x) => x.id === "loans--terms-and-cost").hint, /Up to 5 years/);
});

test("ids are unique even when two documents repeat a title, and stable across calls", () => {
  const twin = [{ name: "A", usage_mode: "auto", body: "## Fees\n\nx\n\n## Fees\n\ny" }];
  const ids = menuIds(buildMenu(twin));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(menuIds(buildMenu(DOCS)), menuIds(buildMenu(DOCS)), "the same documents give the same menu");
});

test("document names lose ElevenLabs' trailing dots and the shared Vertex prefix", () => {
  assert.equal(docLabel("Vertex Manufacturing 401(k) — Loans..."), "Loans");
  assert.equal(docLabel("Online Portal"), "Online Portal");
});

test("the schema holds canonical_key to the menu in BOTH lists, and leaves the base schema alone", () => {
  const base = { type: "object", properties: { answers: { type: "array", items: { type: "object", properties: { canonical_key: { type: "string" } } } }, all_questions: { type: "array", items: { type: "object", properties: { canonical_key: { type: "string" } } } } } };
  const m = buildMenu(DOCS), s = schemaWithMenu(base, m);
  assert.deepEqual(s.properties.answers.items.properties.canonical_key.enum, menuIds(m));
  assert.deepEqual(s.properties.all_questions.items.properties.canonical_key.enum, menuIds(m));
  assert.equal(base.properties.answers.items.properties.canonical_key.enum, undefined, "the base schema is not mutated");
});

test("the prompt lists every id and says what to do with account questions, gaps and FAQ lists", () => {
  const m = buildMenu(DOCS), p = menuPrompt(m);
  for (const id of menuIds(m)) assert.ok(p.includes(`- ${id}:`), `${id} is on the menu`);
  assert.match(p, /ONE entry per topic/); assert.match(p, new RegExp(ACCOUNT)); assert.match(p, /Common questions/);
});

test("row keys: a menu topic is its own key; 'other' keeps one row per distinct question", () => {
  assert.equal(rowKey("loans--terms-and-cost", "anything"), "loans--terms-and-cost");
  assert.equal(rowKey(OTHER, "Can I roll my loan into a new loan?"), "other~can-i-roll-my-loan-into-a-new-loan");
  assert.notEqual(rowKey(OTHER, "one thing"), rowKey(OTHER, "another thing"));
  assert.equal(topicOfKey("other~can-i-roll-my-loan"), OTHER); assert.equal(topicOfKey("loans--terms-and-cost"), "loans--terms-and-cost");
  assert.equal(groupOf(buildMenu(DOCS), "loans--terms-and-cost"), "loans");
  assert.equal(groupOf(buildMenu(DOCS), "other~x"), "other");
});

const ans = (key, q, claims = [], over = {}) => ({ canonical_key: key, question_text: q, answer_text: `answer to ${q}`, claims, answered_the_question: true, complete: true, appropriately_routed: true, sentiment: "neutral", sentiment_score: 0, note: "", ...over });
const qst = (key, q, answered = true, fail = "") => ({ canonical_key: key, canonical_question: q, asked_text: q.toLowerCase(), category: "x", answered, fail_reason: fail });

test("four labels for one down-payment question collapse to ONE row per topic (the real defect)", () => {
  const m = buildMenu(DOCS), T = "loans--terms-and-cost";
  const out = normalize({
    answers: [ans(T, "What does a loan cost?", [{ claim: "$75 fee", source_quote: "$75", verdict: "supported" }]), ans(T, "What are the fees?", [{ claim: "$75 fee", source_quote: "$75", verdict: "supported" }, { claim: "5 years", source_quote: "5 years", verdict: "supported" }])],
    all_questions: [qst(T, "What does a loan cost?"), qst(T, "What are the fees?"), qst("leaving--vesting-when-you-leave", "Do I keep the match?")],
    security_flag: true, security_detail: "gave a balance early",
  }, m);
  assert.equal(out.answers.length, 1); assert.equal(out.all_questions.length, 2);
  assert.equal(out.answers[0].claims.length, 2, "claims are joined, the repeated one once");
  assert.match(out.answers[0].question_text, /What does a loan cost\? \/ What are the fees\?/);
  assert.equal(out.security_flag, true); assert.equal(out.security_detail, "gave a balance early", "the security verdict passes through");
});

test("a merged topic is answered only if every question on it was, and keeps the reason for the one that was not", () => {
  const T = "loans--terms-and-cost";
  const out = normalize({ answers: [], all_questions: [qst(T, "Cost?", true), qst(T, "Fees from another account?", false, "no_content")] }, buildMenu(DOCS));
  assert.equal(out.all_questions.length, 1);
  assert.equal(out.all_questions[0].answered, false); assert.equal(out.all_questions[0].fail_reason, "no_content");
});

test("one weak answer on a topic makes the topic's answer weak", () => {
  const T = "loans--terms-and-cost";
  const out = normalize({ answers: [ans(T, "a"), ans(T, "b", [], { complete: false, note: "left out the fee" })], all_questions: [] }, buildMenu(DOCS));
  assert.equal(out.answers[0].complete, false); assert.match(out.answers[0].note, /left out the fee/);
});

test("anything off the menu becomes 'other', so a bad reply cannot create a new key; distinct 'other' questions stay apart", () => {
  const out = normalize({ answers: [], all_questions: [qst("made-up-topic", "Roll my loan into a new loan?", false, "no_content"), qst(OTHER, "Open an account for my kid?", false, "out_of_scope"), qst("also-made-up", "Roll my loan into a new loan?", false, "no_content")] }, buildMenu(DOCS));
  assert.deepEqual(out.all_questions.map((q) => q.canonical_key).sort(), ["other~open-an-account-for-my-kid", "other~roll-my-loan-into-a-new-loan"]);
});
