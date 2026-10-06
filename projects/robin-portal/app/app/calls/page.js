"use client";
// Interactions: every recent conversation Robin has had, by any channel, newest first.
// What the Experiment Monitor was for, without its grading grid.
import { useCallback, useEffect, useState } from "react";
import CallDrawer from "../components/CallDrawer.js";
import NestLoader from "../components/NestLoader.js";
import { CHANNEL_LABEL } from "../../lib/channel-label.js";
import { dotOf, needsLook, FILTERS, topicOf } from "../../lib/interaction-state.js";

const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");
const LIMIT = 100;

export default function InteractionsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  const close = useCallback(() => setOpen(null), []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/calls?limit=${LIMIT}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const calls = data?.calls || [], s = data?.summary;
  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const shown = calls.filter(active.test);
  const flagged = calls.filter(needsLook).length;
  return (
    <>
      <div className="kicker">Intake</div>
      <div className="page-h">
        <div>
          <h1>Interactions</h1>
          <p>Every conversation Robin has had, by phone or chat, newest first. Open one to read it and see how it was graded. The caller's personal details are scrubbed from the transcript.</p>
        </div>
        <button className="btn sec" type="button" onClick={load}>Refresh</button>
      </div>
      {err && <div className="banner">Couldn't load interactions: {err}</div>}
      {s && (
        <div className="stat-row">
          <div className="stat"><div className="n">{s.last_24h}</div><div className="k">last 24 h</div></div>
          <div className="stat"><div className="n">{s.last_7d}</div><div className="k">last 7 days</div></div>
          <div className="stat"><div className="n">{flagged}</div><div className="k">{calls.length >= LIMIT ? `need a look, newest ${LIMIT}` : "need a look"}</div></div>
          <div className="stat"><div className="n">{s.ungraded_in_window}</div><div className="k">not yet graded</div></div>
        </div>
      )}
      <div className="filters" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={f.key === filter ? "on" : ""} aria-pressed={f.key === filter} onClick={() => setFilter(f.key)}
                  title={f.key === "needs" ? "A security flag, a failed verification, or a hand-off to a person" : undefined}>{f.label}</button>
        ))}
      </div>
      <div className="list">
        {!data && !err && <NestLoader size={130} label="Loading interactions" />}
        {data && calls.length === 0 && <p className="empty">No interactions recorded yet.</p>}
        {data && calls.length > 0 && shown.length === 0 && <p className="empty">Nothing in this filter.</p>}
        {shown.map((c) => (
          <div className="row" role="button" tabIndex={0} key={c.conversation_id}
               onClick={() => setOpen(c.conversation_id)}
               onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(c.conversation_id); } }}>
            <i className={`dot d-${dotOf(c)}`} aria-hidden="true" />
            <div>
              <div className="main">
                <span className="t">{topicOf(c)}</span>
                {CHANNEL_LABEL[c.channel] && <span className="tag">{CHANNEL_LABEL[c.channel]}</span>}
                {c.security_flag && <span className="tag bad">Security</span>}
              </div>
              <div className="sub">
                {when(c.started_at)}
                {c.duration_seconds != null ? ` · ${Math.max(1, Math.round(c.duration_seconds / 60))} min` : ""}
                {` · verification ${c.auth_outcome === "not_attempted" ? "not attempted" : (c.auth_outcome || "unknown")}`}
                {c.outcome === "transferred" ? ` · transferred${c.transfer_reason ? `: ${c.transfer_reason}` : ""}` : ""}
                {c.outcome === "callback" ? " · callback requested" : ""}
                {c.overall_sentiment ? ` · ${c.overall_sentiment}` : ""}
              </div>
            </div>
            <div className="meta">{c.scored_at ? "graded" : "not graded"}</div>
          </div>
        ))}
      </div>
      <CallDrawer id={open} onClose={close} />
    </>
  );
}
