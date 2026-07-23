// Stage 1 — extract. v1 accepts plain text / markdown; PDF is a documented pre-step
// (PyMuPDF -> text, same path used to build the INTRUST KB). Returns the raw text plus
// light stats the reviewer report uses.
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const SUPPORTED = new Set([".txt", ".md", ".markdown", ".text", ""]);

export function extract(inputPath) {
  const ext = extname(inputPath).toLowerCase();
  if (ext === ".pdf") {
    throw new Error(
      `PDF is a pre-step in v1. Extract text first (e.g. PyMuPDF):\n` +
      `  python3 -c "import fitz,sys; print(chr(10).join(p.get_text() for p in fitz.open(sys.argv[1])))" "${inputPath}" > out.txt\n` +
      `then run the cleaner on out.txt.`
    );
  }
  if (!SUPPORTED.has(ext)) {
    throw new Error(`Unsupported input "${ext}". v1 handles .txt/.md (PDF via a pre-step).`);
  }
  const raw = readFileSync(inputPath, "utf8");
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error(`Input "${inputPath}" is empty.`);
  return {
    text,
    stats: {
      chars: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
      lines: text.split("\n").length,
    },
  };
}
