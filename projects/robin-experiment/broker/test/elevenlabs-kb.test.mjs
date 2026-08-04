// The content endpoint's response shape is the part most likely to drift, and a silent shape
// change here puts the grader straight back to grading against nothing — the exact failure this
// whole path exists to fix. So unwrap() is pinned. Run: `node --test`. No key, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../lib/elevenlabs-kb.js";

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
