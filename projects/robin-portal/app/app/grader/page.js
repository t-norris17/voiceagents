"use client";
// The Accuracy page, the grader's face. It grades what Robin said against what she read, and grading is
// manual and paid, so everything that costs money says what it will do first: the main button names how
// many it will grade, rows can be picked one by one, and nothing grades in the background.
//
// Filters and counts come from the whole table (/api/calls `totals`), not from the rows on screen, so a
// grade the grader writes is always visible: the earlier version listed the newest 100 while the grader
// worked through the oldest, and grading changed nothing the page showed.
import { useCallback, useEffect, useRef, useState } from "react";
import CallDrawer from "../components/CallDrawer.js";
import NestLoader from "../components/NestLoader.js";
import { CHANNEL_LABEL } from "../../lib/channel-label.js";
import { topicOf } from "../../lib/interaction-state.js";
import { PAGE, RUN_MAX, tabsFor, isFilter, runLabel, selectedLabel, gradeSummary, regradeSummary, pickable, sourceTag, oneCost } from "../../lib/grader-view.js";

const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");

export default function GraderPage() {
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState(null);       // { calls, totals, matching }
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);       // null | "run" | "picked" | a conversation id
  const [last, setLast] = useState(null);       // { kind: "grade" | "regrade", g }
  const [picked, setPicked] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // conversation id waiting on a re-grade confirmation
  const [open, setOpen] = useState(null);
  const [paging, setPaging] = useState(false);
  const [reload, setReload] = useState(0);      // bumped after a grade so an open interaction shows its new grade
  const seq = useRef(0);                         // only the newest list request may write the page
  const close = useCallback(() => setOpen(null), []);

  const load = useCallback(async (f, count = PAGE) => {
    const mine = ++seq.current;
    try {
      const r = await fetch(`/api/calls?limit=${Math.min(100, count)}&filter=${f}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (mine !== seq.current) return; // a newer tab click or action superseded this one
      setData(d); setErr(null);
    } catch (e) { if (mine === seq.current) setErr(String(e.message || e)); }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("filter");
    const f = isFilter(p) ? p : "all";
    setFilter(f); load(f);
  }, [load]);

  function pickTab(k) { setFilter(k); setPicked(new Set()); setConfirm(null); setData(null); load(k); }

  async function more() {
    setPaging(true);
    try {
      const r = await fetch(`/api/calls?limit=${PAGE}&offset=${data.calls.length}&filter=${filter}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData((cur) => {
        const seen = new Set(cur.calls.map((c) => c.conversation_id));
        return { ...d, calls: [...cur.calls, ...d.calls.filter((c) => !seen.has(c.conversation_id))] };
      });
    } catch (e) { setErr(String(e.message || e)); }
    finally { setPaging(false); }
  }

  // One door for every paid action: the plain run, the picked rows, one row, and one re-grade.
  async function post(body, key, kind) {
    setBusy(key); setLast(null); setConfirm(null);
    try {
      const r = await fetch("/api/grade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const g = await r.json().catch(() => null);
      if (!r.ok) throw new Error(g?.error || `the portal stopped waiting (HTTP ${r.status}); the grader may still be working, so the list below is reloaded and shows what it has done so far`);
      setLast({ kind, g }); setPicked(new Set());
    } catch (e) { setLast({ kind, g: { error: String(e.message || e) } }); }
    // Reload either way: after a dropped connection the work may have finished anyway, and the page
    // should show the database, not the last thing the browser heard.
    setReload((n) => n + 1);
    await load(filter, data?.calls?.length || PAGE);
    setBusy(null);
  }
  const gradeRun = () => post({}, "run", "grade");
  const gradePicked = () => post({ conversation_ids: [...picked] }, "picked", "grade");
  const gradeOne = (id) => post({ conversation_ids: [id] }, id, "grade");
  const regrade = (id) => post({ conversation_ids: [id], regrade: true }, id, "regrade");

  function toggle(id) {
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id); else if (n.size < RUN_MAX) n.add(id);
      return n;
    });
  }

  const calls = data?.calls || [];
  const t = data?.totals;
  const tabs = tabsFor(t);
  const working = busy !== null;
  const summary = last && last.kind === "grade" ? gradeSummary(last.g) : null;
  const opened = calls.find((c) => c.conversation_id === open);

  // The grade / re-grade control for the interaction open in the drawer.
  const drawerAction = opened && (
    pickable(opened)
      ? <button className="btn sec sm" type="button" disabled={working} onClick={() => gradeOne(opened.conversation_id)}>{busy === opened.conversation_id ? "Grading…" : `Grade this one · ${oneCost()}`}</button>
      : confirm === opened.conversation_id
        ? <span className="g-conf"><span>Replaces this grade. Costs {oneCost()}.</span><button className="btn sm" type="button" disabled={working} onClick={() => regrade(opened.conversation_id)}>Confirm</button><button className="btn sec sm" type="button" onClick={() => setConfirm(null)}>Cancel</button></span>
        : <button className="btn sec sm" type="button" disabled={working} onClick={() => setConfirm(opened.conversation_id)}>{busy === opened.conversation_id ? "Grading…" : "Re-grade"}</button>
  );

  return (
    <>
      <div className="kicker">Improve</div>
      <div className="page-h">
        <div>
          <h1>Accuracy</h1>
          <p>Was what Robin said true to the documents she actually read in that interaction? No answer key. Grading is manual and runs on a paid model: one click grades up to ten, newest first, or pick exactly the ones you want. Open one for its evidence.</p>
        </div>
        <button className="btn" type="button" onClick={gradeRun} disabled={working || !t || t.ungraded === 0}>{runLabel(t?.ungraded, busy === "run")}</button>
      </div>

      {err && <div className="banner">Couldn't load interactions: {err}</div>}
      {summary && (
        <div className="banner" role="status">
          {summary.text}
          {summary.failed.length > 0 && (
            <ul className="g-fails">{summary.failed.map((f) => <li key={f.id}><code>{String(f.id).slice(-8)}</code> failed: {f.error}. It is still not graded.</li>)}</ul>
          )}
        </div>
      )}
      {last && last.kind === "regrade" && <div className="banner" role="status">{regradeSummary(last.g)}</div>}

      <div className="stat-row">
        <div className="stat"><div className="n">{t ? t.ungraded : "–"}</div><div className="k">not yet graded</div></div>
        <div className="stat"><div className="n">{t ? t.graded : "–"}</div><div className="k">graded</div></div>
        {t && t.graded_without_source > 0 && <div className="stat"><div className="n">{t.graded_without_source}</div><div className="k">graded, nothing checked</div></div>}
      </div>

      <div className="filters" role="group" aria-label="Filter">
        {tabs.map((f) => (
          <button key={f.key} type="button" className={f.key === filter ? "on" : ""} aria-pressed={f.key === filter} onClick={() => pickTab(f.key)}>
            {f.label}{f.count != null ? ` · ${f.count}` : ""}
          </button>
        ))}
      </div>
      {filter === "no_source" && (
        <p className="g-hint">These were graded before the grader could read Robin's documents, so none of their answers were checked. Re-grading one replaces its grade with a checked one. Survey answers are not touched.</p>
      )}

      {picked.size > 0 && (
        <div className="g-bar" role="status">
          <span>{picked.size} selected{picked.size >= RUN_MAX ? ` (the most one run takes)` : ""}</span>
          <button className="btn" type="button" disabled={working} onClick={gradePicked}>{busy === "picked" ? "Grading…" : selectedLabel(picked.size)}</button>
          <button className="btn sec" type="button" disabled={working} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      <div className="list">
        {!data && !err && <NestLoader size={130} label="Loading interactions" />}
        {data && calls.length === 0 && <p className="empty">{filter === "ungraded" ? "Everything is graded." : filter === "graded" ? "Nothing has been graded yet." : filter === "no_source" ? "Nothing graded without a source." : "No interactions."}</p>}
        {calls.map((c) => {
          const id = c.conversation_id, ungraded = pickable(c), tag = sourceTag(c);
          return (
            <div className="row g-row" key={id} onClick={(e) => { if (!e.target.closest(".g-act")) setOpen(id); }}>
              <span className="g-act">
                {ungraded
                  ? <input type="checkbox" className="g-pick" aria-label={`Select ${topicOf(c)} for grading`} checked={picked.has(id)} disabled={working || (!picked.has(id) && picked.size >= RUN_MAX)} onChange={() => toggle(id)} />
                  : null}
              </span>
              <i className={`dot d-${c.security_flag ? "bad" : c.scored_at ? "ok" : "none"}`} aria-hidden="true" />
              <div>
                <div className="main">
                  <button type="button" className="g-open" onClick={() => setOpen(id)}>{topicOf(c)}</button>
                  {CHANNEL_LABEL[c.channel] && <span className="tag">{CHANNEL_LABEL[c.channel]}</span>}
                  {c.security_flag && <span className="tag bad">Security</span>}
                  {tag && <span className="tag">{tag}</span>}
                </div>
                <div className="sub">{when(c.started_at)} · verification {c.auth_outcome === "not_attempted" ? "not attempted" : (c.auth_outcome || "unknown")}{c.outcome ? ` · ${c.outcome}` : ""}</div>
              </div>
              <div className="meta g-meta g-act">
                <span>{c.scored_at ? `graded ${when(c.scored_at)}` : "not graded"}</span>
                {ungraded && <button className="btn sec sm" type="button" disabled={working} title={`Grade this interaction, ${oneCost()}`} onClick={() => gradeOne(id)}>{busy === id ? "Grading…" : "Grade"}</button>}
                {c.source_status === "no_source" && confirm !== id && <button className="btn sec sm" type="button" disabled={working} onClick={() => setConfirm(id)}>Re-grade</button>}
              </div>
              {confirm === id && !ungraded && (
                <div className="g-confirm g-act">
                  <span>Re-grading replaces this interaction's grade. The new rows are written first, and only the old rows they replace are removed. Survey answers and the call record are not touched. Costs {oneCost()}.</span>
                  <button className="btn sm" type="button" disabled={working} onClick={() => regrade(id)}>{busy === id ? "Grading…" : "Re-grade"}</button>
                  <button className="btn sec sm" type="button" onClick={() => setConfirm(null)}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {data && calls.length < data.matching && (
        <button className="more" type="button" disabled={paging} onClick={more}>{paging ? "Loading…" : `Show more · ${data.matching - calls.length} left`}</button>
      )}
      <CallDrawer id={open} withScores onClose={close} actions={drawerAction} reload={reload} />
    </>
  );
}
