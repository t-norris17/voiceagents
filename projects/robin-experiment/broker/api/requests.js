// /api/requests: the call center's queue, for Birdnest only (broker middleware gates it; the portal
// proxies it with the internal secret).
//
// GET  ?view=open|done|all  [&test=1]
//   -> { now, hours, stats, requests: [{ ...row, sla, first_attempt, events, call, member }] }
// GET  ?view=stats  -> { now, hours, stats }   (the home tile: no joins)
//   Stats are over every non-test request, whatever the view. Test rows (filed by a test agent or a
//   preview broker) appear only with test=1.
// POST { id, action: reached|voicemail|no_answer|note|close|reopen, note? }
//   -> { ok: true, request }
//   One transaction per action (service_request_act): the history row and any status change land
//   together. The actor is "birdnest": the portal is one shared password and cannot say which person.
import { sb, sbAll } from "../lib/supabase.js";
import { ACTIONS, isUuid, clip, slaState, firstAttempt, queueStats } from "../lib/requests.js";
import { HOURS, hoursText } from "../lib/hours.js";

// What the page needs to say about the hours, from the one place they live.
const HOURS_INFO = {
  text: hoursText(),
  time_zone: HOURS.timeZone,
  callback_text: `callback within ${HOURS.callbackBusinessMinutes / 60} business hours (placeholder until the business sets the SLA)`,
};

const COLS = "id,conversation_id,agent_id,source,request_type,request_detail,subject_ref,verified,caller_name," +
  "callback_number,callback_number_source,callback_window,promised_text,filed_at,due_at,status,closed_at,closed_by,is_test";

const RECENT_DAYS = 60;
// Same unquoted, encoded list grade.js uses: every id here is a uuid or an ElevenLabs id, no commas.
const inList = (ids) => `(${ids.map(encodeURIComponent).join(",")})`;

async function eventsFor(ids) {
  if (!ids.length) return {};
  const rows = await sbAll(`service_request_events?request_id=in.${inList(ids)}&select=request_id,at,actor,kind,note&order=at.asc,id.asc`);
  const by = {};
  for (const e of rows) (by[e.request_id] ||= []).push(e);
  return by;
}

// The call's summary from the stored call record, so the rep reads what happened without opening the
// transcript. Only for conversations that filed a request.
async function summariesFor(convIds) {
  if (!convIds.length) return {};
  const rows = await sb(`ai_call_events?conversation_id=in.${inList(convIds)}&select=conversation_id,summary:raw_payload->data->analysis->>transcript_summary,title:raw_payload->data->analysis->>call_summary_title`);
  return Object.fromEntries((rows || []).map((r) => [r.conversation_id, { summary: r.summary || null, title: r.title || null }]));
}

async function membersFor(refs) {
  const ids = refs.filter(isUuid);
  if (!ids.length) return {};
  const rows = await sb(`members?id=in.${inList(ids)}&select=id,first_name,plan_name`);
  return Object.fromEntries((rows || []).map((m) => [m.id, { first_name: m.first_name, plan_name: m.plan_name }]));
}

export async function list({ view = "open", test = false, now = new Date() } = {}) {
  const testFilter = test ? "" : "&is_test=is.false";
  // Every open request, plus what was closed in the last RECENT_DAYS: enough for "done this month" and
  // the median, and bounded, so the history the queue reads (and the id list sent for its events and
  // summaries) does not grow forever as finished requests pile up.
  const since = new Date(now.getTime() - RECENT_DAYS * 864e5).toISOString();
  // Two plain reads rather than one or=(...): a timestamp inside or=() needs PostgREST's quoting rules,
  // and the broker's other time filters (utilization.js) are all plain gte filters like this one.
  const [openRows, recentClosed] = await Promise.all([
    sbAll(`service_requests?select=${COLS}${testFilter}&status=eq.open&order=due_at.asc,id.asc`),
    sbAll(`service_requests?select=${COLS}${testFilter}&status=eq.closed&closed_at=gte.${encodeURIComponent(since)}&order=due_at.asc,id.asc`),
  ]);
  const all = [...openRows, ...recentClosed];
  const events = await eventsFor(all.map((r) => r.id));
  const stats = queueStats(all.filter((r) => !r.is_test), events, now);
  if (view === "stats") return { now: now.toISOString(), hours: HOURS_INFO, stats };
  const shown = all.filter((r) => view === "all" ? true : view === "done" ? r.status === "closed" : r.status === "open");
  if (view === "done") shown.sort((a, b) => String(b.closed_at).localeCompare(String(a.closed_at)));
  const [summaries, members] = await Promise.all([
    summariesFor(shown.map((r) => r.conversation_id).filter(Boolean)),
    membersFor([...new Set(shown.map((r) => r.subject_ref).filter(Boolean))]),
  ]);
  const requests = shown.map((r) => {
    const ev = events[r.id] || [];
    return { ...r, sla: slaState(r, ev, now), first_attempt: firstAttempt(ev)?.at || null, events: ev,
      call: r.conversation_id ? summaries[r.conversation_id] || null : null,
      member: r.subject_ref ? members[r.subject_ref] || null : null };
  });
  return { now: now.toISOString(), hours: HOURS_INFO, stats, requests };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const view = ["open", "done", "all", "stats"].includes(req.query?.view) ? req.query.view : "open";
      res.setHeader("cache-control", "no-store");
      return res.status(200).json(await list({ view, test: req.query?.test === "1" }));
    }
    if (req.method === "POST") {
      const { id, action, note } = req.body || {};
      const kind = ACTIONS[action];
      if (!isUuid(id) || !kind) return res.status(400).json({ error: "id (uuid) and a known action are required" });
      const text = clip(note, 2000);
      if (kind === "note" && !text) return res.status(400).json({ error: "a note needs text" });
      const r = await sb("rpc/service_request_act", { method: "POST",
        body: { p_id: id.trim(), p_kind: kind, p_actor: "birdnest", p_note: text } });
      return res.status(200).json({ ok: true, request: r });
    }
    return res.status(405).json({ error: "GET or POST" });
  } catch (e) {
    const msg = String(e.message || e);
    console.error("requests error:", msg);
    return res.status(/not found/.test(msg) ? 404 : 500).json({ error: msg });
  }
}
