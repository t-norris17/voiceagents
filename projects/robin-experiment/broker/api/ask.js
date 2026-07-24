// POST /api/ask  { question }  ->  { answer }
// Phase-1 text test tool. Answers a plan question the way Robin would — grounded in Robin's
// PUBLISHED knowledge base (the kb_articles she's actually serving), so the tester reflects
// what she truly knows RIGHT NOW and stays current as you publish more. Falls back to the
// embedded static KB when nothing is published yet. Uses the same model Robin runs on
// (Haiku 4.5) at a similar temperature, so this reflects Robin's actual brain.
import Anthropic from "@anthropic-ai/sdk";
import { KB as STATIC_KB } from "../lib/kb.js";
import { qaSystem } from "../lib/robin-prompt.js";
import { sb } from "../lib/supabase.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

// The live KB = the published articles. Cached 60s so we don't hit Supabase on every question.
let _kb = { text: null, at: 0 };
async function currentKB() {
  const now = Date.now();
  if (_kb.text && now - _kb.at < 60000) return _kb.text;
  try {
    const rows = await sb(`kb_articles?state=eq.published&select=body_md&order=updated_at.desc`);
    if (rows && rows.length) {
      const text = rows.map((r) => r.body_md).join("\n\n---\n\n");
      _kb = { text, at: now };
      return text;
    }
  } catch (_) { /* fall through to static */ }
  return STATIC_KB;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { question } = req.body || {};
    const q = String(question || "").trim();
    if (!q) return res.status(400).json({ error: "no question" });

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      temperature: 0.5, // mirror Robin's voice temp — gives natural variation on resend
      system: qaSystem(await currentKB()),
      messages: [{ role: "user", content: q }],
    });

    const answer = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
