"use client";
// One drawer for both pages: the call's transcript from /api/survey-call (caller side already
// scrubbed of PII by the broker) and, when asked, the grader's rows from /api/call-scores.
import { useEffect, useState } from "react";

export default function CallDrawer({ id, withScores = false, onClose }) {
  const [call, setCall] = useState(null);
  const [scores, setScores] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!id) return;
    setCall(null); setScores(null); setErr(null);
    const ctl = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/survey-call?id=${encodeURIComponent(id)}`, { signal: ctl.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setCall(d);
        if (withScores) {
          const r2 = await fetch(`/api/call-scores?id=${encodeURIComponent(id)}`, { signal: ctl.signal });
          const d2 = await r2.json();
          if (r2.ok) setScores(d2);
        }
      } catch (e) { if (e.name !== "AbortError") setErr(String(e.message || e)); }
    })();
    return () => ctl.abort();
  }, [id, withScores]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!id) return null;
  const c = call?.call, turns = call?.transcript || [];
  const mins = c?.duration_seconds != null ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : "—";

  return (
    <div className="drw" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drw-p" role="dialog" aria-modal="true" aria-label="Call">
        <div className="drw-h">
          <span className="t">{String(id).slice(-8)}</span>
          <button className="drw-x" type="button" onClick={onClose}>Close</button>
        </div>
        {err && <p className="empty">Couldn't load that call: {err}</p>}
        {!err && !call && <p className="empty">Loading…</p>}
        {c && (
          <div className="drw-meta">
            <b>{String(c.started_at || "").slice(0, 16).replace("T", " ")}</b> · {mins} · {c.outcome || "—"} · verification {c.auth_outcome || "—"}
            {c.transfer_reason ? <> · transferred: {c.transfer_reason}</> : null}
          </div>
        )}
        {withScores && scores && (
          <div className="section">
            <div className="lbl">What the grader found{scores.scored_at ? ` · ${String(scores.scored_at).slice(0, 16).replace("T", " ")}` : ""}</div>
            {scores.security_flag && <div className="warn">Security flag: {scores.security_detail || "see the transcript"}</div>}
            {scores.rows.length === 0 && <p className="empty">Not graded yet.</p>}
            {scores.rows.map((r, i) => (
              <div className="score" key={i}>
                <div className="q">{r.question_text || r.question_key || "Question"}</div>
                {r.answer_text && <div className="a">“{r.answer_text}”</div>}
                <div className="g">
                  {r.quality_rating && <b>{r.quality_rating}</b>}
                  {r.quality_score != null && <> · {r.quality_score}/5</>}
                  {r.grounding && <> · grounding: <span className={r.grounding === "no_source" ? "bad" : ""}>{r.grounding}</span></>}
                  {Array.isArray(r.unsupported_claims) && r.unsupported_claims.length > 0 && <> · <span className="bad">{r.unsupported_claims.length} unsupported</span></>}
                  {Array.isArray(r.contradicted_claims) && r.contradicted_claims.length > 0 && <> · <span className="bad">{r.contradicted_claims.length} contradicted</span></>}
                  {r.graded_against && <> · against {r.graded_against}</>}
                </div>
              </div>
            ))}
          </div>
        )}
        {call && (
          <div className="section">
            {turns.length === 0 && <p className="empty">No transcript stored for this call.</p>}
            {turns.map((t, i) => (
              <div className={`turn ${t.role}`} key={i}>
                <div className="who">{t.role === "agent" ? "Robin" : "Caller"}</div>
                <div className="said">{t.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
