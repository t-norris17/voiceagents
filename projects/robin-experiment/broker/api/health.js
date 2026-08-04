// GET /api/health -> is this deployment actually wired up?
//
// The dashboard's failure mode was that a broken pipeline and an idle one look the same: an empty
// table either way. Almost every real cause is a missing environment variable or an un-run
// migration on THIS deployment, none of which the dashboard could see. So it asks here first.
//
// Reports presence, never values. A secret's name is safe to show; its contents are not, and this
// endpoint is reachable by anyone who can reach the dashboard.
import { sb } from "../lib/supabase.js";

const has = (k) => !!(process.env[k] && String(process.env[k]).trim());

// Does this table exist and can we read it? PostgREST 404s an unknown table, which is exactly the
// signal we want for "the migration hasn't been run here".
async function probe(table) {
  try {
    // `limit=0` asks Postgres for the table and no rows: it proves the table is readable without
    // dragging back a row (ai_call_events rows carry a full transcript and raw webhook payload).
    //
    // NOT `select=1` — PostgREST reads that as "the column named 1", so every probe came back
    // `column ai_call_events.1 does not exist` and health reported six fatal problems on a
    // perfectly healthy database. A checker that cries wolf is worse than no checker; it teaches
    // you to ignore the one time it's right.
    await sb(`${table}?limit=0`);
    return { ok: true };
  } catch (e) {
    const msg = String(e.message || e);
    if (/^supabase 40[14]/.test(msg)) return { ok: false, missing: true, error: msg.slice(0, 200) };
    return { ok: false, missing: false, error: msg.slice(0, 200) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const env = {
    SUPABASE_URL: has("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
    ELEVENLABS_WEBHOOK_SECRET: has("ELEVENLABS_WEBHOOK_SECRET"),
    ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
    ELEVENLABS_API_KEY: has("ELEVENLABS_API_KEY"),
    ELEVENLABS_AGENT_ID: has("ELEVENLABS_AGENT_ID"),
  };

  const tables = {};
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const names = ["ai_call_events", "call_question_scores", "call_questions", "kb_articles", "webhook_ingest_log", "kb_document_cache"];
    const results = await Promise.all(names.map((n) => probe(n)));
    names.forEach((n, i) => { tables[n] = results[i]; });
  }

  // Ordered worst-first: each line is something a person can go and fix, named with the thing to fix.
  const problems = [];
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    problems.push({ severity: "fatal", what: "No database connection", fix: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on this deployment. Nothing can be stored or read until then." });
  if (!env.ELEVENLABS_WEBHOOK_SECRET)
    problems.push({ severity: "fatal", what: "Calls can't be received", fix: "Set ELEVENLABS_WEBHOOK_SECRET to the signing secret from the ElevenLabs post-call webhook config. Every incoming call is rejected without it." });
  if (!env.ANTHROPIC_API_KEY)
    problems.push({ severity: "fatal", what: "Calls can't be graded", fix: "Set ANTHROPIC_API_KEY. Calls will still arrive and be listed, but nothing gets scored." });
  if (!env.ELEVENLABS_API_KEY)
    problems.push({ severity: "fatal", what: "Answers can't be checked for accuracy",
      fix: "Set ELEVENLABS_API_KEY. Without it the grader can only read knowledge-base documents we published ourselves — anything uploaded in the ElevenLabs dashboard is invisible to it, so answers grade as 'no source' and there is no accuracy figure or utilization number." });
  const OPTIONAL = new Set(["webhook_ingest_log", "kb_document_cache"]);
  for (const [name, t] of Object.entries(tables))
    if (t.missing)
      problems.push({ severity: OPTIONAL.has(name) ? "warn" : "fatal",
        what: `Table ${name} is missing`,
        fix: `Run the migration that creates ${name} against this project's database.` });
    else if (!t.ok)
      problems.push({ severity: "fatal", what: `Can't read ${name}`, fix: t.error });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: !problems.some((p) => p.severity === "fatal"),
    checked_at: new Date().toISOString(),
    env, tables, problems,
  });
}
