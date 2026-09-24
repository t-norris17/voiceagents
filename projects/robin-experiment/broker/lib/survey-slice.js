// The slice: which calls the Quality page is looking at. One definition, parsed once from the query
// string, applied to rows in memory, so /api/metrics, the themes, the Ask box and the CSV can never
// disagree about what "this week" or "first wave" means.
//
// URL grammar (the `range` parameter):
//   wave:<key>              one row of experiment_waves, e.g. wave:first, wave:internal
//   week | month | year     this week (from Monday), this month, this year, in Central time
//   all                     every surveyed call there is
//   YYYY-MM-DD..YYYY-MM-DD  a custom range, both days inclusive, Central midnight boundaries
// and `staff=show` to include the build team's own calls, which are hidden otherwise.
//
// Everything is Central time because the experiment is run from Kansas and the waves were declared
// in Central: "Sep 21 to 23" means midnight to midnight there, whatever the server's clock says.
//
// TEMPORARY: delete with the instrument after the customer wave.

export const TZ = "America/Chicago";

// Wall-clock parts of an instant in Central.
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
});
export function centralParts(date) {
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour), mi: Number(p.minute), s: Number(p.second),
    // Monday = 1 ... Sunday = 7, so "start of week" is one subtraction.
    dow: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday],
  };
}

// The instant that is midnight in Central on the given calendar day. Two passes converge across a
// DST change: the first guess assumes UTC, the correction is the observed offset at that guess.
export function centralMidnight(y, m, d) {
  const want = Date.UTC(y, m - 1, d, 0, 0, 0);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = centralParts(new Date(t));
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    t += want - seen;
  }
  return new Date(t);
}

const addDays = (date, n) => new Date(date.getTime() + n * 86400000);
const iso = (d) => (d ? d.toISOString() : null);
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayOf(s) {
  const m = DAY.exec(String(s || "").trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(date, withYear) {
  const p = centralParts(date);
  return `${MONTHS[p.m - 1]} ${p.d}${withYear ? `, ${p.y}` : ""}`;
}
// "Sep 21 to 23, 2026" for a window whose end is exclusive midnight; "Sep 21, 2026" for one day.
export function windowLabel(from, to) {
  if (!from && !to) return "All time";
  if (from && !to) return `Since ${dayLabel(from, true)}`;
  const last = addDays(to, -1);
  const a = centralParts(from), b = centralParts(last);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return dayLabel(from, true);
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d} to ${b.d}, ${a.y}`;
  if (a.y === b.y) return `${dayLabel(from, false)} to ${dayLabel(last, true)}`;
  return `${dayLabel(from, true)} to ${dayLabel(last, true)}`;
}

// waves: rows of experiment_waves ({wave, label, internal, started_at, ended_at}). now: a Date.
export function parseSlice(query = {}, { waves = [], now = new Date() } = {}) {
  const raw = String(query.range ?? "").trim().toLowerCase();
  const staff = ["show", "1", "true", "yes"].includes(String(query.staff ?? "").trim().toLowerCase()) ? "shown" : "hidden";
  const base = { staff, param: raw, valid: true };

  const waveRow = (key) => waves.find((w) => String(w.wave).toLowerCase() === key);
  const fromWave = (w) => ({
    ...base, kind: "wave", key: w.wave, label: w.label || w.wave, internal: !!w.internal,
    from: w.started_at ? new Date(w.started_at).toISOString() : null,
    to: w.ended_at ? new Date(w.ended_at).toISOString() : null,
    param: `wave:${w.wave}`,
  });

  // Default: the newest wave that is not internal testing; failing that, everything.
  if (!raw) {
    const real = waves.filter((w) => !w.internal).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    if (real.length) return { ...fromWave(real[0]), param: `wave:${real[0].wave}`, defaulted: true };
    return { ...base, kind: "all", key: "all", label: "All time", from: null, to: null, param: "all", defaulted: true };
  }

  if (raw === "all") return { ...base, kind: "all", key: "all", label: "All time", from: null, to: null, param: "all" };

  if (raw.startsWith("wave:")) {
    const w = waveRow(raw.slice(5));
    if (w) return fromWave(w);
    return { ...base, kind: "all", key: "all", label: "All time", from: null, to: null, param: "all", valid: false, error: `no wave named ${raw.slice(5)}` };
  }

  const p = centralParts(now);
  if (raw === "week") {
    const from = centralMidnight(p.y, p.m, p.d - (p.dow - 1));
    return { ...base, kind: "preset", key: "week", label: "This week", from: iso(from), to: null, param: "week" };
  }
  if (raw === "month") {
    const from = centralMidnight(p.y, p.m, 1);
    return { ...base, kind: "preset", key: "month", label: "This month", from: iso(from), to: null, param: "month" };
  }
  if (raw === "year") {
    const from = centralMidnight(p.y, 1, 1);
    return { ...base, kind: "preset", key: "year", label: "This year", from: iso(from), to: null, param: "year" };
  }

  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (m) {
    const a = dayOf(m[1]), b = dayOf(m[2]);
    if (a && b) {
      let from = centralMidnight(a.y, a.m, a.d), to = addDays(centralMidnight(b.y, b.m, b.d), 1);
      if (to <= from) [from, to] = [addDays(to, -1), addDays(from, 1)]; // reversed dates still mean the same days
      return { ...base, kind: "custom", key: "custom", label: windowLabel(from, to), from: iso(from), to: iso(to), param: `${m[1]}..${m[2]}` };
    }
  }

  return { ...base, kind: "all", key: "all", label: "All time", from: null, to: null, param: "all", valid: false, error: `unrecognised range ${raw}` };
}

// Rows are survey_answers rows (started_at ISO, is_staff boolean). from inclusive, to exclusive.
export function inSlice(row, slice) {
  if (slice.staff !== "shown" && row.is_staff === true) return false;
  const t = String(row.started_at || "");
  if (!t) return false;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return false;
  if (slice.from && ms < Date.parse(slice.from)) return false;
  if (slice.to && ms >= Date.parse(slice.to)) return false;
  return true;
}
export const applySlice = (rows, slice) => (rows || []).filter((r) => inSlice(r, slice));

// The caption under the slicer: "First wave · Sep 21 to 23, 2026 · Central · staff hidden".
export function describeSlice(slice) {
  const from = slice.from ? new Date(slice.from) : null, to = slice.to ? new Date(slice.to) : null;
  const when = slice.kind === "all" ? "All time" : windowLabel(from, to);
  return {
    label: slice.label,
    when,
    tz: "Central",
    staff: slice.staff,
    param: slice.param,
    from: slice.from, to: slice.to,
  };
}
