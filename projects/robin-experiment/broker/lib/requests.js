// After-hours callback requests: the pure logic shared by the two Robin tools, the post-call safety net
// and the Birdnest queue. No I/O in here, so every rule is unit-tested (test/requests.test.mjs).
// Spec: projects/robin-portal/requests/SPEC.md.
import { HOURS, isOpen, localParts, openMinutesBetween } from "./hours.js";

// Which agents may write what. The post-call webhook is configured once for the whole ElevenLabs
// workspace, so every agent's calls arrive at /api/postcall, test agents included. Without this list a
// test agent's call would write a row into the live call table.
export const AGENTS = {
  robin: "agent_8301kwj5qa8ve1atremxxwjjp9f8",       // Robin, the phone line
  robin_web: "agent_0101m3sjqvfyejsa9kn127ez26mm",   // Robin (web demo): web voice and chat
};
// Calls from these agents are stored in ai_call_events (unchanged from before the allowlist: as of
// 2026-10-05 these two are the only agents with rows there, 213 and 13).
export const CALL_RECORD_AGENTS = new Set([AGENTS.robin, AGENTS.robin_web]);
// Only the phone agent files requests: a web caller has no number to call back.
export const REQUEST_AGENTS = new Set([AGENTS.robin]);

export const REQUEST_TYPES = ["loan", "distribution", "contribution_change", "beneficiary", "account_access", "speak_to_person", "other"];

// The model's wording for a request type, normalized into the table's vocabulary. Data Collection
// returns free text ("Loan request", "wants to take a loan"), so this is a contains-match like
// postcall's coerce(). An empty or "none" value means no request; anything else unrecognised is 'other'.
const TYPE_WORDS = [
  ["contribution_change", ["contribution", "deferral", "contribute"]],
  ["beneficiary", ["beneficiar"]],
  ["distribution", ["distribution", "withdraw", "rollover", "roll over", "cash out", "hardship"]],
  ["loan", ["loan"]],
  ["account_access", ["access", "password", "login", "log in", "locked", "username"]],
  ["speak_to_person", ["person", "human", "representative", "agent", "someone"]],
];
const NONE = new Set(["", "none", "null", "n/a", "na", "no", "no request", "false", "nothing", "not applicable"]);

