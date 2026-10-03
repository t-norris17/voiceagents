// Minimal Supabase REST (PostgREST) client — no npm deps.
// The SERVICE ROLE key lives ONLY here, server-side. Never ships to the browser
// or the ElevenLabs tool config. RLS is bypassed by the service role by design.
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
  // A "return=minimal" write comes back empty (201/200/204, no body). Don't call res.json() on
  // an empty body — it throws "Unexpected end of JSON input" and turns a successful write into a
  // 500 (which made the post-call webhook look failed and get retried). Parse only when there's text.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Every row of a query, a page at a time. PostgREST (Supabase) returns at most 1000 rows per request
// whatever `limit` says, so a single `&limit=5000` quietly stops at 1000 once a table grows past that.
// `path` must not carry its own limit or offset; give it a stable `order=` so pages do not overlap.
export async function sbAll(path, { pageSize = 1000, max = 50000, fetcher = sb } = {}) {
  const out = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let offset = 0; offset < max; offset += pageSize) {
    const page = await fetcher(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page)) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
