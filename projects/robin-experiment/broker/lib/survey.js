// Turning Robin's spoken survey into a row.
//
// We do NOT ask whether she resolved the caller's problem. The grader already determines that from
// the transcript, per question, with a reason when she couldn't — so asking would spend the
// caller's patience re-collecting a fact we compute for free. The survey asks only what the caller
// alone can tell us: whether they felt understood, whether they'd choose the agent again, and what
// would have made it better.
//
// The answers arrive as ElevenLabs Data Collection fields — an LLM reading the transcript and
// filling in fields we defined. That means free text, every time: "5", "five", "four out of five",
// "Yes", "yeah definitely", "they said no". Nothing here can assume a clean value.
//
// Deliberately NOT a mid-call tool. The answers are in the transcript, we don't need them during
// the call, and postcall.js already parses data_collection_results. A tool would add latency and a
// new way for the conversation itself to break, for nothing.
//
// Pure — no network, no env. Testable without an API key.

const YES = ["yes", "yeah", "yep", "yup", "sure", "true", "y", "1", "affirmative", "agreed",
             "accepted", "consented", "ok", "okay", "correct", "definitely", "absolutely"];
const NO  = ["no", "nope", "nah", "false", "n", "0", "declined", "refused", "denied",
             "negative", "did not", "didn't", "not offered", "never"];

// true / false / null. Null means "we genuinely don't know", which is different from false and
// must stay different — a caller who was never asked has not declined.
export function boolish(v) {
  if (typeof v === "boolean") return v;
  const n = String(v ?? "").trim().toLowerCase();
  if (!n) return null;
  // Check NO first: "not offered" and "didn't" contain no yes-token, but "no problem" would
  // match a naive yes-scan, and several no-phrases embed a yes-word ("no, that's ok").
  for (const w of NO) if (n === w || n.startsWith(w + " ") || n.includes(" " + w + " ")) return false;
  for (const w of YES) if (n === w || n.startsWith(w + " ") || n.includes(" " + w + " ")) return true;
  // Loose substring pass, for phrasings the word-boundary scan misses ("unresolved-ish" wording,
  // punctuation runs). Single-character tokens are excluded here on purpose: "n" matches the middle
  // of "unclear" and "y" matches "yesterday", which would turn "we don't know" into a hard answer.
  const loose = (list) => list.filter((w) => w.length > 1).some((w) => n.includes(w));
  if (loose(NO)) return false;
  if (loose(YES)) return true;
  return null;
}

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

// A 1-5 rating out of whatever the model wrote. Anything outside 1-5 is discarded rather than
// clamped: a "7" means the question was misheard or misanswered, and inventing a 5 from it would
// quietly inflate the score — the exact failure we removed from the article critic.
export function ratingFrom(v) {
  const raw = String(v ?? "").trim().toLowerCase();
  if (!raw) return null;
  const digit = raw.match(/\b([1-9]\d?)\b/);
  if (digit) {
    const n = Number(digit[1]);
    return n >= 1 && n <= 5 ? n : null;
  }
  for (const [w, n] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b`).test(raw)) return n;
  return null;
}

// "Next time, would you rather sort this out with me, or wait for a person?"
// Order matters: a person-answer often contains a you-word ("I'd rather a person than you"), and
// "either" must win over both. Checked most-specific first.
const PREF_NONE   = ["either", "no preference", "don't mind", "doesn't matter", "dont mind",
                     "no difference", "whatever", "both fine", "not fussed"];
const PREF_PERSON = ["person", "human", "someone", "somebody", "real", "rep", "representative",
                     "agent on the phone", "wait", "live"];
const PREF_AGENT  = ["you", "this", "yourself", "robin", "the assistant", "automated", "ai",
                     "again", "quicker", "faster"];

export function preferenceFrom(v) {
  const n = String(v ?? "").trim().toLowerCase();
  if (!n) return null;
  const has = (list) => list.some((w) => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(n));
  if (has(PREF_NONE)) return "no_preference";
  if (has(PREF_PERSON)) return "person";
  if (has(PREF_AGENT)) return "agent";
  return null;
}

// An open question invites anything, and it lands in a database as free text. The scale fields
// carry no such risk, which is why only this one gets scanned. If it trips we keep the FACT that
// something was said and redacted — so the rate is visible — and drop the words themselves.
//
// The Knowledge Factory has a fuller version of this scan, but it lives in a different Vercel
// project and Vercel only builds what's inside a project's root directory, so it cannot be
// imported. These are the patterns that matter for a spoken sentence.
const SSN_RE      = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/;
const SSN_WORDS   = /\bsocial security\b/i;
const LONG_DIGITS = /\b\d{9,}\b/;                       // account / card / member runs
const CARD_RE     = /\b(?:\d[ -]*?){13,19}\b/;
const VERBATIM_MAX = 600;

export function scrubVerbatim(v) {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { text: null, redacted: false };
  if (SSN_RE.test(t) || SSN_WORDS.test(t) || LONG_DIGITS.test(t) || CARD_RE.test(t))
    return { text: null, redacted: true };
  return { text: t.slice(0, VERBATIM_MAX), redacted: false };
}

const CONSENT = new Set(["accepted", "declined", "not_offered"]);

// Normalise the survey_consent field into the three states the table allows.
export function consentState(v, offered) {
  const n = String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (CONSENT.has(n)) return n;
  if (n.includes("accept") || n.includes("agree")) return "accepted";
  if (n.includes("declin") || n.includes("refus")) return "declined";
  if (n.includes("not_offer") || n.includes("no_offer")) return "not_offered";
  const b = boolish(v);
  if (b === true) return "accepted";
  if (b === false) return "declined";
  return offered ? "accepted" : "not_offered";
}

// Build the row, or null when no survey happened on this call.
//
// `pick` is postcall.js's Data Collection reader: name -> value | null.
// A row is written when the survey was OFFERED or any answer came back. "Offered and declined" is
// a real, useful datum — it's the denominator for how often people agree to be asked. A call where
// she never offered writes nothing, so the table stays a record of survey moments rather than of
// every call.
export function parseSurvey(pick, { conversation_id, subject_ref = null } = {}) {
  const offered = boolish(pick("survey_offered"));
  const csat = ratingFrom(pick("csat"));
  const understood = ratingFrom(pick("understood"));
  const prefer_agent = preferenceFrom(pick("prefer_agent"));
  const callback_consent = boolish(pick("callback_consent"));
  const rawConsent = pick("survey_consent");
  const { text: improve_verbatim, redacted: improve_redacted } = scrubVerbatim(pick("improve_verbatim"));

  const answered = csat != null || understood != null || prefer_agent != null ||
                   callback_consent != null || improve_verbatim != null || improve_redacted;
  if (offered !== true && !answered && rawConsent == null) return null;

  const survey_consent = consentState(rawConsent, offered === true || answered);
  const window = String(pick("callback_window") ?? "").trim();

  return {
    conversation_id,
    subject_ref,
    survey_offered: offered ?? answered,     // if they answered, it was plainly offered
    survey_consent,
    csat,
    understood,
    prefer_agent,
    improve_verbatim,
    improve_redacted,
    callback_consent,
    // A window is only meaningful alongside consent. Storing "next week" next to a refusal would
    // read, to anyone building the dialer later, like permission.
    callback_window: callback_consent === true && window ? window.slice(0, 200) : null,
  };
}
