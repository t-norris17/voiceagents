// POST /api/ask  { question }  ->  { answer }
// GET  /api/ask                ->  { kb: { documents, unreadable } }   (no model call, no cost)
//
// The dry-run text tool. It answers a caller's question the way Robin would RIGHT NOW: her live prompt
// and the documents attached to her, both read from ElevenLabs (lib/robin-live.js). Same model family and
// temperature as her agent configuration. If Robin's configuration cannot be read it says so; it never
// falls back to some other knowledge.
import Anthropic from "@anthropic-ai/sdk";
import { liveRobin, dryRunSystem } from "../lib/robin-live.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const live = await liveRobin();
      return res.status(200).json({ kb: { documents: live.documents.map(({ name, usage_mode }) => ({ name, usage_mode })), unreadable: live.unreadable } });
    } catch (e) { return res.status(503).json({ error: String(e.message || e) }); }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
  try {
    const { question } = req.body || {};
    const q = String(question || "").trim();
    if (!q) return res.status(400).json({ error: "no question" });

    let live;
    try { live = await liveRobin(); }
    catch (e) { return res.status(503).json({ error: String(e.message || e) }); }

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      temperature: Math.min(1, Math.max(0, live.temperature)), // her configured temperature, so resend varies as she does
      system: dryRunSystem(live),
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
