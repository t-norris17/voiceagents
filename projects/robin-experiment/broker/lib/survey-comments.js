// Did the caller actually say something, or did they decline the last question?
//
// The survey ends with "anything else you'd like to share?", and the honest answer for most people
// is "No." That answer is stored in open_comments like any other, so a page that lists comments
// lists "No.", "Nope.", "Nope, that's it." as if they were feedback, and a count of "46 comments"
// is really 26 people saying nothing. On the live data about a third of comments are declines.
//
// The rule: strip the fillers and the stock ways of saying "nothing more", and ask what is left.
// Three content words or more means the caller said something. "Um, nope. Everything was smooth."
// keeps "everything was smooth" and counts; "No, I don't think so. Thank you." keeps nothing.
// Errs towards keeping: a short real remark ("Went smooth as silk.") must never be filed as a no.
//
// Pure, so it runs the same in the metrics endpoint, the themes gate and the tests.

// Whole phrases that mean "nothing more", removed before counting. Order matters only in that a
// longer phrase must go before a shorter one it contains.
const CLOSERS = [
  "not that i can think of", "nothing that i can think of", "i can't think of anything", "i cannot think of anything",
  "i don't think so", "i dont think so", "don't think so", "dont think so",
  "you've got everything", "you got everything", "you've covered everything", "you covered everything", "you've got it all",
  "that's about it", "that is about it", "that's it", "that is it", "that's all", "that is all", "that'll be it", "that will be it", "that'll be all", "that will be all", "that's everything", "that is everything",
  "nothing else", "nothing more", "nothing further", "nothing at all", "not really", "not at all", "not right now", "not at the moment",
  "i'm all set", "im all set", "all set", "i'm good", "im good", "we're good", "were good", "all good", "good to go",
  "for today", "for now", "at this time", "thank you", "thanks", "no thank you", "no thanks",
  "sería todo", "seria todo", "es todo", "eso es todo", "nada más", "nada mas",
];

// Single words that carry no content on their own: fillers, hedges, and the yes/no itself.
// Ordinary structural words ("it", "was") are NOT here on purpose: "everything was smooth" is a
// verdict and should count as one, and the stock phrases are already gone by the time these apply.
const FILLERS = new Set([
  "uh", "um", "umm", "uhh", "er", "erm", "ah", "hmm", "hm", "mm", "mhm", "uh-huh", "like", "so", "oh", "okay", "ok",
  "yeah", "yes", "yep", "yup", "no", "nope", "nah", "naw",
  "i", "i'm", "im", "i've", "ive", "i'd", "id", "think", "guess", "mean", "just", "really", "honestly", "actually", "again", "anyway", "and", "but", "or",
]);

const norm = (s) => String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

// The content words left after the closers and fillers are removed.
export function contentWords(text) {
  let t = norm(text);
  if (!t) return [];
  for (const c of CLOSERS) t = t.split(c).join(" ");
  return t
    .replace(/[^\p{L}\p{N}'$%-]+/gu, " ")
    .split(" ")
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w && !FILLERS.has(w));
}

// True when the comment says something beyond "no".
export function saidSomething(text) {
  return contentWords(text).length >= 3;
}
