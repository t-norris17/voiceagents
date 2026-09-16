// The landing page. Name, one sentence, the phone number, a one-line live status, then five doors,
// each with one line and, where cheap, one live number. The full configuration read from
// ElevenLabs lives on /about. Server-rendered; numbers revalidate every 60 seconds.
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
    { href: "/survey/", t: "Quality", d: "Would they rather use Robin than wait for a person? What callers said, and every number opens to the call behind it.", n: responses, un: "responses" },
    { href: "/grader", t: "Accuracy", d: "Was what Robin said true to the documents she read on each call? Grade new calls and read the evidence.", n: summary?.ungraded_in_window ?? null, un: "ungraded, 7 days" },
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
            Vertex Manufacturing 401(k). Built on ElevenLabs.
          </p>
          {s?.phone && <div className="phone tnum">{s.phone}</div>}
          {!s && <div className="warn">Live status unavailable: {status?.reason || "unknown"}. The doors still work.</div>}
        </div>
        {s && (
          <a className="status-line" href="/about">
            <span className="dot" aria-hidden="true" />
            <span>Live{s.version_seq != null ? `, v${s.version_seq}` : ""}{s.version_committed_at ? ` · updated ${age(s.version_committed_at)}` : ""}</span>
            <span className="more">About Robin &rarr;</span>
          </a>
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
