// POST /api/handoff_option  (Robin's get_handoff_option tool)  ->  one of
//   { mode: "transfer" }
//   { mode: "request", next_open, due_at, callback_by_text }
//
// Robin calls this when a caller needs a person, BEFORE transferring. While the call center is open the
// answer is "transfer" and nothing about her in-hours behavior changes. When it is closed she files a
// callback request instead and reads callback_by_text ("by Monday, October 5 at 4 PM Central") to the
// caller. The hours, holidays and deadline math live in lib/hours.js, not in the prompt.
//
// Read-only, but behind the tool secret anyway: it is one of a pair with file_request and costs nothing.
import { handoffOption, callbackDue, callbackByText } from "../lib/hours.js";
import { forcedClosed } from "../lib/requests.js";
import { toolSecretCheck } from "../lib/tool-secret.js";

// What a preview broker answers with REQUESTS_FORCE_CLOSED=1 while the call center is actually open:
// "closed right now", with the deadline counted from now. Production ignores the flag (forcedClosed).
export function answer(now = new Date(), env = process.env) {
  const real = handoffOption(now);
  if (real.mode === "request" || !forcedClosed(env)) return real;
  const due = callbackDue(now);
  return { mode: "request", next_open: now.toISOString(), due_at: due.toISOString(), callback_by_text: callbackByText(due), forced_closed: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "POST only" });
  const denied = toolSecretCheck(req.headers);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  try {
    return res.status(200).json(answer());
  } catch (e) {
    // What Robin says on an error is set in her prompt (Phase 5), not here.
    console.error("handoff_option error:", String(e.message || e));
    return res.status(500).json({ error: String(e.message || e) });
  }
}
