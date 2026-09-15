# Reading the Robin survey dashboard

Written 2026-09-15 against the page at `voiceagents-seven.vercel.app/survey`.

---

## The question

Robin asks four things before goodbye. The first is the experiment:

> "If you had a question like this again, would you rather do it this way with me, or hold for a
> person, even if it took longer?"

Then: 0 to 10 would you recommend this, 0 to 10 how natural did the voice sound, and anything else.

## Before you read a number

1. **Responses, not people.** One tester, five calls, five responses. Deliberate for the test wave.
   The header shows both counts. People-level data is in the downloads.
2. **Transferred calls are never surveyed.** A caller who wants a person gets one, no questions on
   the way. The survey only sees calls Robin finished. Transfer rate is on the Experiment Monitor.
3. **Testers are staff who know it's a test.** Goodwill is inflated. Use it to compare Robin to
   Robin over time, not as a customer number.
4. **Grey means untrusted.** Thin samples render muted instead of carrying a warning.

## Sections

| Section | What it shows | How to read it |
|---|---|---|
| **Would they rather use Robin?** | Count and share choosing Robin, with a 95% interval. Recommendation score as one bar: promoters 9 to 10, passives 7 to 8, detractors 0 to 6. Voice score. Same figures per topic, n on every row. | The page calls a winner only when the interval clears 50%. Read whether it says "holds," not the decimal. |
| **Needs review** | Calls with negative sentiment or a low score, each opening to its transcript. | Read these first. An empty list on a small sample means nothing. |
| **The paragraph** | Model-written summary of the current numbers and comments. | A starting point. Check every claim below. |
| **Recommendation vs. preference** | Score bucket against what they'd choose next time. | The diagonal is expected. Promoter who wants a person: trust isn't there. Detractor who'd still use Robin: convenience beats the flaws. |
| **Themes** | Free text clustered by a model, at most six, named in callers' words, one quote and the calls behind each. Won't run until there are enough comments. | Two comments is two people. Click through. |
| **Written comments** | Every comment, verbatim, one per call. PII scrubbed; a marker shows where. | Read all of them. |
| **Confidence and sample size** | Preference share redrawn one respondent at a time, with its band. | When the band stops crossing 50%, the result is callable. At n=30, 60/40 is noise. |
| **Ask a question** | Plain-English questions answered only from these rows, with the calls cited. Says when it can't answer. | Test a hunch, then open the cited calls. It sees nothing outside the survey. |
| **Individual calls** | Every answered call, newest first, repeats included, with transcript. | The audit trail. |
| **Downloads** | People CSV (one row per respondent, basis of every figure), calls CSV (with repeats), one slide. | Start from the people file to check the page. |

## Don't

- Compare the recommendation score to the bank's NPS. Same math, different question: one call,
  thirty seconds after it ended.
- Read the per-topic table as a ranking during the loan wave. Every scripted call is a loan.
- Screenshot a grey number.

## Access

One shared password, sent separately. Accounts are scoped in `projects/robin-portal/SCOPE.md`.