export function normalizeRequestType(v) {
  const n = String(v ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (NONE.has(n)) return null;
  const exact = n.replace(/ /g, "_");
  if (REQUEST_TYPES.includes(exact)) return exact;
  for (const [type, words] of TYPE_WORDS) if (words.some((w) => n.includes(w))) return type;
  return "other";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID.test(v.trim());

// Free text from the model, trimmed and bounded. A request detail is a sentence or two; nothing a
// caller says should become a 50 KB row.
export function clip(v, max = 1000) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

// A phone number as the caller stated it, reduced to digits and a leading +. Ten digits are taken as a
// US number. Anything that is not 10 to 15 digits is rejected (null) rather than stored as a number a
// rep would dial wrong.
export function normalizePhone(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (s.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

// Pull the file_request result out of a post-call transcript. The transcript records what each tool
// RETURNED (tool_results[].result_value, a JSON string), which is the only place the broker can learn
// which conversation a tool-filed request belongs to: the tool runs before the conversation id reaches
// the broker. The last successful call wins (a retry after an error files once).
export function filedRequestId(transcript) {
  if (!Array.isArray(transcript)) return null;
  let found = null;
  for (const turn of transcript) {
    for (const r of Array.isArray(turn?.tool_results) ? turn.tool_results : []) {
      if (r?.tool_name !== "file_request" || r?.is_error) continue;
      let v = r.result_value;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
      if (v && v.ok === true && isUuid(v.request_id)) found = v.request_id.trim();
    }
  }
  return found;
}

// The sentence get_handoff_option gave Robin on this call, if it ran and said "request". Used as the
// promised text on a safety-net row, so the drawer can show what the caller heard before hanging up.
export function handoffPromise(transcript) {
  if (!Array.isArray(transcript)) return null;
  let found = null;
  for (const turn of transcript) {
    for (const r of Array.isArray(turn?.tool_results) ? turn.tool_results : []) {
      if (r?.tool_name !== "get_handoff_option" || r?.is_error) continue;
      let v = r.result_value;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
      if (v && v.mode === "request" && typeof v.callback_by_text === "string") found = v.callback_by_text;
    }
  }
  return found;
}

// Should the post-call webhook file a request itself? Only when the tool did not, the agent files
// requests, the call was a phone call (there is a number to call back), Data Collection names a
// request, and the call started while the call center was closed, or while the test window
// (forcedClosed) is open, in which case the row is a test row.
export function safetyNetDecision({ agentId, requestType, externalNumber, startedAt, linked, env = process.env, cfg = HOURS, now = new Date() }) {
  const forced = forcedClosed(env, now);
  if (linked) return { file: false, why: "already filed by the tool" };
  if (!REQUEST_AGENTS.has(agentId)) return { file: false, why: "agent does not file requests" };
  const type = normalizeRequestType(requestType);
  if (!type) return { file: false, why: "no request named in Data Collection" };
  if (!normalizePhone(externalNumber)) return { file: false, why: "no callback number (not a phone call)" };
  const start = startedAt ? new Date(startedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return { file: false, why: "no call start time" };
  if (!forced && isOpen(start, cfg)) return { file: false, why: "call was during open hours" };
  return { file: true, type, isTest: forced };
}

// THE TEST WINDOW. While REQUESTS_FORCE_CLOSED_UNTIL (an ISO timestamp) is in the future, the broker
// answers as if the call center were closed, so the after-hours path can be tested on Robin's real
// phone line during the day. It switches itself off at that time, so it cannot be left on by accident
// (left on, Robin would never transfer anyone). A value more than MAX_FORCE_HOURS ahead is ignored, so
// a typo in the year cannot turn it into a permanent state. Requests filed inside it are test rows.
export const MAX_FORCE_HOURS = 12;
export function forcedClosed(env = process.env, now = new Date()) {
  const raw = env.REQUESTS_FORCE_CLOSED_UNTIL;
  if (!raw) return false;
  const until = new Date(raw);
  if (Number.isNaN(until.getTime())) return false;
  const ahead = until.getTime() - now.getTime();
  return ahead > 0 && ahead <= MAX_FORCE_HOURS * 3600e3;
}

// A row is a test row when a preview broker filed it, or when it was filed inside the test window.
export function isTestFiling(env = process.env, now = new Date()) {
  return env.VERCEL_ENV !== "production" || forcedClosed(env, now);
}

// ---- The queue ---------------------------------------------------------------------------------

const ATTEMPTS = new Set(["reached", "voicemail", "no_answer"]);

// First callback attempt, derived from history, never stored.
export function firstAttempt(events) {
  let first = null;
  for (const e of events || []) {
    if (!ATTEMPTS.has(e.kind)) continue;
    if (!first || new Date(e.at) < new Date(first.at)) first = e;
  }
  return first;
}

// The dot. red: past due with no attempt. amber: due today (Central) with no attempt. green: first
// attempt on time. late: first attempt after the deadline. none: nothing due yet.
export function slaState(req, events, now = new Date(), cfg = HOURS) {
  const due = new Date(req.due_at);
  const first = firstAttempt(events);
  if (first) return new Date(first.at) <= due ? "green" : "late";
  if (req.status === "closed") return "closed";
  if (now > due) return "red";
  const a = localParts(now, cfg.timeZone), b = localParts(due, cfg.timeZone);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return "amber";
  return "none";
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// The stat row. "This month" and "today" are Central calendar days, the call center's own.
export function queueStats(requests, eventsById, now = new Date(), cfg = HOURS) {
  const today = localParts(now, cfg.timeZone);
  let open = 0, overdue = 0, dueToday = 0, doneThisMonth = 0;
  const minutesToFirst = [];
  for (const r of requests) {
    const ev = eventsById[r.id] || [];
    const state = slaState(r, ev, now, cfg);
    if (r.status === "open") {
      open++;
      if (state === "red") overdue++;
      if (state === "amber") dueToday++;
    } else if (r.closed_at) {
      const c = localParts(new Date(r.closed_at), cfg.timeZone);
      if (c.y === today.y && c.m === today.m) doneThisMonth++;
    }
    const first = firstAttempt(ev);
    // Open minutes, not wall-clock: the promise is in business hours, so the measure is too.
    if (first) minutesToFirst.push(openMinutesBetween(new Date(r.filed_at), new Date(first.at), cfg));
  }
  const med = median(minutesToFirst);
  return { open, overdue, due_today: dueToday, done_this_month: doneThisMonth,
    median_open_minutes_to_first_attempt: med == null ? null : Math.round(med) };
}

// What a person may do from Birdnest, and the history kind each becomes.
export const ACTIONS = { reached: "reached", voicemail: "voicemail", no_answer: "no_answer", note: "note", close: "closed", reopen: "reopened" };
