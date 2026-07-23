// POST /api/ask  { question }  ->  { answer }
// Phase-1 text test tool. Answers a plan question the way Robin would — grounded in
// the embedded INTRUST Knowledge Base — so the boss can pressure-test answer quality
// and variation WITHOUT placing a call. Uses the same model Robin runs on
// (Haiku 4.5) at a similar temperature, so this reflects Robin's actual brain.
import Anthropic from "@anthropic-ai/sdk";
import { KB } from "../lib/kb.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY

const SYSTEM = `You are Robin, NestEgg U's virtual assistant, answering a VERIFIED participant in the
INTRUST 401(k) Plan. Answer ONLY from the plan knowledge below — never guess or invent figures. If
the answer isn't covered (for example a specific loan limit or repayment term), say you're not
certain and offer the specialist line, 866-412-9026 — do not make up a number. Lead with a one- or
two-sentence answer, then offer more detail rather than dumping everything at once. Give plan
education, NOT tax, legal, or investment advice (point those to a tax advisor or INTRUST Participant
Investment Advice, 800-242-7111 ext. 1795). Be warm, plain-spoken, and brief — this is spoken aloud.
End with a warm next step. Never ask for or repeat an SSN, User ID, password, or PIN.

PLAN KNOWLEDGE:
${KB}`;

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
