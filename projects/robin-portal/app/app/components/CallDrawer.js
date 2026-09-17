"use client";
// One drawer for both pages: the call's summary and transcript from /api/survey-call (caller side
// already scrubbed of PII by the broker) and, on the Accuracy page, the grade results from
// /api/call-scores: a verdict line, the evidence per question, and the actions the evidence implies.
import { useEffect, useState } from "react";

const RATING = { good: ["Correct", ""], partial: ["Incomplete", "mid"], wrong: ["Wrong", "bad"], unrated: ["Unrated", "mid"] };
const GROUNDING = {
  grounded: "every checkable claim was found in the documents she read",
  unsupported: "a claim the documents she read do not establish",
  contradicted: "a claim the documents she read contradict",
  no_source: "no readable document to check against",
  no_claims: "nothing checkable in the answer",
};
const FAIL = {
  no_content: ["Write content", "no document covers this"],
  not_retrieved: ["Retrieval miss", "a document covers this and she did not use it"],
  out_of_scope: ["Out of scope", "not a plan question"],
  guardrail: ["Declined correctly", "she was right not to answer"],
};

function noteLines(r) {
  return String(r.reviewer_note || "").split(" · ").map((x) => x.trim()).filter(Boolean);
}

// The actions block is derived, never asserted: each line names the row it came from.
function actionsFor(rows, questions) {
  const fix = [], wins = [];
  for (const r of rows) {
    const q = r.question_text || r.question_key;
    const claims = Array.isArray(r.evidence?.claims) ? r.evidence.claims : [];
    const bad = (v) => claims.filter((c) => c.verdict === v).map((c) => c.claim);
    if (r.contradicted_claims > 0) {
      const w = bad("contradicted");
      fix.push(<><b>Fix the answer or the document.</b> On “{q}” Robin contradicted the source{w.length ? <>: “{w.join("” · “")}”</> : null}.</>);
    } else if (r.unsupported_claims > 0) {
      const w = bad("unsupported");
      fix.push(<><b>Check a claim.</b> On “{q}” Robin said something the documents she read do not establish{w.length ? <>: “{w.join("” · “")}”</> : null}. True or not, it needs a source or needs to go.</>);
    }
    else if (r.quality_rating === "partial") fix.push(<><b>Incomplete.</b> “{q}”: {noteLines(r).find((l) => !/^(Not in|Contradicts)/.test(l)) || "material detail left out"}.</>);
    else if (r.quality_rating === "wrong") fix.push(<><b>Wrong.</b> “{q}”: {noteLines(r)[0] || "see the evidence"}.</>);
  }
  for (const qn of questions) {
    if (qn.answered) continue;
    const [label] = FAIL[qn.fail_reason] || ["Unanswered", ""];
    const line = <><b>{label}.</b> “{qn.canonical_question}”{qn.gap_note ? <> · {qn.gap_note}</> : null}</>;
    if (qn.fail_reason === "no_content" || qn.fail_reason === "not_retrieved" || !qn.fail_reason) fix.push(line);
    else wins.push(line);
  }
  return { fix, wins };
}

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
  const c = call?.call, turns = call?.transcript || [], sum = call?.summary;
  const mins = c?.duration_seconds != null ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : "—";
  const rows = scores?.rows || [], questions = scores?.questions || [];
  const answered = questions.filter((q) => q.answered).length;
  const problems = rows.filter((r) => r.quality_rating !== "good" || r.contradicted_claims > 0 || r.unsupported_claims > 0).length;
  const noSource = rows.length > 0 && rows.every((r) => r.grounding === "no_source");
  const { fix, wins } = scores ? actionsFor(rows, questions) : { fix: [], wins: [] };

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
        {sum?.text && (
          <div className="sum">
            <div className="h">Summary · written by ElevenLabs after the call</div>
            {sum.title && <div className="t">{sum.title}</div>}
            <p>{sum.text}</p>
          </div>
        )}
        {withScores && scores && (
          <div className="section">
            <div className="lbl">Grade results{scores.scored_at ? ` · ${String(scores.scored_at).slice(0, 16).replace("T", " ")}` : ""}</div>
            {scores.security_flag && <div className="warn">Security flag: {scores.security_detail || "see the transcript"}</div>}
            {rows.length === 0 && questions.length === 0 && <p className="empty">Not graded yet.</p>}
            {(rows.length > 0 || questions.length > 0) && (
              <div className="gr-verdict">
                The caller asked <b>{questions.length || rows.length}</b> question{(questions.length || rows.length) === 1 ? "" : "s"}.
                Robin answered <b>{questions.length ? answered : rows.length}</b>
                {problems > 0 ? <>, <span className="bad">{problems} with a problem</span></> : <>, none with a problem</>}.
                {noSource && <> <span className="bad">No document was readable for this call, so nothing could be checked.</span></>}
              </div>
            )}
            {(fix.length > 0 || wins.length > 0) && (
              <div className="gr-act">
                <div className="h">What to do</div>
                {fix.length === 0 && <div className="gr-none">Nothing to fix on this call.</div>}
                <ul>
                  {fix.map((x, i) => <li key={`f${i}`}>{x}</li>)}
                  {wins.map((x, i) => <li className="win" key={`w${i}`}>{x}</li>)}
                </ul>
              </div>
            )}
            {rows.map((r, i) => {
              const [word, cls] = RATING[r.quality_rating] || RATING.unrated;
              const ev = r.evidence || null;
              const claims = Array.isArray(ev?.claims) ? ev.claims : null;
              return (
                <div className="gr-q" key={i}>
                  <div className="q">{r.question_text || r.question_key || "Question"}<span className={`rating ${cls}`}>{word}</span></div>
                  {r.answer_text && <div className="a"><b>Robin:</b> “{r.answer_text}”</div>}
                  {claims && claims.length > 0 && (
                    <ul className="claims">
                      {claims.map((cl, j) => (
                        <li className={cl.verdict === "supported" ? "" : "bad"} key={j}>
                          <span className="verdict">{cl.verdict === "supported" ? "In the source" : cl.verdict === "contradicted" ? "Contradicts the source" : "Not in the source"}</span>
                          <div>{cl.claim}</div>
                          {cl.source_quote && <span className="src">“{cl.source_quote}”</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!claims && noteLines(r).length > 0 && (
                    <ul className="claims">{noteLines(r).map((l, j) => <li className={/^(Not in|Contradicts)/.test(l) ? "bad" : ""} key={j}>{l}</li>)}</ul>
                  )}
                  <div className="judg">
                    {ev ? (
                      <>
                        {ev.answered_the_question === false ? <span className="bad">did not answer what was asked</span> : "answered what was asked"}
                        {" · "}{ev.complete === false ? <span className="bad">left out something material</span> : "complete"}
                        {" · "}{ev.appropriately_routed === false ? <span className="bad">thin answer where the source had more</span> : "routed right"}
                        {" · "}
                      </>
                    ) : null}
                    {GROUNDING[r.grounding] || r.grounding || "grounding unknown"}
                  </div>
                </div>
              );
            })}
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
