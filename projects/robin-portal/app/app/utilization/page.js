"use client";
// Utilization: how much of what Robin knows callers actually use, over the last 30 days. It reads grades
// that already exist and never grades anything itself (that is the manual, paid click on Accuracy).
import { useCallback, useEffect, useState } from "react";
import { gaugeView, when, visible, docLabel } from "../../lib/utilization-view.js";

export default function UtilizationPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/utilization?days=30", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const g = data ? gaugeView(data) : null;
  return (
    <>
      <div className="kicker">Understand</div>
      <div className="page-h">
        <div>
          <h1>Utilization</h1>
          <p>How much of what Robin knows callers actually use. The last 30 days, every channel. A topic is one section of a document attached to her.</p>
        </div>
        <button className="btn sec" type="button" onClick={load}>Refresh</button>
      </div>
      {err && <div className="banner">Couldn't measure utilization: {err}</div>}
      {data && (
        <>
          <div className="strip">
            <span><b>{data.graded}</b> of <b>{data.interactions}</b> interactions graded</span>
            <span className="cov" role="img" aria-label={`${g.coveragePct}% graded`}><i style={{ width: `${g.coveragePct}%` }} /></span>
            <span>{g.coveragePct}%</span>
            <span>Measured {when(data.measured_at)}</span>
            <a className="go" href="/grader">Grade more on Accuracy →</a>
          </div>
          {data.unreadable_documents?.length > 0 && <div className="banner">Couldn't read: {data.unreadable_documents.join(", ")}. Those are missing from the count.</div>}
          <div className="u-main">
            <div>
              <div className="lbl">Knowledge in use</div>
              <div className="u-g">
                <div className="tube" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.pct} aria-label="Share of Robin's knowledge in use">
                  <div className="fill" style={{ height: `${g.pct}%` }} />
                  <div className="lvl" style={{ bottom: `${g.pct}%` }} />
                </div>
                <div className="scale" aria-hidden="true">
                  {[100, 75, 50, 25, 0].map((v) => <span key={v} style={{ bottom: `${v}%` }}>{v}</span>)}
                </div>
              </div>
              <div className="u-read">
                {g.lead && <div className="al">{g.lead}</div>}
                <div className="n tnum">{g.pct}%</div>
                <div className="c">{g.caption}</div>
              </div>
              {g.note && <div className="u-note">{g.note}</div>}
            </div>

            <div>
              <section className="u-sec">
                <div className="lbl">By document</div>
                {data.documents.map((d) => (
                  <div className="u-doc" key={d.id}>
                    <span className="t">{docLabel(d.name)}</span>
                    <span className="x">{d.used} of {d.total}</span>
                    <span className="bar" aria-hidden="true"><i style={{ width: `${d.total ? Math.round((d.used / d.total) * 100) : 0}%` }} /></span>
                  </div>
                ))}
              </section>
              <section className="u-sec">
                <div className="lbl">Never used in 30 days · {data.never_used.length}</div>
                {data.never_used.length === 0 && <p className="empty">Every topic was used at least once.</p>}
                {visible(data.never_used, all).map((n, i) => (
                  <div className="u-never" key={i}><span className="w">{docLabel(n.document)}</span><span>{n.title}</span></div>
                ))}
                {data.never_used.length > visible(data.never_used, false).length && (
                  <button className="more" type="button" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${data.never_used.length}`}</button>
                )}
              </section>
              <section className="u-sec">
                <div className="lbl">Asked, with no answer · {data.unmet.length}</div>
                {data.unmet.length === 0 && <p className="empty">Nothing asked went unanswered.</p>}
                {data.unmet.map((u, i) => (
                  <div className="u-ask" key={i}><span>{u.question}</span><span className="n">{u.count} {u.count === 1 ? "time" : "times"}</span></div>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
      {!data && !err && <p className="empty">Measuring…</p>}
    </>
  );
}
