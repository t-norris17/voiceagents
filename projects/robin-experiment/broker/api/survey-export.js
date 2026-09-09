// GET /api/survey-export?level=people|calls  ->  text/csv
//
// Behind the password gate (see middleware.js). Exists so "can you send me the raw data" is a
// click instead of an email — and so anyone can recompute the page's numbers themselves, which is
// the whole point of publishing an instrument's results rather than its conclusions.
//
// level=people is the default and the one to hand out: one row per tester, the basis of every
// figure quoted from this survey. level=calls is every surveyed call including repeats, for
// anyone checking the dedup.
//
// TEMPORARY: delete with the instrument after the customer wave.
import { surveyPeople, surveyCalls, PEOPLE_COLS, CALL_COLS } from "../lib/survey-data.js";

// RFC 4180. Also guards against CSV injection: a comment starting with = or + is a live formula
// in Excel, and these cells hold text a caller dictated. Prefix with a quote so it stays text.
function cell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const level = String(req.query?.level || "people").toLowerCase() === "calls" ? "calls" : "people";
  try {
    const rows = level === "calls" ? await surveyCalls() : await surveyPeople();
    const cols = (level === "calls" ? CALL_COLS : PEOPLE_COLS).split(",");
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="robin-survey-${level}-${stamp}.csv"`);
    res.setHeader("cache-control", "no-store");
    return res.status(200).send(csv);
  } catch (e) {
    console.error("survey-export failed:", String(e.message || e));
    return res.status(500).json({ error: "export failed" });
  }
}
