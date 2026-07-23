// Tests for the deterministic safety guards — the layer that must NOT depend on model
// judgment. Run: `node --test`. No API key needed (the LLM critic is not exercised here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deterministicScan } from "../lib/validate.js";
import { articleToMarkdown } from "../lib/kcs.js";

const kinds = (findings) => findings.map((f) => f.kind);
const hasFatal = (findings) => findings.some((f) => f.severity === "fatal");

// --- PII: the hard-fail red line ---
test("SSN-shaped number is a FATAL finding (hyphenated)", () => {
  const f = deterministicScan("Your number on file is 123-45-6789.", { resolution: "x", coverage_flags: [] });
  assert.ok(hasFatal(f), "expected a fatal finding");
  assert.ok(kinds(f).includes("pii-ssn"));
});

test("SSN-shaped number is FATAL with spaces and with no separators", () => {
  assert.ok(hasFatal(deterministicScan("123 45 6789", { resolution: "x", coverage_flags: [] })));
  assert.ok(hasFatal(deterministicScan("SSN 123456789 here", { resolution: "x", coverage_flags: [] })));
});

test("'social security number' next to digits is FATAL", () => {
  const f = deterministicScan("Enter your social security number, then press 1.", { resolution: "x", coverage_flags: [] });
  assert.ok(hasFatal(f));
  assert.ok(kinds(f).includes("pii-ssn-words"));
});

test("clean plan phone number (866-412-9026) is NOT flagged as PII", () => {
  const f = deterministicScan("Call 866-412-9026 for help.", { resolution: "x", coverage_flags: ["none"] });
  assert.equal(hasFatal(f), false, "a hyphenated phone number must not read as an SSN");
});

// --- voice-RAG warnings (review, not fail) ---
test("cross-reference is a warn", () => {
  const f = deterministicScan("As noted in the section above, you can defer 6%.", { resolution: "x", coverage_flags: ["y"] });
  assert.ok(kinds(f).includes("cross-reference"));
  assert.equal(hasFatal(f), false);
});

test("UI gesture (click the gear icon) is a warn", () => {
  const f = deterministicScan("To update, click the gear icon and choose Beneficiaries.", { resolution: "x", coverage_flags: ["y"] });
  assert.ok(kinds(f).includes("ui-gesture"));
});

test("markdown table is a warn", () => {
  const md = "Fees:\n\n| Fund | ER |\n|---|---|\n| A | 0.04% |\n";
  const f = deterministicScan(md, { resolution: "x", coverage_flags: ["y"] });
  assert.ok(kinds(f).includes("table"));
});

test("bare 10-digit phone run is a warn", () => {
  const f = deterministicScan("Call 8664129026 now.", { resolution: "x", coverage_flags: ["y"] });
  assert.ok(kinds(f).includes("bare-phone"));
});

test("over-long resolution is a warn (just-enough)", () => {
  const long = "a".repeat(1300);
  const f = deterministicScan("ok", { resolution: long, coverage_flags: ["y"] });
  assert.ok(kinds(f).includes("length"));
});

test("missing coverage_flags is a warn", () => {
  const f = deterministicScan("ok", { resolution: "x" });
  assert.ok(kinds(f).includes("coverage"));
});

test("a clean, self-contained article produces NO findings", () => {
  const article = {
    resolution: "Yes, the plan allows loans. Want me to walk you through how it works?",
    coverage_flags: ["No specific loan limit in the source — route to a specialist."],
  };
  const md = "Yes, the plan allows loans. Want me to walk you through how it works?";
  const f = deterministicScan(md, article);
  assert.equal(f.length, 0, `expected no findings, got: ${JSON.stringify(f)}`);
});

// --- formatter: article -> Robin-ready markdown ---
test("articleToMarkdown renders title, answer, coverage; omits empty cause", () => {
  const md = articleToMarkdown(
    {
      environment: "INTRUST 401(k) Plan",
      title: "Can I take a loan from my 401(k)?",
      issue: "Wondering if I can borrow.",
      resolution: "Yes, the plan allows loans.",
      cause: "",
      coverage_flags: ["No specific limit in the source."],
    },
    { source: "2025 INTRUST Enrollment Packet" }
  );
  assert.match(md, /# INTRUST 401\(k\) Plan — Can I take a loan/);
  assert.match(md, /## Answer/);
  assert.match(md, /route to a specialist/i);
  assert.doesNotMatch(md, /## Why/, "empty cause must be omitted");
});
