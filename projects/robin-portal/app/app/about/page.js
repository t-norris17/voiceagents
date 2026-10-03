// About Robin: the full configuration, read live from ElevenLabs on every request. This is the
// block that used to sit beside the landing page's title; it moved here so the front door stays
// quiet. Never a file in this repo: every stale-file incident this project has had came from
// trusting a file over the platform.
import { getRobinStatus } from "../../lib/elevenlabs.js";
import { brokerJson } from "../../lib/broker.js";
import { describeAbilities, describeKnowledge } from "../../lib/robin-facts.js";

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
    <>
      <div className="kicker">Robin</div>
      <div className="page-h">
        <div>
          <h1>About {s?.name || "Robin"}</h1>
          <p>
            The 401(k) voice agent for the Vertex Manufacturing plan. She answers plan questions from her
            Knowledge Base and looks up a verified caller's own figures. Built on ElevenLabs; everything
            on this page is read from her live configuration, not from a document.
          </p>
        </div>
      </div>
      {!s && <div className="banner">Live status unavailable: {status?.reason || "unknown"}.</div>}
      {s && (
        <>
          <div className="stat-row">
            {s.phone && <div className="stat"><div className="n tnum ab-phone">{s.phone}</div><div className="k">phone number</div></div>}
            <div className="stat">
              <div className="n">{s.version_seq != null ? `v${s.version_seq}` : s.version_id}</div>
              <div className="k">live version{s.version_committed_at ? ` · ${when(s.version_committed_at)}` : ""}</div>
            </div>
            <div className="stat">
              <div className="n">{summary ? summary.last_7d : "–"}</div>
              <div className="k">interactions, last 7 days{summary ? ` · ${summary.last_24h} in the last 24 hours` : ""}</div>
            </div>
          </div>
          {s.version_description && <p className="ab-note">{s.version_description}</p>}

          <div className="ab-cols">
            <section className="u-sec">
              <div className="lbl">She can answer questions about</div>
              <ul className="ab-list">
                {describeKnowledge(s.knowledge_base).map((k) => (
                  <li key={k.label}>{k.label}<span className="raw">{k.raw.join(", ")}</span></li>
                ))}
              </ul>
            </section>
            <section className="u-sec">
              <div className="lbl">She can</div>
              <ul className="ab-list">
                {describeAbilities(s.tools).map((k) => (
                  <li key={k.raw}>{k.label}<span className="raw">{k.raw}</span></li>
                ))}
              </ul>
            </section>
          </div>

          <section className="u-sec">
            <div className="lbl">How she is set up</div>
            <dl className="ab-conf">
              <dt>Model</dt><dd>{s.llm || "—"}</dd>
              <dt>Voice</dt><dd>{s.tts_model || "—"}</dd>
              {s.procedures.length > 0 && (<><dt>Procedures</dt><dd>{s.procedures.join(" · ")}</dd></>)}
              <dt>Read from ElevenLabs</dt><dd className="muted">{when(s.fetched_at)}</dd>
            </dl>
          </section>
        </>
      )}
    </>
  );
}
