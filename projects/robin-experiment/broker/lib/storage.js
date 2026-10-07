// Minimal Supabase Storage client, no npm deps, service role only (same key and rules as supabase.js).
// Used for one private bucket, call-audio, which caches recordings for Birdnest's player.
const BASE = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra = {}) {
  const key = KEY();
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}
function need() {
  if (!BASE() || !KEY()) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}
const objectPath = (bucket, path) => `${encodeURIComponent(bucket)}/${String(path).split("/").map(encodeURIComponent).join("/")}`;

// Upload (overwriting). cacheSeconds sets the object's Cache-Control, which is also how long the CDN
// may keep serving a signed URL's response after the token expires (Supabase Smart CDN docs).
export async function putObject(bucket, path, bytes, { contentType, cacheSeconds = 60, fetchImpl = fetch } = {}) {
  need();
  const res = await fetchImpl(`${BASE()}/storage/v1/object/${objectPath(bucket, path)}`, {
    method: "POST",
    headers: headers({ "content-type": contentType || "application/octet-stream", "cache-control": `max-age=${cacheSeconds}`, "x-upsert": "true" }),
    body: bytes,
  });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// A URL anyone holding it can read until it expires. Returned as an absolute URL.
export async function signObject(bucket, path, { expiresIn = 300, fetchImpl = fetch } = {}) {
  need();
  const res = await fetchImpl(`${BASE()}/storage/v1/object/sign/${objectPath(bucket, path)}`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`storage sign ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const rel = d.signedURL || d.signedUrl;
  if (!rel) throw new Error("storage sign: no signedURL in response");
  return /^https?:/.test(rel) ? rel : `${BASE()}/storage/v1${rel.startsWith("/") ? "" : "/"}${rel}`;
}

// Delete. A missing object is not an error: the goal is that it is gone.
export async function deleteObject(bucket, path, { fetchImpl = fetch } = {}) {
  need();
  const res = await fetchImpl(`${BASE()}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!res.ok && res.status !== 404) throw new Error(`storage delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function bucketExists(bucket, { fetchImpl = fetch } = {}) {
  need();
  const res = await fetchImpl(`${BASE()}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { headers: headers() });
  return res.ok;
}
