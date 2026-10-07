// Call audio for Birdnest's player: the rules, with no I/O, so each is unit-tested
// (test/call-audio.test.mjs). Spec: robin-portal/audio/SPEC.md.
//
// Measured on a preview deployment 2026-10-07 (api/audio-probe.js, since deleted): ElevenLabs returns
// audio/mpeg with an ID3 header, 1.1 MB for a 71 s call and 9.6 MB for the 600 s cap, in under 1.2 s;
// it ignores Range (200, whole file), so seeking has to come from our copy. Supabase Storage answers a
// Range request on a signed URL with 206 and the exact bytes, and refuses the URL once the object is
// deleted. A typed web chat returns a 45-byte ID3 stub, not a recording.

export const BUCKET = "call-audio";
export const SIGNED_URL_SECONDS = 300;   // 5 minutes; the player asks again if a link expires mid-listen
export const IDLE_DAYS = 30;             // the sweep deletes copies nobody has played for this long
export const MIN_RECORDING_BYTES = 1024; // a chat's stub is 45 bytes; a 5 s call is tens of KB

// THE SWITCH. CALL_AUDIO_ENABLED = "on" or "off" decides, anywhere. Unset, audio is OFF in production
// and ON in preview deployments (which sit behind Vercel's own login), so a branch can be tested end
// to end without touching production. Any other value is treated as off: a typo must not publish
// recordings.
export function audioEnabled(env = process.env) {
  const v = String(env.CALL_AUDIO_ENABLED ?? "").trim().toLowerCase();
  if (v === "on") return true;
  if (v) return false;
  return env.VERCEL_ENV === "preview";
}

// A recording exists for spoken conversations only. Decided by channel, never by ElevenLabs'
// has_audio flag, which is true for typed chats too.
export function channelHasAudio(channel) {
  return channel === "phone" || channel === "web_voice";
}

export const objectKey = (conversationId) => `${conversationId}.mp3`;

// Cached copies to delete: idle longer than IDLE_DAYS.
export function idleCutoff(now = new Date(), days = IDLE_DAYS) {
  return new Date(now.getTime() - days * 864e5).toISOString();
}
