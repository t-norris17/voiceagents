// POST /api/ask  { question }  ->  { answer }
// Phase-1 text test tool. Answers a plan question the way Robin would — grounded in
// the embedded INTRUST Knowledge Base — so the boss can pressure-test answer quality
// and variation WITHOUT placing a call. Uses the same model Robin runs on
// (Haiku 4.5) at a similar temperature, so this reflects Robin's actual brain.
import Anthropic from "@anthropic-ai/sdk";
import { KB } from "../lib/kb.js";
import { qaSystem } from "../lib/robin-prompt.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

// Robin's REAL answer behavior (from lib/robin-prompt.js, mirroring the production prompt),
// in an already-verified text context. This is what keeps the tester's brevity/tone true to
// how Robin actually answers on a call.
const SYSTEM = qaSystem(KB);

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
      system: SYSTEM,
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
