"use client";
// Every recent call, newest first. What the Experiment Monitor was for, without its grading grid.
import { useCallback, useEffect, useState } from "react";
import CallDrawer from "../components/CallDrawer.js";

const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");

export default function CallsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/calls?limit=100", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const calls = data?.calls || [], s = data?.summary;
  return (
    <>
      <div className="page-h">
        <div><h1>Calls</h1><p>Every recent call, newest first. Click one to read it. The caller's personal details are scrubbed from the transcript.</p></div>
        <button className="btn sec" type="button" onClick={load}>Refresh</button>
      </div>
      {err && <div className="banner">Couldn't load calls: {err}</div>}
      {s && (
        <div className="stat-row">
          <div className="stat"><div className="n tnum">{s.last_24h}</div><div className="k">last 24 h</div></div>
          <div className="stat"><div className="n tnum">{s.last_7d}</div><div className="k">last 7 days</div></div>
          <div className="stat"><div className="n tnum">{s.ungraded_in_window}</div><div className="k">not yet graded</div></div>
        </div>
      )}
      <div className="list">
        {data && calls.length === 0 && <p className="empty">No calls recorded yet.</p>}
        {calls.map((c) => (
          <div className="row" role="button" tabIndex={0} key={c.conversation_id}
               onClick={() => setOpen(c.conversation_id)}
               onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(c.conversation_id); } }}>
            <div>
              <div className="main">
                {c.topic || "Call"}
                {c.auth_outcome === "verified" ? <span className="pill ok">verified</span> : <span className="pill">{c.auth_outcome || "unverified"}</span>}
                {c.outcome === "transferred" && <span className="pill">transferred</span>}
                {c.security_flag && <span className="pill bad">security</span>}
              </div>
              <div className="sub">{when(c.started_at)}{c.duration_seconds != null ? ` · ${Math.round(c.duration_seconds / 60)} min` : ""}{c.transfer_reason ? ` · ${c.transfer_reason}` : ""}</div>
            </div>
            <div className="meta">{c.overall_sentiment || "—"}<br />{c.scored_at ? "graded" : "not graded"}</div>
          </div>
        ))}
      </div>
      <CallDrawer id={open} onClose={close} />
    </>
  );
}
