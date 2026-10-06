// POST /api/file_request  (Robin's file_request tool)
//   { request_type, request_detail, subject_ref?, caller_name?, callback_window?, callback_number? }
//   ->  { ok: true, request_id, due_at, callback_by_text }
//   ->  { ok: false, mode: "transfer", reason }   when the call center is open (transfer instead)
//
// The primary writer of after-hours requests. Robin says "it's filed" only after this returns ok, so she
// never promises something that has not happened, and she reads callback_by_text from THIS answer: the
// deadline is computed here, at filing, and nothing the model passes sets it.
//
// The conversation id is not known here (the tool runs mid-call and no system variable is wired). The
// post-call webhook links this row to its conversation from the transcript's record of this tool's
// result (request_id), and fills the callback number from the call's caller ID.
import { sb } from "../lib/supabase.js";
import { callbackDue, callbackByText, isOpen } from "../lib/hours.js";
import { normalizeRequestType, isUuid, clip, normalizePhone, forcedClosed, isTestFiling } from "../lib/requests.js";
import { toolSecretCheck } from "../lib/tool-secret.js";

// The row, from the tool's body. Pure, so the rules are tested without a database.
export function buildRow(body, { now = new Date(), verifiedRef = null, env = process.env } = {}) {
  const due = callbackDue(now);
  const stated = normalizePhone(body?.callback_number);
  return {
    source: "tool",
    request_type: normalizeRequestType(body?.request_type) || "other",
    request_detail: clip(body?.request_detail),
    subject_ref: verifiedRef,
    verified: !!verifiedRef,
    caller_name: clip(body?.caller_name, 120),
    // A number the caller asked to be called on. Without one, the post-call webhook fills caller ID.
    callback_number: stated,
    callback_number_source: stated ? "stated" : null,
    callback_window: clip(body?.callback_window, 200),
    promised_text: callbackByText(due),
    filed_at: now.toISOString(),
    due_at: due.toISOString(),
    is_test: isTestFiling(env, now),
  };
}

// subject_ref counts only if it is a member that exists. A wrong or invented value files the request
// as unverified (the rep re-verifies on every callback anyway) rather than failing the caller.
async function checkedRef(ref) {
  if (!isUuid(ref)) return null;
  const rows = await sb(`members?id=eq.${encodeURIComponent(ref.trim())}&select=id`);
  return rows && rows[0] ? rows[0].id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const denied = toolSecretCheck(req.headers);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  try {
    const now = new Date();
    // After hours only. In hours the caller is transferred, exactly as before this feature existed.
    if (isOpen(now) && !forcedClosed(process.env, now)) {
      return res.status(200).json({ ok: false, mode: "transfer", reason: "The call center is open. Transfer the caller instead of filing." });
    }
    const body = req.body || {};
    if (!normalizeRequestType(body.request_type) && !clip(body.request_detail)) {
      return res.status(200).json({ ok: false, reason: "Say what the caller needs (request_type and request_detail) before filing." });
    }
    let verifiedRef = null;
    try { verifiedRef = await checkedRef(body.subject_ref); }
    catch (e) { console.error("file_request member check failed, filing unverified:", String(e.message || e)); }

    const row = buildRow(body, { now, verifiedRef });
    const inserted = await sb("service_requests", { method: "POST", prefer: "return=representation", body: row });
    const r = inserted && inserted[0];
    if (!r) throw new Error("insert returned no row");

    // History is not allowed to cost the caller the request: the row exists, so Robin can say it is
    // filed. A missing 'filed' event is logged and the queue still shows the row.
    try {
      await sb("service_request_events", { method: "POST", prefer: "return=minimal",
        body: { request_id: r.id, actor: "robin", kind: "filed", note: r.verified ? null : "Caller was not verified on the call." } });
    } catch (e) { console.error("file_request event write failed:", r.id, String(e.message || e)); }

    return res.status(200).json({ ok: true, request_id: r.id, due_at: r.due_at, callback_by_text: r.promised_text });
  } catch (e) {
    console.error("file_request error:", String(e.message || e));
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
