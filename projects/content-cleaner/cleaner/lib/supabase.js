// Minimal Supabase REST (PostgREST) client — no npm deps. Mirrors broker/lib/supabase.js.
// The SERVICE ROLE key lives ONLY here, server-side. Never ships to the browser. RLS is
// bypassed by the service role by design (kb_articles is service-role only).
const BASE = process.env.SUPABASE_URL; // e.g. https://rlhybqslnqhggbykjrqg.supabase.co
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sb(path, { method = "GET", body, prefer } = {}) {
  if (!BASE || !KEY) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
