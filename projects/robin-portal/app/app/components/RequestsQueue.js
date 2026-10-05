"use client";
// Requests: the call center's queue of after-hours callback requests. When the call center is closed and
// a member needs a person, Robin files a request; this page is where the team works them.
//
// Everyone who can open Birdnest can open this page: there are no per-person accounts in this proof of
// concept, so history says what happened and when, not who did it. The hours in the footer come from
// the broker (lib/hours.js), the one place they live. Test rows (a test agent or a preview broker) are
// hidden unless the address ends in ?test=1.
import { useCallback, useEffect, useMemo, useState } from "react";
import NestLoader from "./NestLoader.js";
import RequestDrawer from "./RequestDrawer.js";
import CallDrawer from "./CallDrawer.js";
import { TYPE_LABEL, FILTERS, nameOf, rowStatus, dotOf, stamp, phone, duration } from "../../lib/request-view.js";

const TZ_FALLBACK = "America/Chicago";

export default function RequestsQueue() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("open");
  const [openId, setOpenId] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [withTest, setWithTest] = useState(false);

  useEffect(() => { setWithTest(new URLSearchParams(window.location.search).get("test") === "1"); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/requests?view=all${withTest ? "&test=1" : ""}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, [withTest]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const tz = data?.hours?.time_zone || TZ_FALLBACK;
  const now = data?.now ? new Date(data.now) : new Date();
  const all = data?.requests || [];
  const s = data?.stats;
  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const shown = useMemo(() => {
    const rows = all.filter(active.test);
    // Open work by deadline; finished work most recent first.
    return filter === "done" || filter === "all"
      ? [...rows].sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1) || (a.status === "closed" ? String(b.closed_at).localeCompare(String(a.closed_at)) : 0))
      : rows;
  }, [all, active, filter]);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, all.filter(f.test).length]));
  const current = all.find((r) => r.id === openId) || null;
  const closeDrawer = useCallback(() => setOpenId(null), []);
  const closeTranscript = useCallback(() => setTranscript(null), []);

  return (
    <>
      <div className="kicker">Listen · after-hours requests</div>
      <div className="page-h">
        <div>
          <h1>Requests</h1>
          <p>Members who called after hours and need a person. Call back on the number shown, verify them first, then log what happened.</p>
        </div>
        <button className="btn sec" type="button" onClick={load}>Refresh</button>
      </div>
      {withTest && <div className="banner">Showing test requests too (filed by a test agent or a preview). They never appear without ?test=1.</div>}
      {err && <div className="banner">Couldn't load requests: {err}</div>}
      {s && (
        <div className="stat-row">
          <div className="stat"><div className="n">{s.open}</div><div className="k">Open</div></div>
          <div className="stat"><div className={`n${s.overdue ? " rq-bad" : ""}`}>{s.overdue}</div><div className="k">Overdue</div></div>
          <div className="stat"><div className="n">{s.due_today}</div><div className="k">Due today</div></div>
          <div className="stat"><div className="n">{s.done_this_month}</div><div className="k">Done this month</div></div>
          <div className="stat" title="Counted in open hours, the same clock as the callback promise"><div className="n">{duration(s.median_open_minutes_to_first_attempt)}</div><div className="k">Median to first callback, open hours</div></div>
        </div>
      )}
      <div className="filters" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={f.key === filter ? "on" : ""} aria-pressed={f.key === filter} onClick={() => setFilter(f.key)}>
            {f.label}{data && f.key !== "done" && f.key !== "all" ? ` (${counts[f.key]})` : ""}
          </button>
        ))}
      </div>
      <div className="list">
        {!data && !err && <NestLoader size={130} label="Loading requests" />}
        {data && all.length === 0 && (
          <p className="empty">
            No requests yet. When the call center is closed and a member needs a person, Robin files a request
            here with what they need and the callback time she promised them.
          </p>
        )}
        {data && all.length > 0 && shown.length === 0 && <p className="empty">{filter === "open" ? "Nothing open. Every request has been worked." : "Nothing in this filter."}</p>}
        {shown.map((r) => {
          const st = rowStatus(r, tz, now);
          return (
            <div className="row rq-row" role="button" tabIndex={0} key={r.id}
                 onClick={() => setOpenId(r.id)}
                 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(r.id); } }}>
              <i className={`dot d-${dotOf(r)}`} aria-hidden="true" />
              <div>
                <div className="main">
                  <span className="t">{nameOf(r)}</span>
                  <span className="tag">{TYPE_LABEL[r.request_type] || r.request_type}</span>
                  {!r.verified && <span className="tag bad">Unverified</span>}
                  {r.is_test && <span className="tag">Test</span>}
                </div>
                {r.request_detail && <div className="rq-detail">{r.request_detail}</div>}
                <div className="sub">
                  {r.verified ? "Verified" : r.callback_number ? `Caller ID ${phone(r.callback_number)}` : "No callback number yet"}
                  {" · phone · filed "}{stamp(r.filed_at, tz)}
                  {r.source === "postcall" ? " · after the call" : ""}
                </div>
              </div>
              <div className="meta rq-meta">
                <div className={`rq-head ${st.cls}`}>{st.head}</div>
                <div>{st.line}</div>
              </div>
            </div>
          );
        })}
      </div>
      {all.length > 0 && (
        <div className="rq-key">
          <span><i className="dot d-bad" aria-hidden="true" />Overdue, no callback yet</span>
          <span><i className="dot d-warn" aria-hidden="true" />Due today, no callback yet</span>
          <span><i className="dot d-ok" aria-hidden="true" />Called back on time, not yet closed</span>
        </div>
      )}
      {data?.hours && (
        <p className="rq-hours">Hours: {data.hours.text} · {data.hours.callback_text}</p>
      )}
      {current && !transcript && (
        <RequestDrawer r={current} tz={tz} now={now} onClose={closeDrawer} onChanged={load}
                       onTranscript={() => setTranscript(current.conversation_id)} />
      )}
      {transcript && <CallDrawer id={transcript} onClose={closeTranscript} />}
    </>
  );
}
