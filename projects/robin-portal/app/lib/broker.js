// Server-side reads from the broker, for pages that render numbers before the browser loads.
// Carries the internal header; never runs in the browser.
import "server-only";

export async function brokerJson(path, { revalidate = 30 } = {}) {
  const base = process.env.BROKER_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      headers: { "x-robin-internal": process.env.ROBIN_INTERNAL_SECRET || "" },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
