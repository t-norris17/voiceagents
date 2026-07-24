// POST /api/extract  (raw file body, header x-filename)  ->  { text, chars, kind }
// Server-side text extraction so the Clean tab can accept .docx and .pdf uploads directly
// (not just .txt/.md). The client streams the file bytes; we detect the type by magic bytes
// (with the filename as a hint) and return plain text to drop into the cleaner. No formatting —
// which is exactly what we want, since the cleaner strips tables/layout anyway.
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js"; // /lib path skips the package's debug harness

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB raw upload cap

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(new Error("file too large (max 8 MB)")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function detect(buf, filename) {
  const name = String(filename || "").toLowerCase();
  if (buf.slice(0, 4).toString("latin1") === "%PDF" || name.endsWith(".pdf")) return "pdf";
  // .docx is a zip (PK\x03\x04); plain .txt/.md shouldn't hit this endpoint but pass through.
  if ((buf[0] === 0x50 && buf[1] === 0x4b) || name.endsWith(".docx")) return "docx";
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".text")) return "text";
  return "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const buf = await readRaw(req);
    if (!buf.length) return res.status(400).json({ error: "empty upload" });
    const kind = detect(buf, req.headers["x-filename"]);

    let text = "";
    if (kind === "pdf") {
      const r = await pdfParse(buf);
      text = r.text || "";
    } else if (kind === "docx") {
      const r = await mammoth.extractRawText({ buffer: buf });
      text = r.value || "";
    } else if (kind === "text") {
      text = buf.toString("utf8");
    } else {
      return res.status(415).json({ error: "unsupported file type — use .pdf, .docx, .txt, or .md" });
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return res.status(422).json({ error: `no text found in the ${kind} (is it a scanned image?)` });
    return res.status(200).json({ text, chars: text.length, kind });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
