// GET /api/channels -> { channels: { <conversation_id>: "phone" | "web_voice" | "chat" } }
//
// One small map the Quality page uses to put a channel pill on each interaction row, so the survey does
// not have to thread a new field through every one of its row shapes. Derived at read time from the stored
// webhook payload (lib/channel.js), and, like /api/calls, it carries no phone number: only the channel.
// A conversation whose payload does not say is left out of the map rather than guessed. If the database
// rejects the channel select, this returns an empty map and the page simply shows no pills.
import { sbAll } from "../lib/supabase.js";
import { CHANNEL_COLS, channelOf } from "../lib/channel.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    let rows = [];
    try {
      rows = await sbAll(`ai_call_events?provider=eq.elevenlabs&select=conversation_id,${CHANNEL_COLS}&order=conversation_id.asc`);
    } catch (e) {
      console.error("channels: channel select failed, returning an empty map:", String(e?.message || e));
    }
    const channels = {};
    for (const r of rows) {
      const c = channelOf(r);
      if (r?.conversation_id && c) channels[r.conversation_id] = c;
    }
    res.setHeader("cache-control", "private, max-age=60");
    return res.status(200).json({ channels });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
