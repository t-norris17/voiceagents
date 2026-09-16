// About Robin: the full configuration, read live from ElevenLabs on every request. This is the
// block that used to sit beside the landing page's title; it moved here so the front door stays
// quiet. Never a file in this repo: every stale-file incident this project has had came from
// trusting a file over the platform.
import { getRobinStatus } from "../../lib/elevenlabs.js";
import { brokerJson } from "../../lib/broker.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "About Robin" };

function when(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }) + " CT";
}

export default async function About() {
  const [status, calls] = await Promise.all([getRobinStatus(), brokerJson("/api/calls?limit=1")]);
  const s = status?.ok ? status : null;
  const summary = calls?.summary || null;

  return (
    <section className="about">
      <div>
        <h1>About {s?.name || "Robin"}</h1>
        <p className="lede">
          The 401(k) voice agent for the Vertex Manufacturing plan. She answers plan questions from her
          Knowledge Base and looks up a verified caller's own figures. Built on ElevenLabs; everything
          on this page is read from her live configuration, not from a document.
        </p>
        {s?.phone && <div className="phone tnum">{s.phone}</div>}
        {!s && <div className="warn">Live status unavailable: {status?.reason || "unknown"}.</div>}
      </div>
      {s && (
        <dl className="facts">
          <dt>Version</dt>
          <dd>
            {s.version_seq != null ? `v${s.version_seq}` : s.version_id}
            {s.version_description ? <> · {s.version_description}</> : null}
            {s.version_committed_at ? <span className="muted"> · {when(s.version_committed_at)}</span> : null}
          </dd>
          <dt>Model</dt>
          <dd>{s.llm || "—"}<span className="muted"> · voice {s.tts_model || "—"}</span></dd>
          <dt>Knows</dt>
          <dd><div className="chips">{s.knowledge_base.map((k) => <span className="chip" key={k}>{k}</span>)}</div></dd>
          <dt>Can do</dt>
          <dd><div className="chips">{s.tools.map((k) => <span className="chip" key={k}>{k}</span>)}</div></dd>
          {s.procedures.length > 0 && (<><dt>Procedures</dt><dd>{s.procedures.join(" · ")}</dd></>)}
          <dt>Calls</dt>
          <dd>{summary ? <>{summary.last_7d} in the last 7 days · {summary.last_24h} in the last 24 hours</> : <span className="muted">unavailable</span>}</dd>
          <dt>Read</dt>
          <dd className="muted">{when(s.fetched_at)}</dd>
        </dl>
      )}
    </section>
  );
}
