"use client";
// The call player in the interaction drawer (robin-portal/audio/SPEC.md). Nothing is fetched until
// someone presses play or clicks a line: then /api/call-audio returns a 5-minute link to our cached
// copy (the first play of a call fills that cache from ElevenLabs) and the browser plays straight from
// Storage, which serves byte ranges, so seeking works. Each link the broker issues is one logged listen.
//
// useCallAudio owns the <audio> element and its state; CallPlayer draws the controls. The drawer uses
// the hook's seek() for transcript lines and its `t` to highlight the line being spoken.
import { useCallback, useEffect, useRef, useState } from "react";
import NestLoader from "./NestLoader.js";
import { clock, ticks, nextSpeed, speedLabel, seekFromX } from "../../lib/player-view.js";

export function useCallAudio(id, fallbackDuration) {
  const audio = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [err, setErr] = useState(null);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(Number(fallbackDuration) || 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastRefresh = useRef(0);
  const linkExpiry = useRef(0); // local clock, ms: when the current link stops working
  const renewing = useRef(false);

  useEffect(() => {
    setStatus("idle"); setErr(null); setT(0); setPlaying(false); setSpeed(1);
    setDuration(Number(fallbackDuration) || 0);
    const el = audio.current;
    return () => { if (el) { el.pause(); el.removeAttribute("src"); el.load(); } };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A fresh link from the broker, loaded into the element. Resolves once the browser knows the length.
  // renew: this replaces an expired link mid-listen, so the broker logs it as a renewal, not a new play.
  const fetchLink = useCallback(async ({ renew = false } = {}) => {
    const r = await fetch(`/api/call-audio?id=${encodeURIComponent(id)}${renew ? "&renew=1" : ""}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || `HTTP ${r.status}`);
    linkExpiry.current = Date.now() + (Number(d.expires_in) || 300) * 1000;
    const el = audio.current;
    el.src = d.url;
    el.playbackRate = speed;
    await new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error("the recording would not load")); };
      const cleanup = () => { el.removeEventListener("loadedmetadata", ok); el.removeEventListener("error", bad); };
      el.addEventListener("loadedmetadata", ok);
      el.addEventListener("error", bad);
      el.load();
    });
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
  }, [id, speed]);

  const ensure = useCallback(async () => {
    if (status === "ready") return true;
    if (status === "loading") return false;
    setStatus("loading"); setErr(null);
    try { await fetchLink(); setStatus("ready"); return true; }
    catch (e) { setErr(String(e.message || e)); setStatus("error"); return false; }
  }, [status, fetchLink]);

  // RENEWAL. A link lasts 5 minutes. Chrome does NOT raise an error when a range request on an expired
  // link is refused: it retries the dead link quietly while the player claims to be playing (seen
  // locally 2026-10-07: seven refused retries, no error event). So renewal is driven by the link's own
  // expiry: before a play or a jump on a stale link, and when playback stalls on one. Each renewal is
  // logged by the broker as a renewal, not a new play. At most once per 20 seconds, so a recording that
  // is really gone fails once instead of looping.
  const stale = () => Date.now() > linkExpiry.current - 15000;
  const renew = useCallback(async ({ at, resume }) => {
    const el = audio.current;
    if (!el || renewing.current) return false;
    const now = Date.now();
    if (now - lastRefresh.current < 20000) { setErr("the recording stopped loading"); setStatus("error"); return false; }
    lastRefresh.current = now;
    renewing.current = true;
    const pos = at ?? el.currentTime, wasPlaying = resume ?? !el.paused;
    try {
      await fetchLink({ renew: true });
      el.currentTime = pos; setT(pos);
      if (wasPlaying) await el.play();
      return true;
    } catch (e) { setErr(String(e.message || e)); setStatus("error"); return false; }
    finally { renewing.current = false; }
  }, [fetchLink]);

  const play = useCallback(async (at) => {
    if (status === "ready" && stale()) { await renew({ at: at ?? audio.current.currentTime, resume: true }); return; }
    if (!(await ensure())) return;
    const el = audio.current;
    if (at != null) { el.currentTime = Math.max(0, at); setT(el.currentTime); }
    try { await el.play(); } catch (e) { if (e?.name !== "AbortError") { setErr(String(e.message || e)); } }
  }, [ensure, renew, status]);

  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);

  // Before the first play a seek just moves the playhead; it plays from there when play is pressed.
  const seek = useCallback((at, { andPlay = false } = {}) => {
    const el = audio.current;
    if (status === "ready" && el) {
      const pos = Math.max(0, Math.min(at, el.duration || at));
      if (stale()) { renew({ at: pos, resume: andPlay || !el.paused }); return; }
      el.currentTime = pos; setT(pos);
      if (andPlay && el.paused) el.play().catch(() => {});
      return;
    }
    setT(at);
    if (andPlay) play(at);
  }, [status, play, renew]);

  const cycleSpeed = useCallback(() => {
    const s = nextSpeed(speed);
    setSpeed(s);
    if (audio.current) audio.current.playbackRate = s;
  }, [speed]);

  // Element events. A stall on a stale link renews it (see RENEWAL above); an error renews regardless.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    let raf = 0;
    const tick = () => { setT(el.currentTime); raf = requestAnimationFrame(tick); };
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(raf); setT(el.currentTime); };
    const onTime = () => { if (el.paused) setT(el.currentTime); };
    const onError = () => { if (status === "ready" && !renewing.current) renew({}); };
    const onStall = () => { if (status === "ready" && !renewing.current && stale()) renew({}); };
    el.addEventListener("play", onPlay); el.addEventListener("pause", onPause); el.addEventListener("ended", onPause);
    el.addEventListener("timeupdate", onTime); el.addEventListener("error", onError);
    el.addEventListener("waiting", onStall); el.addEventListener("stalled", onStall);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); el.removeEventListener("ended", onPause);
      el.removeEventListener("timeupdate", onTime); el.removeEventListener("error", onError);
      el.removeEventListener("waiting", onStall); el.removeEventListener("stalled", onStall);
    };
  }, [status, renew]);

  // The call's length is known from the call record before any audio loads; keep it until the
  // recording itself says otherwise.
  useEffect(() => { if (status !== "ready") setDuration(Number(fallbackDuration) || 0); }, [fallbackDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload="metadata" is inert until a link is set (no src, nothing loads); after that it lets the
  // browser read the length without downloading the call.
  const element = <audio ref={audio} preload="metadata" />;
  return { element, status, err, t, duration, playing, speed, play, pause, toggle, seek, cycleSpeed };
}

export default function CallPlayer({ a, turns, follow, onFollow }) {
  const bar = useRef(null);
  const marks = ticks(turns, a.duration);
  const pct = a.duration > 0 ? Math.min(100, (a.t / a.duration) * 100) : 0;
  const dragging = useRef(false);

  const fromPointer = (e) => a.seek(seekFromX(e.clientX, bar.current.getBoundingClientRect(), a.duration));
  const onKey = (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, PageDown: -30, PageUp: 30 }[e.key];
    if (step != null) { e.preventDefault(); a.seek(Math.max(0, Math.min(a.duration, a.t + step))); }
    else if (e.key === "Home") { e.preventDefault(); a.seek(0); }
    else if (e.key === "End") { e.preventDefault(); a.seek(a.duration); }
    else if (e.key === " " || e.key === "k") { e.preventDefault(); a.toggle(); }
  };

  return (
    <div className="pl">
      {a.element}
      <div className="pl-row">
        <button type="button" className="pl-btn" onClick={a.toggle} disabled={a.status === "loading"}
                aria-label={a.playing ? "Pause" : "Play the call"}>
          {a.playing
            ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" /><rect x="9.5" y="2.5" width="3" height="11" /></svg>
            : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.2v11.6L13.5 8z" /></svg>}
        </button>
        <span className="pl-t">{clock(a.t)}</span>
        <div className="pl-bar" ref={bar} role="slider" tabIndex={0} aria-label="Position in the call"
             aria-valuemin={0} aria-valuemax={Math.round(a.duration)} aria-valuenow={Math.round(a.t)}
             aria-valuetext={`${clock(a.t)} of ${clock(a.duration)}`}
             onKeyDown={onKey}
             onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }}
             onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
             onPointerUp={() => { dragging.current = false; }}
             onPointerCancel={() => { dragging.current = false; }}>
          <div className="pl-track"><div className="pl-fill" style={{ width: `${pct}%` }} /><div className="pl-head" style={{ left: `${pct}%` }} /></div>
          <div className="pl-ticks" aria-hidden="true">
            {marks.map((m, i) => <i key={i} className={m.role} style={{ left: `${m.pct}%` }} />)}
          </div>
        </div>
        <span className="pl-t end">{clock(a.duration)}</span>
        <button type="button" className="pl-speed" onClick={a.cycleSpeed} aria-label={`Playback speed ${speedLabel(a.speed)}, change`}>{speedLabel(a.speed)}</button>
      </div>
      {a.status === "loading" ? (
        <div className="pl-load"><NestLoader size={40} label="Fetching the recording" block={false} /></div>
      ) : a.status === "error" ? (
        <div className="pl-note bad">Couldn't play the recording: {a.err}. The transcript below is unaffected.</div>
      ) : (
        <div className="pl-note">
          <span>Ticks are turns · <b>dark = caller</b> · click any line to jump there</span>
          <span>
            <button type="button" className={`pl-follow ${follow ? "on" : ""}`} onClick={onFollow} aria-pressed={follow}>
              {follow ? "Following along" : "Follow along"}
            </button>
            {" · "}this listen is logged
          </span>
        </div>
      )}
    </div>
  );
}
