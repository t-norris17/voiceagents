// POC mock tools for the ElevenLabs account-recovery demo.
//
// Deploy to a SCRATCH Vercel project — NOT wealth-command. Throwaway demo scaffolding:
// in-memory state, synthetic data only, no real member PII, no auth hardening.
//
// Demo flow: verify caller (SSN + address) -> send reset link to email on file -> document.
//
// Routes (register each as an ElevenLabs webhook tool):
//   POST /api/poc/verify_caller       { name, dob, last4_ssn, zip }   -> { verified, subject_ref }
//   POST /api/poc/send_reset_email    { subject_ref }                 -> { sent, delivered_to }
//   POST /api/poc/document_resolution { subject_ref, outcome, notes } -> { logged, ticket_id }
//
// Real email in the room (recommended): set RESET_LINK + an email provider in sendEmail().
// The "email on file" is the boss's own inbox for the demo — set DEMO_EMAIL.

// Synthetic test identity. SSN is in the 900-range = never issued (invalid by design).
const TEST_IDENTITY = {
  name: "michael reynolds",
  dob: "1968-04-12",
  last4_ssn: "0123",
  zip: "67202",
  subject_ref: "poc-subject-001",
  email_on_file: process.env.DEMO_EMAIL || "demo@example.com", // set to the boss's inbox
};

const RESET_LINK = process.env.RESET_LINK || "https://example.retirement/login";

const resolutions = []; // audit of documented resolutions
let seq = 0;
const id = (p) => `${p}_${++seq}`;
const norm = (s) => String(s || "").trim().toLowerCase();

async function sendEmail(to, subject, body) {
  // POC: wire your email provider here (Resend/SendGrid/SES). No-op stub if unset.
  if (!process.env.EMAIL_PROVIDER) return { mocked: true, to };
  // e.g. await resend.emails.send({ to, from, subject, html: body })
  return { mocked: false, to };
}

const handlers = {
  async verify_caller({ name, dob, last4_ssn, zip }) {
    const ok =
      norm(name) === TEST_IDENTITY.name &&
      norm(dob) === TEST_IDENTITY.dob &&
      norm(last4_ssn) === TEST_IDENTITY.last4_ssn &&
      norm(zip) === TEST_IDENTITY.zip;
    // Lenient fallback for the demo: SSN + ZIP alone is enough (in case DOB read varies).
    const lenient =
      norm(last4_ssn) === TEST_IDENTITY.last4_ssn && norm(zip) === TEST_IDENTITY.zip;
    return ok || lenient
      ? { verified: true, subject_ref: TEST_IDENTITY.subject_ref }
      : { verified: false };
  },

  async send_reset_email({ subject_ref }) {
    const to = TEST_IDENTITY.email_on_file;
    await sendEmail(
      to,
      "Reset your password",
      `Click to reset your password: ${RESET_LINK}  (click "Log In" first to reveal the reset field)`
    );
    // Return only a masked address — never echo full PII to the agent.
    const masked = to.replace(/^(.).*(@.*)$/, "$1***$2");
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
