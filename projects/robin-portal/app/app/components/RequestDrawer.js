"use client";
// One request, opened: what they need, the callback time Robin was given to read, the number to call,
// the verify reminder, the callback log, history, and what happened on the call.
//
// Every action is one POST to /api/requests, which the broker runs as one transaction (the history row
// and any status change together). The drawer reloads the queue after each, so what it shows is always
// what the database says, never a local guess.
import { useEffect, useState } from "react";
import { TYPE_LABEL, nameOf, stamp, when, phone, eventLine } from "../../lib/request-view.js";

const ATTEMPTS = [
  { action: "reached", label: "Reached" },
  { action: "voicemail", label: "Left voicemail" },
  { action: "no_answer", label: "No answer" },
];

export default function RequestDrawer({ r, tz, now, onClose, onChanged, onTranscript }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setNote(""); setErr(null); }, [r.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function act(action) {
    setBusy(action); setErr(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id, action, note: note.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setNote("");
      await onChanged();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(null); }
  }

  const name = nameOf(r);
  const events = [...(r.events || [])].reverse();
  const closed = r.status === "closed";
  const filedBy = r.source === "tool" ? "filed by Robin during the call" : "filed after the call (the caller hung up before Robin filed it)";

  return (
    <div className="drw" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drw-p" role="dialog" aria-modal="true" aria-label={`Request from ${name}`}>
        <div className="drw-h">
          <span className="t">{name}</span>
          <button className="drw-x" type="button" onClick={onClose}>Close ×</button>
        </div>

        <div className="drw-meta">
          <b>{TYPE_LABEL[r.request_type] || r.request_type}</b> · {filedBy}, {stamp(r.filed_at, tz)}, phone ·{" "}
          {r.verified ? <><span className="rq-ok">Verified</span> (member ID + date of birth)</> : <span className="rq-bad">Not verified</span>}
          {" "}· due {when(r.due_at, tz, now)}
          {closed && <> · <b>closed {when(r.closed_at, tz, now)}</b></>}
          {r.is_test && <> · <b>test request</b></>}
        </div>

        <div className="section">
          <div className="lbl">What they need</div>
          <p className="rq-need">{r.request_detail || "Robin did not record the details. Ask when you call."}</p>
        </div>

        <div className="section">
          <div className="lbl">The callback time Robin was given to read</div>
          {r.promised_text ? (
            <div className="rq-quote">
              <div>{r.promised_text.charAt(0).toUpperCase() + r.promised_text.slice(1)}</div>
              <div className="src">
                {r.source === "tool"
                  ? "returned by file_request when the request was filed; the transcript shows her exact words"
                  : "returned by get_handoff_option before the caller hung up; the transcript shows whether she said it"}
              </div>
            </div>
          ) : (
            <p className="muted rq-small">No callback time was given to Robin on this call. The caller may not have heard one.</p>
          )}
        </div>

        <div className="section">
          <div className="lbl">Call back</div>
          {r.callback_number ? (
            <div className="rq-phone">
              <a href={`tel:${r.callback_number}`}>{phone(r.callback_number)}</a>
              <span className="rq-why">
                {r.callback_number_source === "stated" ? "the number they asked to be called on" : "the number they called from"}
                {r.callback_window ? ` · they asked for ${r.callback_window}` : ""}
              </span>
            </div>
          ) : (
            <p className="muted rq-small">No number yet. It fills in from caller ID a minute or so after the call ends.</p>
          )}
          <div className="rq-verify">
            {r.verified
              ? "Verify whoever answers before discussing the account. Robin verified the caller, not the person who picks up."
              : "Robin could not verify this caller. Verify them fully before discussing anything about the account."}
          </div>
        </div>

        <div className="section">
          <div className="lbl">Log a callback</div>
          <div className="rq-log">
            <div className="rq-btns">
              {ATTEMPTS.map((a) => (
                <button key={a.action} type="button" className="btn sec" disabled={!!busy} onClick={() => act(a.action)}>
                  {busy === a.action ? "Saving…" : a.label}
                </button>
              ))}
            </div>
            <textarea className="rq-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Note (optional): what was done, or what happens next" maxLength={2000} />
            {err && <div className="rq-err">Not saved: {err}</div>}
            <div className="rq-foot">
              {closed ? (
                <>
                  <span>Closed. Reopen it to put it back in Open.</span>
                  <button type="button" className="btn" disabled={!!busy} onClick={() => act("reopen")}>{busy === "reopen" ? "Saving…" : "Reopen"}</button>
                </>
              ) : (
                <>
                  <span>Closing it removes it from Open. The call and this history stay.</span>
                  <span className="rq-foot-btns">
                    <button type="button" className="btn sec" disabled={!!busy || !note.trim()} onClick={() => act("note")}>{busy === "note" ? "Saving…" : "Save note"}</button>
                    <button type="button" className="btn" disabled={!!busy} onClick={() => act("close")}>{busy === "close" ? "Saving…" : "Close request"}</button>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          <div className="lbl">History</div>
          {events.length === 0 && <p className="muted rq-small">Nothing logged yet.</p>}
          {events.map((e, i) => {
            const l = eventLine(e);
            return (
              <div className="rq-ev" key={i}>
                <span className="at">{stamp(e.at, tz)}</span>
                <span>
                  <span className="what">{l.what}</span>
                  {l.who && <span className="muted"> · {l.who}</span>}
                  {l.note && <span className="muted"> · “{l.note}”</span>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="section">
          <div className="lbl">From the call</div>
          {r.call?.summary ? (
            <>
              {r.call.title && <div className="rq-title">{r.call.title}</div>}
              <p className="rq-sum">{r.call.summary}</p>
              <div className="muted rq-small">Summary written by ElevenLabs after the call.</div>
            </>
          ) : (
            <p className="muted rq-small">{r.conversation_id ? "No summary stored for this call." : "Not linked to its call yet. That happens a minute or so after the call ends."}</p>
          )}
          {r.conversation_id && (
            <button type="button" className="more" onClick={onTranscript}>Open the transcript →</button>
          )}
        </div>
      </div>
    </div>
  );
}
