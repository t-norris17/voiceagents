// What a row on the Interactions list says at a glance. Pure, so it is unit-tested.
//
// The dot is the first thing a reader scans, so it carries the one question a manager has: does this
// one need me?
//   bad   a security flag, or the caller could not be verified
//   warn  Robin handed it to a person (worth a look: it is where she fell short or the caller asked)
//   ok    the caller was verified and nothing above applies
//   none  nothing known yet (verification never attempted, or the data is missing)
export function dotOf(c) {
  if (c.security_flag || c.auth_outcome === "failed") return "bad";
  if (c.outcome === "transferred") return "warn";
  if (c.auth_outcome === "verified") return "ok";
  return "none";
}

export const needsLook = (c) => { const d = dotOf(c); return d === "bad" || d === "warn"; };

export const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "needs", label: "Needs a look", test: needsLook },
  { key: "phone", label: "Phone", test: (c) => c.channel === "phone" },
  { key: "web_voice", label: "Web voice", test: (c) => c.channel === "web_voice" },
  { key: "chat", label: "Web chat", test: (c) => c.channel === "chat" },
  { key: "ungraded", label: "Not graded", test: (c) => !c.scored_at },
];

// Topics are free text written by the model and some are whole sentences; the list shows a line.
export function topicOf(c, max = 72) {
  const t = String(c.topic || "").trim();
  if (!t) return "Interaction";
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}
