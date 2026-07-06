// POC mock tools for the NestEgg U password-reset voice demo.
//
// Deploy to a SCRATCH Vercel project — NOT any production project. Throwaway demo
// scaffolding: in-memory state, synthetic identities only, no real member PII, no auth
// hardening.
//
// Locked demo flow (see ../SPEC.md):
//   verify caller (SSN last-4 + DOB) -> if email on file, send reset link via Resend;
//   if NOT, the agent transfers to a specialist -> document the resolution.
//
// Routes (register each as an ElevenLabs webhook tool):
//   POST /api/poc/verify_caller       { last4_ssn, dob }              -> { verified, subject_ref, has_email_on_file }
//   POST /api/poc/get_plan_details    { subject_ref }                 -> { found, plan, balance, outstanding_loan, ... }
//   POST /api/poc/send_reset_email    { subject_ref }                 -> { sent, delivered_to }
//   POST /api/poc/document_resolution { subject_ref, outcome, notes } -> { logged, ticket_id }
//
// Env vars (set in the Vercel project):
//   DEMO_EMAIL       presenter's own inbox = the "email on file" (the one real value allowed)
//   RESEND_API_KEY   Resend key so the reset email actually sends on stage
//   RESEND_FROM      verified sender (default: onboarding@resend.dev — fine for a quick demo)
//   RESET_PAGE_URL   URL of the mock /reset page the email links to

// Synthetic test identities. SSNs are in the 900-range = never issued (invalid by design).
const IDENTITIES = [
  {
    subject_ref: "poc-subject-001", // HAPPY PATH — has an email on file
    dob: "1968-04-12",
    last4_ssn: "0123",
    email_on_file: process.env.DEMO_EMAIL || "demo@example.com",
  },
  {
    subject_ref: "poc-subject-002", // TRANSFER BRANCH — no email on file
    dob: "1970-01-01",
    last4_ssn: "0000",
    email_on_file: null,
  },
];

// Per-participant plan data for the Vertex Manufacturing 401(k) Q&A (see ../../plan-kb/).
// Served ONLY by get_plan_details, keyed by subject_ref — never put per-person figures in the KB.
const PLAN_DETAILS = {
  "poc-subject-001": { // Michael Reynolds — fully vested, no loan
    plan: "Vertex Manufacturing 401(k)", age: 58, fully_vested: true,
    balance: 142350, vested_balance: 142350, outstanding_loan: false,
    max_loan_available: 50000, deferral_pct: 8, investment: "NestEgg Target Retirement 2035",
  },
  "poc-subject-002": { // Dana Osborne — partially vested, has a loan out
    plan: "Vertex Manufacturing 401(k)", age: 55, fully_vested: false,
    balance: 38200, vested_balance: 26100, outstanding_loan: true,
    max_loan_available: 0, deferral_pct: 5, investment: "NestEgg Target Retirement 2030",
  },
};

const RESET_PAGE_URL = process.env.RESET_PAGE_URL || "https://example.vercel.app/reset";
const RESEND_FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

const resolutions = []; // in-memory audit of documented resolutions
let seq = 0;
const id = (p) => `${p}_${++seq}`;
const digits = (s) => String(s || "").replace(/\D/g, "");
const byRef = (ref) => IDENTITIES.find((i) => i.subject_ref === ref);

// Over the phone, spoken digits often arrive as words ("oh one two three" for 0123).
// Map number-words to digits (other words become spaces) before extracting.
const NUMWORDS = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const wordsToDigits = (s) =>
  String(s || "").toLowerCase().replace(/[a-z]+/g, (w) => (w in NUMWORDS ? NUMWORDS[w] : " "));
// Last 4 of SSN, tolerant of spelled-out digits and a dropped leading zero.
const norm4 = (s) => digits(wordsToDigits(s)).slice(-4).padStart(4, "0");

// Parse a spoken/typed DOB into { y, mo, d }. Handles ISO (1968-04-12), US numeric
// (04/12/1968 or 4-12-1968), and month names ("April 12, 1968", "Apr 12 1968").
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
function parseDob(s) {
  s = String(s || "").trim().toLowerCase();
  let m = s.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/); // April 12, 1968
  if (m && MONTHS[m[1]]) return { y: +m[3], mo: MONTHS[m[1]], d: +m[2] };
  m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // 1968-04-12
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // 04/12/1968
  if (m) return { y: +m[3], mo: +m[1], d: +m[2] };
  return null;
}
const sameDob = (a, b) => {
  const x = parseDob(a), y = parseDob(b);
  return Boolean(x && y && x.y === y.y && x.mo === y.mo && x.d === y.d);
};

async function sendResetEmail(to) {
  const link = `${RESET_PAGE_URL}?token=${id("tok")}`;
  const html =
    `<p>We received a request to reset your NestEgg U password.</p>` +
    `<p><a href="${link}">Reset your password</a></p>` +
    `<p>If the page shows a login screen, click <b>Log In</b> first — the reset field appears right after.</p>`;
  if (!process.env.RESEND_API_KEY) return { mocked: true, link }; // no-op stub if unset
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject: "Reset your NestEgg U password", html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
  return { mocked: false, link };
}

const handlers = {
  async verify_caller({ last4_ssn, dob }) {
    const found = IDENTITIES.find(
      (i) => norm4(last4_ssn) === norm4(i.last4_ssn) && sameDob(dob, i.dob)
    );
    if (!found) return { verified: false };
    return {
      verified: true,
      subject_ref: found.subject_ref,
      has_email_on_file: Boolean(found.email_on_file),
    };
  },

  // Returns the verified caller's OWN plan figures for Q&A (call after verify_caller).
  // Plan RULES come from the Knowledge Base (RAG); this only supplies personal numbers.
  async get_plan_details({ subject_ref }) {
    const d = PLAN_DETAILS[subject_ref];
    if (!d) return { found: false };
    return { found: true, ...d };
  },

  async send_reset_email({ subject_ref }) {
    const who = byRef(subject_ref);
    if (!who || !who.email_on_file) {
      // No email on file — the agent should take the transfer branch, not call this.
      return { sent: false, reason: "no_email_on_file" };
    }
    await sendResetEmail(who.email_on_file);
    // Return only a masked address — never echo full PII back to the agent.
    const masked = who.email_on_file.replace(/^(.).*(@.*)$/, "$1***$2");
    return { sent: true, delivered_to: masked };
  },

  async document_resolution(payload) {
    const ticket_id = id("ticket");
    resolutions.push({ ticket_id, at: null, ...payload });
    return { logged: true, ticket_id };
  },
};

// Single Vercel serverless entry — route by ?tool= or last path segment.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const tool = (req.query.tool || req.url.split("/").pop() || "").split("?")[0];
  const fn = handlers[tool];
  if (!fn) return res.status(404).json({ error: `unknown tool: ${tool}` });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const result = await fn(body);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
