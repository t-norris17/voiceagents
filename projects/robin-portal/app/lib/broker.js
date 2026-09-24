// Server-side reads from the broker, for pages that render numbers before the browser loads.
// Carries the internal header; never runs in the browser.
import "server-only";
import { brokerBase } from "./upstreams.js";

// The same broker the proxy uses: the branch's broker preview on a preview build, production
// otherwise, so the home tiles and the Quality page never quote two different brokers.
export async function brokerJson(path, { revalidate = 30 } = {}) {
  const base = brokerBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { "x-robin-internal": process.env.ROBIN_INTERNAL_SECRET || "" },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
