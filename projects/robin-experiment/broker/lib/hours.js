// Call center hours and the after-hours callback promise, computed in the call center's own time zone.
//
// WHY THIS IS CODE AND NOT A PROMPT LINE. When the call center is closed, Robin files a callback
// request and tells the caller when to expect the call. A model is unreliable at time-zone and
// business-hour arithmetic, and an hours line in the prompt goes stale on the first holiday. So the
// broker decides (open or closed), computes the deadline, and phrases it; Robin only reads the sentence.
// Spec: projects/robin-portal/requests/SPEC.md.
//
// Hours confirmed by the call center on 2026-10-05: Monday to Friday, 8 AM to 6 PM Central; Saturday and
// Sunday closed; closed on all federal holidays. The callback promise (8 business hours) is still a
// placeholder until the business sets the real SLA.
//
// Resolution is one minute: seconds on the input are dropped, so a deadline can land up to 59 seconds
// early, never late.

export const HOURS = {
  timeZone: "America/Chicago",
  zoneLabel: "Central",
  // ISO weekday (1 = Monday ... 7 = Sunday) -> [open, close) in minutes after local midnight.
  // A weekday that is absent is closed all day.
  week: {
    1: [8 * 60, 18 * 60],
    2: [8 * 60, 18 * 60],
    3: [8 * 60, 18 * 60],
    4: [8 * 60, 18 * 60],
    5: [8 * 60, 18 * 60],
  },
  callbackBusinessMinutes: 8 * 60,
  // "federal-reserve": a holiday on Sunday moves to Monday; a holiday on Saturday is not moved (banks
  // follow this calendar). "opm": the federal-employee calendar, which also moves a Saturday holiday to
  // the Friday before.
  holidayRule: "federal-reserve",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const partsFormatters = new Map();
function formatterFor(timeZone) {
  if (!partsFormatters.has(timeZone)) {
    partsFormatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric",
    }));
  }
  return partsFormatters.get(timeZone);
}

// The wall-clock date and minute-of-day of an instant in a time zone.
export function localParts(date, timeZone = HOURS.timeZone) {
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  return { y, m, d, minutes: Number(p.hour) * 60 + Number(p.minute), isoDow: isoDow(y, m, d) };
}

// The instant at which the given wall-clock time happens in a time zone. Two correction passes settle
// the offset on either side of a daylight-saving change; every opening hour is far from 2 AM anyway.
export function zonedToUtc(y, m, d, minutes, timeZone = HOURS.timeZone) {
  const want = Date.UTC(y, m - 1, d, 0, minutes);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t), timeZone);
    t += want - Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes);
  }
  return new Date(t);
}

function isoDow(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

function addDays(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const key = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// The n-th given weekday (0 = Sunday) of a month; n = -1 is the last one.
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((last - weekday + 7) % 7);
}

const holidayCache = new Map();

// Observed federal holidays falling in a calendar year, as "YYYY-MM-DD" keys.
export function federalHolidays(year, rule = HOURS.holidayRule) {
  const cacheKey = `${year}:${rule}`;
  if (holidayCache.has(cacheKey)) return holidayCache.get(cacheKey);
  const out = new Set();
  const fixed = (y, m, d) => {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0) { const n = addDays(y, m, d, 1); out.add(key(n.y, n.m, n.d)); }
    else if (dow === 6) { if (rule === "opm") { const p = addDays(y, m, d, -1); out.add(key(p.y, p.m, p.d)); } }
    else out.add(key(y, m, d));
  };
  // Fixed-date holidays of this year, plus next New Year's Day, whose Friday-before (opm rule) can
  // land on December 31 of this year.
  for (const [y, m, d] of [[year, 1, 1], [year, 6, 19], [year, 7, 4], [year, 11, 11], [year, 12, 25], [year + 1, 1, 1]]) {
    fixed(y, m, d);
  }
  out.add(key(year, 1, nthWeekday(year, 1, 1, 3)));   // Birthday of Martin Luther King Jr.: 3rd Monday of January
  out.add(key(year, 2, nthWeekday(year, 2, 1, 3)));   // Washington's Birthday: 3rd Monday of February
  out.add(key(year, 5, nthWeekday(year, 5, 1, -1)));  // Memorial Day: last Monday of May
  out.add(key(year, 9, nthWeekday(year, 9, 1, 1)));   // Labor Day: 1st Monday of September
  out.add(key(year, 10, nthWeekday(year, 10, 1, 2))); // Columbus Day: 2nd Monday of October
  out.add(key(year, 11, nthWeekday(year, 11, 4, 4))); // Thanksgiving: 4th Thursday of November
  const inYear = new Set([...out].filter((k) => k.startsWith(`${year}-`)));
  holidayCache.set(cacheKey, inYear);
  return inYear;
}

function openWindow(y, m, d, cfg) {
  if (federalHolidays(y, cfg.holidayRule).has(key(y, m, d))) return null;
  return cfg.week[isoDow(y, m, d)] || null;
}

