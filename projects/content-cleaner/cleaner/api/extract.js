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

// Strip characters that carry no readable content: C0/C1 control codes (except \t \n \r), soft hyphen,
// zero-width + bidi marks, word joiner, and the BOM. Broken-font or scanned PDFs emit these where real
// text should be, and JS .trim() does NOT remove most of them — so without this they survive as
// "blank text" that silently sails through the emptiness check below.
const INVISIBLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F­​-‏‪-‮⁠﻿]/g;
function stripInvisible(s) {
  return String(s).replace(INVISIBLE, "");
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

    // Some PDFs have no real text layer — scanned images, or subset fonts whose glyphs map to NUL /
    // zero-width characters. pdf-parse then emits a wall of newlines and invisible chars that survive
    // .trim(), so a naive "is it empty?" check would pass them through as blank text. Strip the junk
    // first, then require some real printable content before we accept it.
    text = stripInvisible(text)
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n") // drop trailing spaces so all-whitespace lines collapse cleanly
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.replace(/\s/g, "").length < 20)
      return res.status(422).json({ error: `no extractable text in the ${kind} — it looks scanned or image-based, or its fonts carry no text layer. OCR it (or paste the text) and try again.` });

    return res.status(200).json({ text, chars: text.length, kind });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
