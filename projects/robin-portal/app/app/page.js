// The landing page. An information block read live from ElevenLabs, then five doors, each with one
// line and, where cheap, one live number. Server-rendered; numbers revalidate every 60 seconds.
import { getRobinStatus } from "../lib/elevenlabs.js";
import { brokerJson } from "../lib/broker.js";

// Rendered per request (the numbers and the live status must never be a build-time snapshot);
// the fetches underneath are cached for 60 seconds, so a burst of viewers costs one upstream call.
export const dynamic = "force-dynamic";

function age(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export default async function Home() {
  const [status, calls, metrics] = await Promise.all([
    getRobinStatus(),
    brokerJson("/api/calls?limit=1"),
    brokerJson("/api/metrics", { revalidate: 60 }),
  ]);
  const s = status?.ok ? status : null;
  const summary = calls?.summary || null;
  const responses = metrics?.survey?.responses ?? null;

  const doors = [
    { href: "/survey/", t: "Survey", d: "Would they rather use Robin than wait for a person? Every number opens to the call behind it.", n: responses, un: "responses" },
    { href: "/grader", t: "Grader", d: "Scores what Robin said against what she read on each call. Grade new calls and read the evidence.", n: summary?.ungraded_in_window ?? null, un: "ungraded, 7 days" },
    { href: "/factory/", t: "Knowledge Factory", d: "Turn a messy source into a Robin-ready article, test it, publish it to her Knowledge Base.", n: null, un: null },
    { href: "/robin-q-tester/", t: "Question Tester", d: "Ask a question the way a caller would and see what Robin's published knowledge answers.", n: null, un: null },
    { href: "/calls", t: "Calls", d: "Every recent call: who verified, what they asked, how it ended, and the transcript.", n: summary?.last_24h ?? null, un: "calls, 24 h" },
  ];

  return (
    <>
      <section className="info">
        <div>
          <h1>{s?.name || "Robin"}, the 401(k) voice agent</h1>
          <p className="lede">
            Answers plan questions and looks up a verified caller's own figures over the phone, for the
            Vertex Manufacturing 401(k). Built on ElevenLabs; this page reads her live configuration.
          </p>
          {s?.phone && <div className="phone tnum">{s.phone}</div>}
          {!s && <div className="warn">Live status unavailable: {status?.reason || "unknown"}. The doors still work.</div>}
        </div>
        {s && (
          <dl className="facts">
            <dt>Version</dt>
            <dd>
              {s.version_seq != null ? `v${s.version_seq}` : s.version_id}
              {s.version_description ? <> · {s.version_description}</> : null}
              {s.version_committed_at ? <span className="muted"> · {age(s.version_committed_at)}</span> : null}
            </dd>
            <dt>Model</dt>
            <dd>{s.llm || "—"}<span className="muted"> · voice {s.tts_model || "—"}</span></dd>
            <dt>Knows</dt>
            <dd><div className="chips">{s.knowledge_base.map((k) => <span className="chip" key={k}>{k}</span>)}</div></dd>
            <dt>Can do</dt>
            <dd><div className="chips">{s.tools.map((k) => <span className="chip" key={k}>{k}</span>)}</div></dd>
            {s.procedures.length > 0 && (<><dt>Procedures</dt><dd>{s.procedures.join(" · ")}</dd></>)}
            <dt>Calls</dt>
            <dd>{summary ? <>{summary.last_7d} in the last 7 days</> : <span className="muted">unavailable</span>}</dd>
          </dl>
        )}
      </section>

      <section className="doors" aria-label="Sections">
        {doors.map((d) => (
          <a className="door" href={d.href} key={d.href}>
            <span className="t">{d.t}</span>
            <span className="d">{d.d}</span>
            {d.n != null ? (
              <span className="n tnum">{d.n}<span className="un">{d.un}</span></span>
            ) : (
              <span className="n" aria-hidden="true">&nbsp;</span>
            )}
          </a>
        ))}
      </section>
    </>
  );
}
