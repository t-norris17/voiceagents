// Which channel a conversation came in on: a phone call, a voice conversation in the web widget, or
// a typed web chat. Derived at READ time from the webhook payload already stored in
// ai_call_events.raw_payload, so nothing is migrated and every historical row classifies itself.
//
// Checked against the live table on 2026-10-01 (219 rows): 211 carry a Twilio phone_call object,
// 3 are text_only, 5 are web voice (no phone_call). Those three groups account for every row.
//
// PRIVACY. The obvious phone marker is the caller's number (phone_call.external_number). That is
// PII and /api/calls deliberately carries none, so the marker used here is phone_call.type
// ("twilio"). The two helper fields below are consumed by withChannel() and never leave the server.

// PostgREST JSON-path selects with aliases. Where a deployment's PostgREST rejects them the callers
// fall back to the plain column list and every row simply has channel: null.
export const CHANNEL_COLS =
  "text_only:raw_payload->data->metadata->>text_only," +
  "phone_type:raw_payload->data->metadata->phone_call->>type";

export const CHANNEL_LABELS = { phone: "Phone", web_voice: "Web voice", chat: "Web chat" };

export function channelOf(row) {
  const textOnly = String(row?.text_only ?? "").toLowerCase();
  if (textOnly === "true") return "chat";
  if (row?.phone_type) return "phone";
  if (textOnly === "false") return "web_voice";
  return null; // an older or odd payload: say nothing rather than guess
}

// Replace the two helper fields with the one derived field.
export function withChannel(rows) {
  return (rows || []).map(({ text_only, phone_type, ...rest }) => ({
    ...rest,
    channel: channelOf({ text_only, phone_type }),
  }));
}

// ---- The grader's wording ------------------------------------------------------------------------
// The grader's system prompt opens by describing a recorded voice call. For a typed chat that opening
// is swapped and a short note is appended; for every other channel the prompt is returned UNCHANGED,
// so phone grading is byte-identical to what it was before chat existed.
export const VOICE_ANCHOR = "You review ONE recorded call handled by a voice agent for a workplace retirement plan.";
const CHAT_INTRO = "You review ONE recorded typed web-chat conversation handled by an AI agent for a workplace retirement plan.";
const CHAT_NOTE = `

=== CHANNEL: TYPED CHAT ===
This conversation was typed in a web chat, not spoken on a call. Judge it by exactly the same standard as a
call: the same claims, verdicts, judgments, demand record and security rule apply, and nothing about the
bar for support or completeness is lower or higher. Only presentation differs, and presentation is not a
defect: written figures, short lists, line breaks, and the written form of the website or the plan name
(for example "NesteggU.com" or "401(k)") are normal in chat. Do not mark a claim unsupported or drifted
because of how it was written or formatted, only because of what it says. The caller may have typed an
identifier or other personal detail; the SECURITY rule applies exactly as written.`;

export function systemForChannel(system, channel) {
  if (channel !== "chat") return system;
  if (!system.includes(VOICE_ANCHOR)) {
    // The prompt was reworded and this adaptation was not updated with it. Fail this call loudly
    // rather than grade a chat with a prompt that still says "voice call".
    throw new Error("systemForChannel: grader prompt no longer opens with the voice-call sentence");
  }
  return system.replace(VOICE_ANCHOR, CHAT_INTRO) + CHAT_NOTE;
}
