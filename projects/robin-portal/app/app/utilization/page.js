"use client";
// Utilization: how much of what Robin knows callers actually use, over the last 30 days. It reads grades
// that already exist and never grades anything itself (that is the manual, paid click on Accuracy).
import { useCallback, useEffect, useState } from "react";
import NestLoader from "../components/NestLoader.js";
import { gaugeView, coverageView, readLine, sectionNote, when, visible, docLabel } from "../../lib/utilization-view.js";

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
  const cv = data ? coverageView(data) : null;
  const docOf = (id) => data?.documents.find((d) => d.id === id);
  // A topic, opened: what it says, and what cited it or why nothing did.
  const Topic = ({ doc, sec, label }) => (
    <details className="u-topic">
      <summary><span className="w">{label}</span><span className="tt">{sec.title}</span>{sec.used && <span className="n">{sec.count}×</span>}</summary>
      <div className="u-body">
        {sec.preview && <p className="pv">{sec.preview}</p>}
        <p className="nt">{sectionNote(doc, sec)}</p>
      </div>
    </details>
  );
  return (
    <>
      <div className="kicker">Measure</div>
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
            <span><b>{data.measured ?? data.graded}</b> of <b>{data.interactions}</b> interactions measured</span>
            <span className="cov" role="img" aria-label={`${g.coveragePct}% measured`}><i style={{ width: `${g.coveragePct}%` }} /></span>
            <span>{g.coveragePct}%</span>
            <span>As of {when(data.measured_at)}</span>
            <a className="go" href="/grader">Grade more on Accuracy →</a>
          </div>
          {cv.unmeasurableLine && (
            <p className="u-unm">{cv.unmeasurableLine}, so nothing in them was checked and they count for nothing here. <a href="/grader?filter=no_source">Re-grade them on Accuracy →</a></p>
          )}
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
                  <details className="u-docd" key={d.id}>
                    <summary className="u-doc">
                      <span className="t">{docLabel(d.name)}<span className="rd">{readLine(d)}</span></span>
                      <span className="x">{d.used} of {d.total}</span>
                      <span className="bar" aria-hidden="true"><i style={{ width: `${d.total ? Math.round((d.used / d.total) * 100) : 0}%` }} /></span>
                    </summary>
                    <div className="u-secs">
                      {d.sections.map((sec, i) => <Topic key={i} doc={d} sec={sec} label={sec.used ? "used" : "unused"} />)}
                    </div>
                  </details>
                ))}
              </section>
              <section className="u-sec">
                <div className="lbl">Never used in 30 days · {data.never_used.length}</div>
                {data.never_used.length === 0 && <p className="empty">Every topic was used at least once.</p>}
                {visible(data.never_used, all).map((n, i) => {
                  const doc = data.documents.find((d) => d.name === n.document);
                  const sec = doc?.sections.find((x) => x.title === n.title);
                  return sec ? <Topic key={i} doc={doc} sec={sec} label={docLabel(n.document)} /> : <div className="u-never" key={i}><span className="w">{docLabel(n.document)}</span><span>{n.title}</span></div>;
                })}
                {data.never_used.length > visible(data.never_used, false).length && (
                  <button className="more" type="button" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${data.never_used.length}`}</button>
                )}
              </section>
              <section className="u-sec">
                <div className="lbl">Asked, with no answer · {data.unmet.length}</div>
                {data.unmet.length === 0 && <p className="empty">Nothing asked went unanswered.</p>}
                {data.unmet.map((u, i) => (
                  <div className="u-ask" key={i}><span>{u.question}{u.also?.length > 0 && <span className="also">Also: {u.also.join(" · ")}</span>}</span><span className="n">{u.count} {u.count === 1 ? "time" : "times"}</span></div>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
      {!data && !err && <NestLoader size={150} label="Measuring" />}
    </>
  );
}
