// The call player's arithmetic: clock text, which line is being spoken, where the turn ticks go, the
// speed cycle. Pure, so it is tested (test/player-view.test.mjs) rather than eyeballed.

// 98 -> "1:38"; 3725 -> "1:02:05". Calls are capped at 600 s, but the format does not assume it.
export function clock(secs) {
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// The line being spoken at time t: the last turn that has started. A turn with no timestamp is never
// "current" (and cannot be jumped to). -1 before the first timed turn.
export function currentTurn(turns, t) {
  let idx = -1;
  for (let i = 0; i < (turns || []).length; i++) {
    const at = turns[i]?.at;
    if (at == null || !Number.isFinite(Number(at))) continue;
    if (Number(at) <= t + 0.05) idx = i; else break;
  }
  return idx;
}

// One tick per timed turn, as a percentage along the bar. Turns past the end are clamped, not dropped,
// so a transcript a second longer than the audio still shows its last question.
export function ticks(turns, duration) {
  const d = Number(duration);
  if (!(d > 0)) return [];
  return (turns || [])
    .filter((x) => x?.at != null && Number.isFinite(Number(x.at)))
    .map((x) => ({ pct: Math.round(Math.min(100, Math.max(0, (Number(x.at) / d) * 100)) * 100) / 100, role: x.role === "agent" ? "agent" : "caller" }));
}

export const SPEEDS = [1, 1.5, 2];
export function nextSpeed(s) {
  const i = SPEEDS.indexOf(s);
  return SPEEDS[(i + 1) % SPEEDS.length];
}
export const speedLabel = (s) => `${s}×`;

// Position under a pointer, in seconds, from the bar's box.
export function seekFromX(clientX, rect, duration) {
  if (!rect || !(rect.width > 0) || !(duration > 0)) return 0;
  return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
}
