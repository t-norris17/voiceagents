"use client";
// Which wave of testing a page is about: All, or one row of experiment_waves (the same windows the
// Quality page slices by). The broker returns the list with counts; this draws it and keeps the choice
// in the address (?wave=second) so a filtered view can be shared or reloaded.
import { useEffect, useState } from "react";

export function useWave() {
  const [wave, setWave] = useState("all");
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("wave");
    if (w && /^[a-z0-9_-]{1,40}$/i.test(w)) setWave(w.toLowerCase());
  }, []);
  const choose = (w) => {
    setWave(w);
    const u = new URL(window.location.href);
    if (w === "all") u.searchParams.delete("wave"); else u.searchParams.set("wave", w);
    window.history.replaceState(null, "", u.toString());
  };
  return [wave, choose];
}

export default function WaveFilter({ waves, value, onChange }) {
  if (!Array.isArray(waves) || waves.length < 2) return null; // no waves defined: nothing to choose
  return (
    <div className="waves" role="group" aria-label="Wave">
      <span className="waves-k">Wave</span>
      {waves.map((w) => (
        <button key={w.key} type="button" className={w.key === value ? "on" : ""} aria-pressed={w.key === value} onClick={() => onChange(w.key)}>
          {w.label}<span className="waves-n">{w.count}</span>
        </button>
      ))}
    </div>
  );
}
