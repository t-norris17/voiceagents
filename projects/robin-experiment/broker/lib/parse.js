// Input normalizers for spoken phone input (member ID + date of birth).
// Callers say "one zero zero zero one" or "January 1st 1962" — normalize both.

const NUMWORDS = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};

// Convert spoken number-words in a string to digits: "one zero" -> "10".
function wordsToDigits(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[a-z]+/g, (w) => (w in NUMWORDS ? NUMWORDS[w] : w));
}

// Member ID normalizer -> a plain digit string (Member IDs are 5-digit numbers).
// Accepts "10002", "1 0 0 0 2", "one zero zero zero two".
export function normMemberId(raw) {
  const digits = wordsToDigits(raw).replace(/\D/g, "");
  return digits || null;
}

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

// Parse a DOB from many spoken/typed forms into { y, m, d }, or null.
export function parseDob(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();

  // ISO: 1962-01-01
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };

  // US: 01/01/1962 or 1/1/62
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) return { y: normYear(+m[3]), m: +m[1], d: +m[2] };

  // Month name: "january 1 1962", "jan 1st, 1962"
  m = s.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/);
  if (m && MONTHS[m[1]]) return { y: normYear(+m[3]), m: MONTHS[m[1]], d: +m[2] };

  return null;
}

function normYear(y) {
  if (y >= 1000) return y;
  return y <= 25 ? 2000 + y : 1900 + y; // 2-digit year heuristic
}

// Compare a spoken DOB to a stored ISO date string (YYYY-MM-DD).
export function sameDob(spoken, storedIso) {
  const a = parseDob(spoken);
  if (!a || !storedIso) return false;
  const [y, mo, d] = storedIso.split("-").map(Number);
  return a.y === y && a.m === mo && a.d === d;
}

export function dollars(cents) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
}
