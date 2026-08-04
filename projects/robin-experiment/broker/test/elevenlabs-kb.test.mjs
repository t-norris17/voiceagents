// The content endpoint's response shape is the part most likely to drift, and a silent shape
// change here puts the grader straight back to grading against nothing — the exact failure this
// whole path exists to fix. So unwrap() is pinned. Run: `node --test`. No key, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap, htmlToText } from "../lib/elevenlabs-kb.js";

test("a plain-text document comes back as itself", () => {
  assert.equal(unwrap("Participants may borrow from their vested balance."), "Participants may borrow from their vested balance.");
});

test("a JSON envelope is unwrapped, whichever field carries the body", () => {
  assert.equal(unwrap('{"content":"Body A"}'), "Body A");
  assert.equal(unwrap('{"text":"Body B"}'), "Body B");
  assert.equal(unwrap('{"extracted_inner_html":"Body C"}'), "Body C");
  assert.equal(unwrap('{"body":"Body D"}'), "Body D");
});

test("only an object or array is treated as an envelope — a quoted line stays as written", () => {
  // A document can legitimately open with a quotation mark ("Can I take a loan?" as a heading).
  // Stripping quotes off that would corrupt the document, and a bare JSON string response is not
  // a shape the content endpoint uses. Leaving it alone is the safe side of the ambiguity.
  assert.equal(unwrap('"Can I take a loan?" is the question this covers.'), '"Can I take a loan?" is the question this covers.');
});

test("the first populated field wins, and an empty one is skipped", () => {
  assert.equal(unwrap('{"content":"","text":"the real body"}'), "the real body");
});

test("text that merely starts with a brace isn't mangled", () => {
  assert.equal(unwrap('{not json at all'), "{not json at all");
});

test("an unrecognized envelope is kept, not silently turned into an empty document", () => {
  // Returning "" here would make hasSource false and send every answer back to `no_source` —
  // the failure mode looks identical to having no key at all, which is why it must not be silent.
  const odd = '{"chunks":[{"id":"a"}]}';
  assert.equal(unwrap(odd), odd);
  assert.notEqual(unwrap(odd), "");
});

test("empty and null inputs are empty, not a crash", () => {
  assert.equal(unwrap(""), "");
  assert.equal(unwrap(null), "");
  assert.equal(unwrap(undefined), "");
});

// --- HTML, because that is what the content endpoint actually returns ---

test("markup is reduced to the text a person would read", () => {
  // The real shape, taken from a cached Vertex document.
  const doc = `<html><body><div data-name="Vertex Manufacturing 401(k) — Loans From Your Account">`
    + `<h1>Loans From Your Account</h1><p>You may borrow up to <strong>50%</strong> of your vested balance.</p>`
    + `<ul><li>Minimum loan: $1,000</li><li>A $75 fee applies</li></ul></div></body></html>`;
  const t = htmlToText(doc);
  assert.doesNotMatch(t, /[<>]/, "no tags survive");
  assert.match(t, /^Loans From Your Account$/m, "the heading is its own line, not welded to the paragraph");
  assert.match(t, /You may borrow up to 50% of your vested balance\./);
  assert.match(t, /- Minimum loan: \$1,000/);
  assert.match(t, /- A \$75 fee applies/);
});

test("entities are decoded, so a quoted span matches what the model was shown", () => {
  assert.equal(htmlToText("<p>Fees &amp; charges &mdash; up to 50&#37; &nbsp;vested</p>").replace(/\s+/g, " ").trim(),
    "Fees & charges — up to 50% vested");
});

test("script and style content never reaches the grader as source text", () => {
  const t = htmlToText("<style>.a{color:red}</style><p>Real text.</p><script>var x=1;</script>");
  assert.equal(t, "Real text.");
});

test("plain text is left exactly as written — no markup, no mangling", () => {
  const plain = "Participants may borrow from their vested balance.\n\nThe minimum loan is $1,000.";
  assert.equal(htmlToText(plain), plain);
});

test("an HTML document arriving inside a JSON envelope is still stripped", () => {
  assert.equal(unwrap('{"content":"<h1>Title</h1><p>Body.</p>"}'), "Title\nBody.");
});
