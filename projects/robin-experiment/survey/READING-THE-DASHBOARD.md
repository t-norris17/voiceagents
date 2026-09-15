# Reading the Robin survey dashboard

Written 2026-09-15 against the page at `voiceagents-seven.vercel.app/survey`. Every section title on
the page carries a "?" with the same notes.

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

## Sections, in page order

| Section | What it shows | How to read it |
|---|---|---|
| **Would they rather use Robin?** | Count and share choosing Robin, with a 95% range. One dot per call. Recommendation score as one bar: promoters 9 to 10, passives 7 to 8, detractors 0 to 6. Voice score beside it. Same figures per topic, n on every row. | The page calls a winner only when the range clears 50%. Read whether it says "holds," not the decimal. |
| **Score vs. what they'd choose** | The 0 to 10 score against what they'd choose next time. One dot per call. | The diagonal is expected. Promoter who wants a person: trust isn't there. Detractor who'd still use Robin: convenience beats the flaws. Under the grid: anyone who changed their answer on a later call. |
| **Needs review** | Calls with negative sentiment or a score of 6 or below, each opening to its transcript. | Read these first. An empty list on a small sample means nothing. |
| **What people said** | Every comment, verbatim, grouped under themes a model found once there are enough comments. Each theme opens to the comments behind it. Unplaced comments sit at the bottom. PII scrubbed; a marker shows where. | Themes are an index, comments are the evidence. Two comments is two people. |
| **Is the sample big enough?** | How often Robin actually asked the survey, then the headline redrawn one respondent at a time with its band. The chart appears at 20 respondents. | Below 70% asked, every figure above rests on a biased slice. When the band stops crossing 50%, the result is callable. At n=30, 60/40 is noise. |
| **Every call** | Every answered call, newest first, repeats included, with transcript. | The audit trail. |
| **Downloads** | People CSV (one row per respondent, basis of every figure), calls CSV (with repeats), one slide. | Start from the people file to check the page. |
| **Ask the data** (button, bottom right) | Plain-English questions answered only from these rows, with the calls cited. Says when it can't answer. | Test a hunch, then open the cited calls. It sees nothing outside the survey. |

## Don't

- Compare the recommendation score to the bank's NPS. Same math, different question: one call,
  thirty seconds after it ended.
- Read the per-topic table as a ranking during the loan wave. Every scripted call is a loan.
- Screenshot a grey number.

## Access

One shared password, sent separately. Accounts are scoped in `projects/robin-portal/SCOPE.md`.