export function isOpen(now, cfg = HOURS) {
  const p = localParts(now, cfg.timeZone);
  const w = openWindow(p.y, p.m, p.d, cfg);
  return !!w && p.minutes >= w[0] && p.minutes < w[1];
}

// Walk forward from `now` through open hours only, and return the instant at which `budget` minutes of
// open time have passed. Called after hours, that is the next opening plus the callback promise.
export function callbackDue(now, cfg = HOURS, budget = cfg.callbackBusinessMinutes) {
  let { y, m, d, minutes: cursor } = localParts(now, cfg.timeZone);
  let left = budget;
  for (let i = 0; i < 400; i++) {
    const w = openWindow(y, m, d, cfg);
    if (w) {
      const start = Math.max(cursor, w[0]);
      if (start < w[1]) {
        const take = Math.min(left, w[1] - start);
        left -= take;
        if (left <= 0) return zonedToUtc(y, m, d, start + take, cfg.timeZone);
      }
    }
    ({ y, m, d } = addDays(y, m, d, 1));
    cursor = 0;
  }
  throw new Error("callbackDue: no open hours found in the next 400 days; check HOURS.week");
}

// The next instant the call center is open (now, if it is open now).
export function nextOpen(now, cfg = HOURS) {
  if (isOpen(now, cfg)) return new Date(now);
  let { y, m, d, minutes: cursor } = localParts(now, cfg.timeZone);
  for (let i = 0; i < 400; i++) {
    const w = openWindow(y, m, d, cfg);
    if (w && cursor < w[0]) return zonedToUtc(y, m, d, w[0], cfg.timeZone);
    ({ y, m, d } = addDays(y, m, d, 1));
    cursor = -1;
  }
  throw new Error("nextOpen: no open hours found in the next 400 days; check HOURS.week");
}

// The sentence Robin reads: "by Monday, October 5 at 4 PM Central". The date is always included so a
// promise made before a holiday weekend cannot be heard as the wrong Monday.
export function callbackByText(due, cfg = HOURS) {
  const p = localParts(due, cfg.timeZone);
  const h24 = Math.floor(p.minutes / 60), min = p.minutes % 60;
  const h12 = h24 % 12 || 12, ampm = h24 < 12 ? "AM" : "PM";
  const time = min ? `${h12}:${String(min).padStart(2, "0")} ${ampm}` : `${h12} ${ampm}`;
  const weekday = WEEKDAYS[p.isoDow % 7];
  return `by ${weekday}, ${MONTHS[p.m - 1]} ${p.d} at ${time} ${cfg.zoneLabel}`;
}

// What get_handoff_option returns: transfer while the call center is open; otherwise file a request,
// with the deadline already computed and phrased.
export function handoffOption(now = new Date(), cfg = HOURS) {
  if (isOpen(now, cfg)) return { mode: "transfer" };
  const due = callbackDue(now, cfg);
  return {
    mode: "request",
    next_open: nextOpen(now, cfg).toISOString(),
    due_at: due.toISOString(),
    callback_by_text: callbackByText(due, cfg),
  };
}

// The hours in plain words, for the Birdnest Requests page footer, so the page never carries its own
// copy of the hours: "Mon to Fri 8 AM to 6 PM Central, closed weekends and federal holidays".
const SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function clock(min) {
  const h24 = Math.floor(min / 60), m = min % 60, h12 = h24 % 12 || 12, ap = h24 < 12 ? "AM" : "PM";
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}
export function hoursText(cfg = HOURS) {
  const runs = [];
  for (let d = 1; d <= 7; d++) {
    const w = cfg.week[d];
    const last = runs[runs.length - 1];
    if (w && last && last.to === d - 1 && last.w[0] === w[0] && last.w[1] === w[1]) last.to = d;
    else if (w) runs.push({ from: d, to: d, w });
  }
  const open = runs.map((r) => `${SHORT[r.from]}${r.to > r.from ? ` to ${SHORT[r.to]}` : ""} ${clock(r.w[0])} to ${clock(r.w[1])}`).join(", ");
  const closedWeekend = !cfg.week[6] && !cfg.week[7];
  return `${open} ${cfg.zoneLabel}, closed ${closedWeekend ? "weekends and " : ""}federal holidays`;
}

// Open minutes between two instants: the same clock the callback promise runs on. A request filed
// Saturday night and called back Monday at 9:05 AM took 65 open minutes, not 35 hours.
export function openMinutesBetween(from, to, cfg = HOURS) {
  if (!(to > from)) return 0;
  let { y, m, d, minutes: cursor } = localParts(from, cfg.timeZone);
  const end = localParts(to, cfg.timeZone);
  const endKey = key(end.y, end.m, end.d);
  let total = 0;
  for (let i = 0; i < 400; i++) {
    const w = openWindow(y, m, d, cfg);
    const last = key(y, m, d) === endKey;
    if (w) {
      const a = Math.max(cursor, w[0]);
      const b = last ? Math.min(end.minutes, w[1]) : w[1];
      if (b > a) total += b - a;
    }
    if (last) return total;
    ({ y, m, d } = addDays(y, m, d, 1));
    cursor = 0;
  }
  return total;
}
