// GET /api/health -> the wiring check. Deliberately outside the password gate (middleware.js), so it
// can be read from a phone or a connector when the doors are dark. It says whether the broker
// accepts this deployment's internal secret and whether ElevenLabs accepts its key, plus Robin's
// version number as proof the key returned real data. No secrets, no call data, nothing a member
// said. Cached for 30 seconds so an unauthenticated loop cannot spend upstream calls.
import { getRobinStatus } from "../../../lib/elevenlabs.js";

export const dynamic = "force-dynamic";

const TTL_MS = 30_000;
let cache = { at: 0, value: null };

async function probeBroker() {
  const base = process.env.BROKER_URL;
  if (!base) return { configured: false };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/calls?limit=1`, {
      headers: { "x-robin-internal": process.env.ROBIN_INTERNAL_SECRET || "" },
      cache: "no-store",
    });
    return { configured: true, reachable: true, secret_accepted: res.status === 200, status: res.status };
  } catch (e) {
    return { configured: true, reachable: false, error: String(e?.message || e) };
  }
}

export async function GET() {
  if (Date.now() - cache.at < TTL_MS && cache.value) {
    return Response.json(cache.value, { headers: { "cache-control": "no-store" } });
  }
  const [broker, robin] = await Promise.all([probeBroker(), getRobinStatus()]);
  const value = {
    ok: broker.secret_accepted === true && robin.ok === true,
    deployed: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    broker,
    elevenlabs: robin.ok
      ? { key_accepted: true, version_seq: robin.version_seq }
      : { key_accepted: false, reason: robin.reason },
    checked_at: new Date().toISOString(),
  };
  cache = { at: Date.now(), value };
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}
