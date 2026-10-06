// How a callback request reads on the Requests page. Pure, so the wording is tested
// (test/request-view.test.mjs) rather than eyeballed. Every time is shown in the call center's own zone,
// which the broker sends with the data (hours.time_zone), never the viewer's browser zone.

export const TYPE_LABEL = {
  loan: "Loan",
  distribution: "Distribution",
  contribution_change: "Contribution",
  beneficiary: "Beneficiary",
  account_access: "Account access",
  speak_to_person: "Wants a person",
  other: "Other",
};

const fmtCache = new Map();
function fmt(timeZone, opts) {
  const k = timeZone + JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat("en-US", { timeZone, ...opts }));
  return fmtCache.get(k);
}
const dayKey = (d, tz) => fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// "4:00 PM"
export function timeOf(iso, tz) {
  return fmt(tz, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
// "Sat Oct 3, 9:42 PM"
export function stamp(iso, tz) {
  const d = new Date(iso);
  return `${fmt(tz, { weekday: "short", month: "short", day: "numeric" }).format(d).replace(",", "")}, ${timeOf(iso, tz)}`;
}
// "4:00 PM today", "Mon 4:00 PM", "Fri Oct 2, 4:00 PM" (more than six days away from now)
export function when(iso, tz, now = new Date()) {
  const d = new Date(iso);
  if (dayKey(d, tz) === dayKey(now, tz)) return `${timeOf(iso, tz)} today`;
  if (Math.abs(d - now) < 6 * 864e5) return `${fmt(tz, { weekday: "short" }).format(d)} ${timeOf(iso, tz)}`;
  return stamp(iso, tz);
}

// (316) 555-0142 for a US number; anything else as stored.
export function phone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 || "");
}

export function nameOf(r) {
  return r.caller_name || r.member?.first_name || "Unknown caller";
}

const ATTEMPT_WORD = { reached: "reached", voicemail: "voicemail", no_answer: "no answer" };
const firstAttemptEvent = (r) => (r.events || []).find((e) => e.at === r.first_attempt && ATTEMPT_WORD[e.kind]);

// The right-hand column of a row: a headline in the dot's colour and one line under it.
export function rowStatus(r, tz, now = new Date()) {
  const first = firstAttemptEvent(r);
  const attempt = first ? `${ATTEMPT_WORD[first.kind]} ${when(first.at, tz, now)}` : "no attempts";
  if (r.status === "closed") {
    return { cls: "", head: `Closed ${when(r.closed_at, tz, now)}`, line: first ? attempt : "closed without a logged callback" };
  }
  switch (r.sla) {
    case "red": return { cls: "bad", head: "Overdue", line: `was due ${when(r.due_at, tz, now)} · ${attempt}` };
    case "amber": return { cls: "due", head: `Call back by ${when(r.due_at, tz, now)}`, line: attempt };
    case "green": return { cls: "ok", head: "Called back on time", line: attempt };
    case "late": return { cls: "warn", head: "Called back late", line: `${attempt} · was due ${when(r.due_at, tz, now)}` };
    default: return { cls: "due", head: `Call back by ${when(r.due_at, tz, now)}`, line: attempt };
  }
}

// The dot class, from the same state the broker computed.
export function dotOf(r) {
  if (r.status === "closed") return "none";
  return { red: "bad", amber: "warn", green: "ok", late: "warn" }[r.sla] || "none";
}

export const FILTERS = [
  { key: "open", label: "Open", test: (r) => r.status === "open" },
  { key: "unverified", label: "Unverified", test: (r) => r.status === "open" && !r.verified },
  { key: "done", label: "Done", test: (r) => r.status === "closed" },
  { key: "all", label: "All", test: () => true },
];

export const EVENT_WORD = {
  filed: "Filed", linked: "Linked to its call", emailed: "In the morning email", reached: "Reached",
  voicemail: "Left voicemail", no_answer: "No answer", note: "Note", closed: "Closed", reopened: "Reopened",
};
const ACTOR_WORD = { robin: "Robin, during the call", system: "after the call" };
export function eventLine(e) {
  const who = ACTOR_WORD[e.actor] || null; // "birdnest" is the shared password: it cannot name a person
  return { what: EVENT_WORD[e.kind] || e.kind, who, note: e.note || null };
}

// "1h 05m", "3h 40m", "2d 4h"
export function duration(minutes) {
  if (minutes == null) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}
