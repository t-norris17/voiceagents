// "No." is not a comment. Every string here is the shape of a real answer to the survey's last
// question ("anything else?"), paraphrased where it named a person.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { saidSomething, contentWords } from "../lib/survey-comments.js";

const NOTHING = [
  "No.", "Nope.", "Nope, that's it.", "Uh, nope.", "no, not really", "No, I don't think so.",
  "No, I don't think so. Thank you.", "No, thanks. That's it.", "Nope, not that I can think of.",
  "No, I think, um, you've got everything.", "I think that's it for today.", "No, sería todo.",
  "Nah, I'm good.", "That's all, thank you.", "Nothing else.", "", null, undefined,
];
const SOMETHING = [
  "Went smooth as silk.", "I thought it was great.", "Um, nope. Everything was smooth.",
  "No, I really think it worked well.", "No. Overall, pretty good.", "I think that's it. I think it went well.",
  "No, the main thing would be if a customer's interrupting you, you need to, um, pause and let them interject.",
  "Uh, nope. Other than the incorrect loan amount, I think it went very well.",
  "Uh, you just talked a little quickly, but other than that, nope.",
  "Yeah, it's not $75 to open a loan and 25 to maintain it every year. It's just a flat fee.",
  "Your score would be a 10 out of 10 across the board if you could perform actions and do more for me.",
  "I think I've aired my grievances.", "Uh, I hope this can do more in the future.",
];

test("a bare no, with any of the usual trimmings, is not a comment", () => {
  for (const s of NOTHING) assert.equal(saidSomething(s), false, JSON.stringify(s));
});

test("anything with three content words is a comment, however it starts", () => {
  for (const s of SOMETHING) assert.equal(saidSomething(s), true, JSON.stringify(s));
});

test("the content words are what is left after fillers and closers", () => {
  assert.deepEqual(contentWords("Um, nope. Everything was smooth."), ["everything", "was", "smooth"]);
  assert.deepEqual(contentWords("No, thanks. That's it."), []);
  assert.deepEqual(contentWords("Went smooth as silk."), ["went", "smooth", "as", "silk"]);
});
