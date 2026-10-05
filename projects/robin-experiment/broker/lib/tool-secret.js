// The shared secret on Robin's WRITE tools. verify_caller and get_balance are open on purpose (they only
// read, and gating them in middleware would put a gate on the critical path of a live call). A tool that
// writes rows is different: without this, anyone with the URL could fill the call center's queue.
//
// ElevenLabs sends the header from a workspace secret (the tool's request_headers reference the secret,
// so the value never sits in the agent config). The broker compares it to REQUESTS_TOOL_SECRET.
// Fails CLOSED: with the env var unset, the tools answer 503 and Robin falls back to her prompt's
// "I can't file that right now" path, never to an open door.
export const TOOL_SECRET_HEADER = "x-robin-tool-secret";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns null when the request may proceed, or { status, error } to send back.
export function toolSecretCheck(headers, env = process.env) {
  const expected = env.REQUESTS_TOOL_SECRET;
  if (!expected) return { status: 503, error: "REQUESTS_TOOL_SECRET is not set on this deployment" };
  const raw = headers?.[TOOL_SECRET_HEADER];
  const supplied = Array.isArray(raw) ? raw[0] : raw;
  if (supplied && timingSafeEqual(String(supplied), expected)) return null;
  return { status: 401, error: "bad tool secret" };
}
