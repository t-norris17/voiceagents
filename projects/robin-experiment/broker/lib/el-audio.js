// The recording of one conversation, from ElevenLabs. ElevenLabs is the record; Birdnest only ever
// holds a short-lived cached copy (see api/call-audio.js). Inert without ELEVENLABS_API_KEY.
//
// Endpoint: GET /v1/convai/conversations/{id}/audio with the xi-api-key header, the same key and
// header style as kb-text.js. Verified against a live conversation by api/audio-probe.js before the
// route was built on it (see robin-portal/BUILD.md).
const API = "https://api.elevenlabs.io/v1/convai/conversations";

export const CONVERSATION_ID = /^conv_[A-Za-z0-9]{6,80}$/;

// -> { ok: true, bytes: Uint8Array, contentType, ms } | { ok: false, status, error }
export async function fetchConversationAudio(id, { fetchImpl = fetch, key = process.env.ELEVENLABS_API_KEY, now = () => Date.now() } = {}) {
  if (!key) return { ok: false, status: 503, error: "ELEVENLABS_API_KEY is not set" };
  if (!CONVERSATION_ID.test(String(id || ""))) return { ok: false, status: 400, error: "bad conversation id" };
  const t0 = now();
  let res;
  try {
    res = await fetchImpl(`${API}/${encodeURIComponent(id)}/audio`, { headers: { "xi-api-key": key } });
  } catch (e) {
    return { ok: false, status: 502, error: `elevenlabs unreachable: ${String(e?.message || e)}` };
  }
  if (!res.ok) {
    // 404 means ElevenLabs has no recording for this id (deleted, or never recorded). Anything
    // else is their problem, reported as a bad gateway rather than passed through.
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, status: res.status === 404 ? 404 : 502, error: `elevenlabs ${res.status}${detail ? `: ${detail}` : ""}` };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) return { ok: false, status: 502, error: "elevenlabs returned an empty recording" };
  return { ok: true, bytes, contentType: res.headers.get("content-type") || "audio/mpeg", ms: now() - t0 };
}
