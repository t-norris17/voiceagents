# Reading the Robin survey dashboard

**For:** anyone sent the link who has not watched it being built. Written 2026-09-15 against the
page as deployed at `voiceagents-seven.vercel.app/survey`.

---

## The one question

After a caller finishes with Robin, she asks four short questions before goodbye. The first is the
experiment: *"If you had a question like this again, would you rather do it this way with me, or
hold for a person, even if it took longer?"* Everything on the page is either evidence for that
question or a check that the evidence is honest. The other three: a 0 to 10 "would you recommend
handling a question like this with me," a 0 to 10 "how natural did my voice sound," and an open
"anything else you'd want us to know."

## Four things to hold in mind before reading any number

1. **It counts responses, not people.** One tester making five calls is five responses. That is
   deliberate for the tester wave, where each call is a different scenario and every reaction is
   wanted. The people-level view is in the downloads, and the header says "N responses from M
   people" so the ratio is never hidden.
2. **Calls that end in a transfer never reach the survey.** By design: a caller who wants a person
   gets a person, no questions on the way. So the survey only sees calls Robin finished herself. The
   transfer rate lives on the Experiment Monitor, and the two should be read together.
3. **These are staff who know it's a test.** Goodwill is inflated. Treat every figure as a baseline
   for comparing Robin to Robin over time, not as a customer number.
4. **A number rendered in grey is a number the page does not trust yet.** Thin samples are shown
   as a state, not a warning label. If it looks muted, it is.

## The sections, top to bottom

**Would they rather use Robin?**
The headline: how many responses chose Robin over holding, as a count and a share with a 95%
interval. The page only says the preference "holds at this sample size" once that interval clears
50%. Ignore the decimal; read whether it says it holds. Beside it, the recommendation score drawn as
one bar split into promoters (9 or 10), passives (7 or 8) and detractors (0 to 6), and the voice
score. Below, the same figures per topic (loans, rollover, leaving, contributions) with **n** on
every row, because a one-response row is a row, not a finding. *How to think about it:* this is the
answer. The rest of the page is how you decide whether to believe it.

**Needs review**
Calls where the caller sounded unhappy or scored Robin low, each opening to its transcript. *How to
think about it:* read these before the good ones. A short list is the good outcome; an empty list
under a small sample is not evidence of anything.

**The paragraph**
A model-written summary of what the numbers and comments say right now. *How to think about it:* a
starting point, not a finding. Every claim it makes is checkable in the sections below, and should
be.

**Recommendation vs. preference**
A grid: the score bucket someone gave Robin against what they said they would actually choose next
time. *How to think about it:* the diagonal is expected. The two off-diagonal cells are the decision.
A **promoter who still wants a person** means the experience was good and the trust is not there
yet. A **detractor who would still choose Robin** means the convenience beats the flaws, which is the
whole deployment argument in one cell.

**Themes**
The free-text answers, clustered by a model into at most six themes named in the callers' own
words, each with one verbatim quote and the calls behind it. It refuses to run until there are
enough comments and says how many more it needs. *How to think about it:* labels, not categories.
Click through to the calls. A theme with two comments is two people.

**Written comments**
Everything said, word for word, one entry per call. Personal details are scrubbed; a redaction
marker means something was said and removed. *How to think about it:* read them all once. It takes
five minutes and it is where the "why" is.

**Confidence and sample size**
The preference share re-drawn one respondent at a time, with its 95% band. *How to think about it:*
watch whether the band has stopped crossing 50%. At thirty respondents a 60/40 is noise; the page
says so instead of rounding it into a win. If the line is still moving, wait.

**Ask a question**
Type a question in plain English. The answer is built only from these survey rows, cites the calls it
rests on, and says "the data cannot answer that" when it cannot. *How to think about it:* an
interrogation tool. Use it to test a hunch, then click the cited calls. It cannot see anything
outside the survey.

**Individual calls**
Every answered call, newest first, repeats included, each opening to its transcript. *How to think
about it:* the audit trail. Anyone who answered differently on a later call is found here.

**Downloads**
Two spreadsheets and a slide. The **people** file is one row per respondent and is the basis of every
figure on the page. The **calls** file includes repeats. The slide is the headline for a deck.

## What not to do with it

- Don't compare the recommendation score to the bank's NPS. Same arithmetic, different question: a
  single call, thirty seconds after it ended, about an agent mid-task.
- Don't read the per-topic table as a ranking during the loan wave. Every scripted call is a loan
  question, so it will be one row plus whatever the curveballs pull in.
- Don't screenshot a thin-sample number. The page went to some trouble not to give you one.

## Access

The page is behind a single shared password. Send it separately from the link. Replacing that with
real accounts is scoped in `projects/robin-portal/SCOPE.md`.
