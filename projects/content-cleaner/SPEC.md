# SPEC — Content Cleaner (Robin-ready / KCS gold)

**Slug:** content-cleaner · **Status:** draft · **Created:** 2026-07-23
**Reads:** [`SCOPE.md`](./SCOPE.md) (problem, north star, locked decisions)

> The buildable design for the cleaner. A Node CLI that turns raw source text into KCS-gold,
> Robin-ready KB articles + a reviewer report. **It proposes; a human approves before KB upload.**

---

## 1. Shape at a glance

```
raw text (.txt/.md)  ──►  clean.js  ──►  out/<slug>/
                            │             ├─ <topic-1>.md          cleaned KB doc (KCS-gold)
                            │             ├─ <topic-2>.md          …one file per topic
                            │             ├─ _drop-report.md       what was cut + why
                            │             ├─ _coverage-map.md      topics covered + explicit gaps
                            │             ├─ _candidate-questions.md   seed eval set
                            │             └─ _run.json             raw structured result (audit)
                            │
                   extract → rewrite (LLM) → validate (code + LLM critic) → render
```

One command: `node clean.js <input.txt> --slug intrust --env "INTRUST 401(k) Plan"`.

## 2. Pipeline stages

| # | Stage | File | What it does |
|---|---|---|---|
| 1 | **Extract** | `lib/extract.js` | Read the input file. `.md`/`.txt` pass through. PDF is a documented pre-step (PyMuPDF → text), not in-CLI for v1. Returns raw text + basic stats. |
| 2 | **Rewrite** | `lib/rewrite.js` | One Opus call, **structured output** (json_schema). Segments the source into topics, drops noise, and rewrites each topic to the KCS-gold + voice-RAG shape. Returns `{articles[], dropped[], coverage_gaps[], terminology_notes[]}`. Grounded-only: rework the source, never invent; gaps are flagged, not filled. |
| 3 | **Validate** | `lib/validate.js` | **Deterministic guards** on every article's rendered text: PII scan (SSN shape + member-data cues, reusing the grader's pattern), cross-reference detector ("see above/below/the section"), UI-gesture detector ("click/tap the … icon/button"), un-spoken artifacts (markdown tables, bare digit-run phone numbers), length ("just enough"). Then a **Sonnet critic** pass (medium effort — it reviews, doesn't generate, so it needn't be Opus) scores each article against the KCS-gold checklist and flags misses the code can't see. A hard PII hit **fails the run** (non-zero exit). |
| 4 | **Render** | `lib/render.js` | Article object → Robin-ready markdown (same header/section style as `robin-experiment/kb/`). Writes per-topic files + the three reports + `_run.json`. |

`lib/kcs.js` holds the **rubric as the system prompt** (KCS v6 structure + content standards + the
voice-RAG overlays, verbatim from SCOPE) and the article→markdown formatter, so the target shape lives
in exactly one place.

## 3. The article contract (structured output)

Each article the model returns:

```jsonc
{
  "slug": "account-access",                 // kebab, becomes the filename
  "title": "How do I log in and get help?", // findable, phrased as a participant would ask
  "issue": "…participant's need in their words…",
  "environment": "INTRUST 401(k) Plan",     // passed in via --env
  "resolution": "…grounded, complete, spoken-friendly answer…",
  "cause": "…the why, when it helps (optional)…",
  "coverage_flags": ["No specific loan limit in the source — route to a specialist."],
  "candidate_questions": ["How do I log in the first time?", "I didn't get my PIN."],
  "source_span": "short quote/anchor from the raw text this came from"
}
```

Plus run-level: `dropped:[{content, reason}]`, `coverage_gaps:[string]`, `terminology_notes:[{from,to}]`.

## 4. Robin-ready checklist (what validate enforces)

- [ ] **One topic** per doc; **self-contained** (no "see above/below").
- [ ] **Voice-friendly** — no tables/UI gestures; phone numbers spoken (`866-412-9026`, not a table cell).
- [ ] **Findable title** phrased as a question; **Issue** in the requestor's words.
- [ ] **Grounded** — traceable to `source_span`; no invented figures.
- [ ] **Coverage flags** present where the source is silent (so Robin routes, not guesses).
- [ ] **Zero PII** — no SSN shape, member names, contact info, or entitlement. *(Hard fail.)*
- [ ] **"Just enough"** — a complete thought, not the whole packet.

Deterministic guards catch the mechanical ones (PII, cross-refs, tables, gestures, length); the LLM
critic judges the judgment calls (grounding, requestor's-words, coverage completeness).

## 5. Reviewer outputs

- **`_drop-report.md`** — a table of what was cut (fee schedules, Schwab fund tables, legal boilerplate)
  and the one-line reason. Lets a reviewer confirm nothing important was lost without re-reading source.
- **`_coverage-map.md`** — topics produced + the explicit gaps the source doesn't answer (→ specialist).
- **`_candidate-questions.md`** — the pooled `candidate_questions`, ready to seed a plan's eval set.
- **`_run.json`** — the full structured result for audit / re-render.

## 6. Success gate (from SCOPE)

Run it on the raw INTRUST packet text and confirm: output is at least as good as the 3 hand-made
`kb/*.md`, Schwab/fee-table noise is in `_drop-report.md` not the docs, **zero PII**, and every doc
passes the checklist. That's the v1 acceptance test — it lives in `BUILD.md`.

## 7. Non-goals (v1)

No auto-upload to the ElevenLabs KB (human gate). No PDF/Word/HTML/URL ingestion in-CLI (PDF is a
pre-step). No web UI yet. No net-new authoring — rework + flag gaps only.

---

*Next: `BUILD.md` (how to run + acceptance test + next-session brief).*
