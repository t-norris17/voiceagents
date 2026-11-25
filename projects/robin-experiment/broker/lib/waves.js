// Waves for Interactions and Requests: the SAME rows the Quality page slices by (experiment_waves, see
// migration 017 and lib/survey-slice.js), so "Second wave" means the same calls on every page. A wave is
// a date window [started_at, ended_at); ended_at null means still running. To add a wave, insert a row.
//
// Pure apart from loadWaves, so the window rules are tested (test/waves.test.mjs).

// Fails soft: a waves read that errors leaves the page working with no wave filter, never broken.
export async function loadWaves(db) {
  try {
    const rows = await db("experiment_waves?select=wave,label,internal,started_at,ended_at&order=started_at.asc");
    return (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.wave === "string" && r.wave);
  } catch (e) {
    console.error("waves: could not read experiment_waves, continuing without:", String(e?.message || e));
    return [];
  }
}

// The wave a ?wave= parameter names, or null for "all" (no parameter, "all", or a name no row has).
export function pickWave(waves, raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key || key === "all") return null;
  const w = (waves || []).find((x) => String(x.wave).toLowerCase() === key);
  if (!w) return null;
  return {
    key: w.wave, label: w.label || w.wave, internal: !!w.internal,
    from: w.started_at ? Date.parse(w.started_at) : null,
    to: w.ended_at ? Date.parse(w.ended_at) : null,
  };
}

// Is this timestamp inside the wave? Start inclusive, end exclusive, like the Quality slicer. A row
// with no timestamp belongs to no wave.
export function inWave(ts, w) {
  if (!w) return true;
  const t = Date.parse(String(ts || ""));
  if (!Number.isFinite(t)) return false;
  if (w.from != null && t < w.from) return false;
  if (w.to != null && t >= w.to) return false;
  return true;
}

// The filter row: every wave with how many of these rows fall in it, in date order, after "All".
export function waveOptions(waves, rows, field) {
  const opts = [{ key: "all", label: "All", count: (rows || []).length }];
  for (const x of waves || []) {
    const w = pickWave([x], x?.wave);
    if (!w) continue;
    opts.push({ key: w.key, label: w.label, internal: w.internal, count: (rows || []).filter((r) => inWave(r[field], w)).length });
  }
  return opts;
}
