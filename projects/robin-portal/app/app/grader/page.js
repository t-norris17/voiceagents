"use client";
// The grader's face. It grades what Robin said against what she read; this page lists calls by
// graded / not graded, runs the grader on demand, and opens each call to the evidence.
import { useCallback, useEffect, useState } from "react";
import CallDrawer from "../components/CallDrawer.js";

const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");

export default function GraderPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
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
  useEffect(() => { load(); }, [load]);

  async function grade() {
    setBusy(true); setLast(null);
    try {
      const r = await fetch("/api/grade", { method: "POST" });
      const g = await r.json().catch(() => null);
      if (!r.ok) throw new Error(g?.error || `HTTP ${r.status}`);
      setLast(g);
      await load();
    } catch (e) { setLast({ error: String(e.message || e) }); }
    finally { setBusy(false); }
  }

  const calls = data?.calls || [];
  const graded = calls.filter((c) => c.scored_at), pending = calls.filter((c) => !c.scored_at);
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Grader</h1>
          <p>Scores what Robin said against the documents she actually read on that call. No answer key. Grades up to ten calls per run; run it again to catch up.</p>
        </div>
        <button className="btn" type="button" onClick={grade} disabled={busy}>{busy ? "Grading…" : "Grade new calls"}</button>
      </div>
      {err && <div className="banner">Couldn't load calls: {err}</div>}
      {last && (
        <div className="banner">
          {last.error ? `Grading failed: ${last.error}` :
            `Graded ${last.graded ?? 0} call${last.graded === 1 ? "" : "s"}${last.calls_without_source ? `, ${last.calls_without_source} with no readable source` : ""}${last.pending > (last.graded ?? 0) ? `, ${last.pending - last.graded} still waiting` : ""}.`}
        </div>
      )}
      <div className="stat-row">
        <div className="stat"><div className="n tnum">{pending.length}</div><div className="k">not yet graded</div></div>
        <div className="stat"><div className="n tnum">{graded.length}</div><div className="k">graded</div></div>
      </div>
      <div className="list">
        {data && calls.length === 0 && <p className="empty">No calls to grade.</p>}
        {[...pending, ...graded].map((c) => (
          <div className="row" role="button" tabIndex={0} key={c.conversation_id}
               onClick={() => setOpen(c.conversation_id)}
               onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(c.conversation_id); } }}>
            <div>
              <div className="main">
                {c.topic || "Call"}
                {c.scored_at ? <span className="pill ok">graded</span> : <span className="pill">not graded</span>}
                {c.security_flag && <span className="pill bad">security</span>}
              </div>
              <div className="sub">{when(c.started_at)} · verification {c.auth_outcome || "—"}{c.outcome ? ` · ${c.outcome}` : ""}</div>
            </div>
            <div className="meta">{c.scored_at ? when(c.scored_at) : "—"}</div>
          </div>
        ))}
      </div>
      <CallDrawer id={open} withScores onClose={close} />
    </>
  );
}
