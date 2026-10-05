// What the health check says about the cleaner, from two probe statuses. Kept pure so it can be tested.
//
// The probe is GET /api/kb_article with no id, which the cleaner answers 400 ("need id") before it reads
// anything, so neither probe touches data. Sent twice: once WITH the portal's internal secret (should get
// through to the handler: 400) and once WITHOUT (should be stopped at the door: 401). Together they say
// both things that matter: the Factory inside Birdnest works, and the cleaner is closed to everyone else.
export function cleanerVerdict(withSecret, withoutSecret) {
  return {
    secret_accepted: withSecret !== 401 && withSecret !== 503 && withSecret < 500,
    gated: withoutSecret === 401,
    status_with_secret: withSecret,
    status_without_secret: withoutSecret,
  };
}
