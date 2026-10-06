// What the post-call webhook does for after-hours requests, after the call record is safely stored.
//   1. If Robin filed a request with the tool on this call, link it: the row gets its conversation id,
//      the caller-ID number (unless the caller stated another) and the caller's name from Data
//      Collection.
//   2. If she did not (the caller hung up first), file it here from Data Collection, when the call was a
//      phone call after hours and named a request. ON CONFLICT DO NOTHING on conversation_id, so a
//      re-delivered webhook never files twice and never overwrites what the caller confirmed.
// Every database call goes through `db` so the whole flow runs in tests against a fake.
import { callbackDue, callbackByText } from "./hours.js";
import { filedRequestId, handoffPromise, safetyNetDecision, normalizePhone, clip, isUuid } from "./requests.js";

export async function linkOrFile({ conversationId, agentId, startedAt, transcript, externalNumber, pick, db, env = process.env, now = new Date() }) {
  const callerId = normalizePhone(externalNumber);
  const callerName = clip(pick("caller_name"), 120);
  const requestId = filedRequestId(transcript);

  if (requestId) {
    // Only an unlinked row is touched, so a re-delivery (or a second conversation quoting the same id)
    // changes nothing. callback_number is filled only where the caller did not state one.
    const linked = await db(`service_requests?id=eq.${requestId}&conversation_id=is.null`, {
      method: "PATCH", prefer: "return=representation",
      body: { conversation_id: conversationId, agent_id: agentId },
    });
    const row = linked && linked[0];
    if (!row) return { action: "none", why: "tool request already linked or not found", request_id: requestId };
    const fill = {};
    if (!row.callback_number && callerId) { fill.callback_number = callerId; fill.callback_number_source = "caller_id"; }
    if (!row.caller_name && callerName) fill.caller_name = callerName;
    if (Object.keys(fill).length) await db(`service_requests?id=eq.${requestId}`, { method: "PATCH", prefer: "return=minimal", body: fill });
    await db("service_request_events", { method: "POST", prefer: "return=minimal",
      body: { request_id: requestId, actor: "system", kind: "linked", note: "Linked to its call after the call ended." } });
    return { action: "linked", request_id: requestId };
  }

  const decision = safetyNetDecision({ agentId, requestType: pick("request_type"), externalNumber, startedAt, linked: false, env, now });
  if (!decision.file) return { action: "none", why: decision.why };

  const start = new Date(startedAt);
  const due = callbackDue(start);
  const subjectRef = isUuid(pick("subject_ref")) ? String(pick("subject_ref")).trim() : null;
  const row = {
    conversation_id: conversationId,
    agent_id: agentId,
    source: "postcall",
    request_type: decision.type,
    request_detail: clip(pick("request_detail")),
    subject_ref: subjectRef,
    // Data Collection's subject_ref is the model's reading of the call, not a tool result, so it is
    // kept for the rep but the request is NOT marked verified on its strength.
    verified: false,
    caller_name: callerName,
    callback_number: callerId,
    callback_number_source: "caller_id",
    // What the caller heard, if get_handoff_option ran before they hung up; else nothing was promised.
    promised_text: handoffPromise(transcript),
    filed_at: now.toISOString(),
    due_at: due.toISOString(),
    is_test: decision.isTest || env.VERCEL_ENV !== "production",
  };
  const ins = await db("service_requests?on_conflict=conversation_id", {
    method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: row,
  });
  const r = ins && ins[0];
  if (!r) return { action: "none", why: "a request for this conversation already exists" };
  await db("service_request_events", { method: "POST", prefer: "return=minimal",
    body: { request_id: r.id, actor: "system", kind: "filed",
      note: `Filed after the call from its summary: the caller did not finish filing with Robin. Due ${callbackByText(due)}.` } });
  return { action: "filed", request_id: r.id };
}
