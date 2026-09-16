// GET /api/robin/status -> the landing page's information block, as JSON, for anything that wants
// the same facts (the doors' live numbers refresh from here without a page reload).
import { getRobinStatus } from "../../../../lib/elevenlabs.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getRobinStatus();
  return Response.json(status, { headers: { "cache-control": "private, max-age=60" } });
}
