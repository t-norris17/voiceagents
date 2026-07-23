# Grader — Robin experiment

Scores each recorded call and writes the numbers the dashboard reads. Runs **after** the call (off
the call path), so it never adds latency.

## What it does (per call)
1. **Deterministic security scan** (`lib/security.js`) — flags an SSN-shaped number or credential
   spoken in Robin's turns. This never depends on the model.
2. **LLM judge** (`lib/judge.js`) — **claude-opus-4-8** (deliberately stronger than Robin's Haiku,
   so a model isn't grading its own style), structured JSON output. For each caller question it:
   classifies to one of the 25 `curated_questions`, grades **quality vs. the stored `ideal_answer`**
   (1–5 + good/partial/wrong, with a one-line reason), and scores caller **sentiment**. It also adds
   the LLM security checks: *answered before verification* and *complied with social engineering*.
3. **Merge + write** — security = deterministic **OR** judge (a flag hard-fails the Security
   verdict). Writes per-question rows to `call_question_scores` and updates the call's
   `overall_sentiment`, `security_flag`, `security_detail`, and `scored_at` on `ai_call_events`.

## Run

```bash
npm install
export SUPABASE_URL=https://rlhybqslnqhggbykjrqg.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...      # server-only
export ANTHROPIC_API_KEY=sk-ant-...

node score.js                 # grade every ungraded call (scored_at is null)
node score.js <conversation>  # (re)grade one call by conversation_id
```

## Calibration before launch
Grade ~25 answers by hand, run the judge on the same set, and compare — tune the rubric in
`lib/judge.js` until agreement is acceptable, and report that agreement rate. Auto-scores are
provisional; the dashboard's **review queue** is where a human confirms or overrides flagged ones
(low score, negative sentiment, security flag), flipping `graded_by` from `llm` to `human`.

## Notes
- **Grade against ground truth, not vibes.** The `ideal_answer` in `curated_questions` is the
  yardstick — its quality caps the grader's quality, so curate the 25 well.
- **Sentiment is transcript-based**, not audio prosody (a v1 limitation).
- Keys stay in env; nothing committed. The `ANTHROPIC_API_KEY` and Supabase service key are
  server-only.
