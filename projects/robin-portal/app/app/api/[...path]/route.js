// The proxy. /api/<first>/... goes to the broker or the cleaner by lib/upstreams.js, with the
// internal header added. Method, query string, body and the response's content type and
// disposition pass through unchanged, so the copied module pages and the CSV export work as they
// do on their own hosts. Anything unlisted is a 404.
import { upstreamFor } from "../../../lib/upstreams.js";

export const dynamic = "force-dynamic";

async function proxy(request, { params }) {
  const { path = [] } = await params;
  const up = upstreamFor(path[0]);
  if (!up) return Response.json({ error: "not found" }, { status: 404 });

  const url = new URL(request.url);
  const target = `${up.base}/api/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const headers = new Headers();
  for (const h of ["content-type", "accept"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("x-robin-internal", process.env.ROBIN_INTERNAL_SECRET || "");

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let res;
  try {
    res = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      duplex: hasBody ? "half" : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    return Response.json({ error: `${up.name} unreachable: ${String(e?.message || e)}` }, { status: 502 });
  }

  const out = new Headers();
  for (const h of ["content-type", "content-disposition", "cache-control"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
