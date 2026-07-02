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

const RESET_PAGE_URL = process.env.RESET_PAGE_URL || "https://example.vercel.app/reset";
const RESEND_FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

const resolutions = []; // in-memory audit of documented resolutions
let seq = 0;
const id = (p) => `${p}_${++seq}`;
const digits = (s) => String(s || "").replace(/\D/g, "");
const byRef = (ref) => IDENTITIES.find((i) => i.subject_ref === ref);
// Demo-lenient DOB match: compare the multiset of digits so "1968-04-12" and "04/12/1968"
// both match, regardless of how the agent formats the spoken date. Fine for 2 fixed identities.
const dobKey = (s) => digits(s).split("").sort().join("");

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
      (i) => digits(last4_ssn) === i.last4_ssn && dobKey(dob) === dobKey(i.dob)
    );
    if (!found) return { verified: false };
    return {
      verified: true,
      subject_ref: found.subject_ref,
      has_email_on_file: Boolean(found.email_on_file),
    };
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
