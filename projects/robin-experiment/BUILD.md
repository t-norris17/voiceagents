# BUILD LOG — Robin 50-User Experiment

**Slug:** robin-experiment
**Started:** 2026-07-23
**Status:** active — see Sessions 7–8 for the current handoff

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-09-25 — Quality on flyrobin.app, and the first round of notes (branch `claude/quality-polish`, NOT merged)

**Status:** PR #75 merged and both projects built production from it; Tanner confirmed the rail on
flyrobin.app. His first pass of notes is built on `claude/quality-polish` for the preview.

- **Why the numbers moved.** Tanner asked why NPS read +44 where the old page said +47 (82% → 81%,
  30 → 28 people). Re-run on the live views: the four hidden staff calls (Tanner ×1, Steve
  Castro-Miller ×3) were three promoters and a passive, all four chose Robin, voice 9.75. Everyone:
  61 / 30 / +47 / 82% / 8.47. Testers only: 57 / 28 / +44 / 81% / 8.37. The Staff switch restores
  the old set and the caption says so. Nothing was lost.
- **Migration 020 (live).** `respondent_aliases`: Carla Lechliter → Karla Leckliter (roster). One
  call; her `person_key` changed with the canonical name (P-2a7c9ec7 → P-a146d5b5), which is how
  015 keys people. Verified on the view.
- **Migration 021 (live).** Seven more roster spellings: Michelle Aggson, Jacob Horsch, Brian
  Petri, Jonathon Rudisill, Kacey Goss (also heard "Kissy Goss"), Carin Kesterson, Kelli Benjamin.
  Verified on the view: every heard spelling maps, Kacey Goss is still one person with three calls,
  first wave still 28 people / 57 surveyed without staff. **022 (live):** Rudisill's first name is
  Jonathan, per the roster; 021 had taken "Jonathon" from the note.
- **Caption and tiles (round two).** The caption drops "· Central" and "staff hidden" and gains a
  `?` that explains each figure, says whether staff calls are in (and how many), and notes the
  minute refresh. The "open ↗" marker on the tiles is gone so the titles have the width.
- **Notes built.** (1) The call drawer's summary showed `[object Object]`: `survey-call` returns
  `{title, text}` and the page printed the object; now title · text. (2) Tile titles say what they
  are: Net Promoter Score, **Prefer Robin to a person**, **Voice naturalness score**, **Survey
  offer rate**; drawer titles and the tour match. (3) "The two outlined cells decide the rollout"
  is gone: the cells are "the exceptions"; leadership decides. (4) The "context, not silence"
  sentence under the funnel is gone; it says how many were never asked and to click a row.
  (5) **Survey themes** and **Calls for review** replace "What people said" and "Needs a listen";
  tooltips, tour and the reading guide follow. (6) The unformatted link row above Confidence is
  removed (it duplicated the downloads at the bottom). (7) The dot strip under Confidence is now
  **Calls per person**: one row per person, one dot per answered call in order, coloured by choice;
  repeat callers show as rows of dots, a person who chose differently on a later call is marked
  "changed", and each dot opens its call. This is the join between the tiles (calls) and the
  caption (people) that the old strip did not carry. (8) The caption sits in its own bordered box
  with an ink rule on the left. Verified on the fixture: all titles, no `#foot`, 28 rows / 55 dots,
  two "changed" rows, a dot opens its call with the summary as text, no script errors.
- **Open, for Tanner:** review the preview, then merge; second-wave dates; the retired-instrument
  note on the NPS tile, if wanted.

---

### 2026-09-24, later — The Quality page becomes a sliceable board (branch `claude/quality-rail`, merged 2026-09-25)

**Status:** the page rework is on the branch for Tanner and his bosses to test on a preview before
anything reaches `main`. Two things did reach the live database, on purpose, because the views are
shared: migrations 017 and 018. Both were verified to leave the live page reading exactly as before.

- **Design.** Tanner reviewed five mocks (https://claude.ai/artifact/Fjo95V9uyVGR6CoqvjcNVE) and
  chose B: a left rail (wave, range presets, custom dates, staff switch), four tiles, cross-tab as a
  heat grid, a funnel of what the slice excludes, comments and the listen list, with **every tile,
  cell and row opening a drawer** that shows the formula, the distribution, the by-day cut and every
  underlying row. Timeline-as-slicer (D) and the respondent wall (E) were liked and not chosen.
  Staff hidden by default. Viewers are on desktop monitors, so hover and density are fine.
- **Migration 017 (live).** `experiment_waves` gains `label` and `internal`; the first wave is keyed
  `first`, labelled, and closed at midnight Central after Sep 23; `internal` (Sep 8 to 21) is a wave
  of its own. `survey_wave_start()` is now the earliest non-internal wave start with no "active"
  clause, so closing a wave never widens the live survey era. `experiment_staff` (Tanner Norris,
  Scott Farber, Steve Castro-Miller). `survey_answers` appends `wave` and `is_staff`; `survey_people`
  appends `is_staff` and `wave`. Verified: wave start still 2026-09-21 05:00Z, 30 people / 61 calls
  unchanged with staff shown; by wave: internal 26 surveyed / 8 people, first 61 / 30 (57 / 28
  without staff), one stray call on Sep 24 in no wave. One bug caught before applying: an
  unqualified `started_at` inside the wave subquery would have bound to `experiment_waves.started_at`
  and put every call in every wave.
- **Migration 018 (live).** Roster spellings from Tanner as alias rows: Sheree Holbrook, Nick
  Museousky, Robert Pfaff, Maddie Bolton, Jennifer Bertematti, Ian Burroughs, Derek Parris, Colin
  Stephens, Adie Robles (plus Steve Castro-Miller's four spellings in 017). Still 30 / 61.
- **Broker (branch).** `lib/survey-slice.js`: `?range=wave:first | week | month | year | all |
  YYYY-MM-DD..YYYY-MM-DD`, `?staff=show`; boundaries at Central midnight, weeks start Monday, custom
  ranges inclusive; default is the newest non-internal wave. `surveySlice()` in `survey-data.js`
  fetches every call that carries the instrument (`in_survey_era or wave not null`) once and
  filters in memory; returns `everyone` (all callers) and `calls` (staff rule applied).
  `summariseSurvey(opinions, calls, everyone)`: opinions exclude staff, adherence and the new
  `funnel` count everyone; `adherence.misses` and `funnel.excluded` list the calls. Threaded
  through metrics, themes (cache keyed by slice, up to 8 entries), ask (slice named in the prompt,
  people derived per slice by `peopleFromCalls`), export (filename carries the slice). The slide
  forwards its query string. Tests 67/67.
- **Page (branch).** `broker/public/survey/index.html` rewritten. URL carries `range`, `staff`,
  `open` (a drawer), `view`. Rendered against a fixture built from the real per-person sequences
  (no Supabase credentials here): 28 people, 57 surveyed, NPS +44, 81% (69 to 89), voice 8.4,
  asked 91%. Checked at 1600, 1280, 400 wide, with the NPS drawer and a cross-tab cell open. No
  script errors. Portal copy step injects the masthead as before.
- **Unverified from here:** the live endpoints with a real slice (egress to vercel.app is blocked
  in this environment), the themes model call on a sliced input, and the Vercel builds of the
  branch. The preview is where those get checked.
- **Portal previews follow the branch.** `robin-portal/app/lib/upstreams.js`: a preview build
  (`VERCEL_ENV=preview`, branch not `main`) proxies to the broker preview of the same branch
  (`voiceagents-git-<slug>-…vercel.app`, or `BROKER_PREVIEW_URL`), so a branch that changes both
  can be tested end to end. Production and local dev still read `BROKER_URL`. Portal tests 5/5.
  Caveat: both projects have Vercel SSO protection on previews (`all_except_custom_domains`), so
  the portal's server-side fetch to the broker preview will hit the login wall until protection is
  off on the broker project. The portal's own gate password still applies either way.
- **Preview plumbing, done 2026-09-24 evening.** Tanner turned Vercel Authentication off on both
  projects' previews and gave the previews their own `ROBIN_INTERNAL_SECRET` (Preview-only rows on
  both projects; the Production values are Sensitive and unreadable, so a fresh shared value was the
  only way). Broker `SURVEY_PASSWORD` has separate Production and Preview rows. Health and the home
  tiles now read the same broker the proxy uses (`brokerBase()`), so a preview's health check
  reports on the preview broker. Verified from outside: portal preview health `ok`, broker preview
  reachable, secret accepted. Tanner: "works perfectly."
- **Round two, 2026-09-25, on the branch.** (1) What people said: the five themes said by the most
  people, each expandable to its comments, then one "See all N comments" link into a drawer that
  groups every comment under every theme, then the rest; without themes, the five most recent.
  `comments.recent` now ships up to 300. (2) Light / Dark for the whole portal: `data-theme` on
  `<html>`, stored as `robin-theme`, applied before paint by a head snippet; the pill sits in the
  Next.js masthead (`layout.js`, `lib/theme.js`) and in the masthead `copy-modules.mjs` injects
  into the module pages; Question Tester and Knowledge Factory gained `data-theme` overrides; the
  survey page carries its own pill, hidden under the portal's. (3) The Quality title row is the
  name, Simple / Advanced, the guide link and the pill; the facts live once, in the caption above
  the tiles, with the "updated" time; the rail keeps only the copy-link. Verified on the fixture:
  theme survives reload, five rows and the link, drawer grouped by theme; `next build` clean.
- **Guided tour, 2026-09-25, on the branch.** `broker/public/robin-tour.js` is a small engine
  shared by every page (copy-modules copies it to the portal; the Next.js layout loads it): a page
  registers `{id, welcome, steps, done}`; each step names a target, a title, two or three
  sentences and optional before/after hooks. The engine dims the page, spotlights the target,
  floats the card beside it (docks to the bottom on phones), keeps focus inside, and handles Escape
  and the arrow keys. The welcome card opens on its own the first time a browser sees the page
  (`robin-tour-seen:<id>`), then only from **Help**, which the engine adds to the footer. Quality
  registers thirteen steps in reading order; two are live, opening the NPS drawer and switching to
  Advanced, and both put things back. Walked through in a browser on the fixture: every step lands,
  hooks restore state, finish sets the flag, reload does not re-open, Help does. Other modules get
  a tour by registering steps; none do yet.
- **Simple is the slide again (2026-09-25).** Tanner: Simple should be the shareable slide, Advanced
  the board. Simple now shows the old slide content for the slice in the rail (hero share with its
  range, the split bar, NPS, voice, and the **top theme** in its own few words in place of the
  "warm but wants a person" cell), with links into the board. The rail and caption show in both
  modes. The tour switches to Advanced for its run and puts the viewer's mode back (engine gained
  `onStart` / `onStop`); it opens with a step on the Simple / Advanced pill. Fourteen steps.
- **"No." is not a comment (2026-09-25).** Tanner, on the What people said card showing "Uh,
  nope." / "No." / "Nope, that's it." as its five rows: "these are not themes." Two defects behind
  it. (1) The survey ends with "anything else?", most people say no, and that answer was stored and
  listed with the real comments; on live data 24 of 70 comments were declines. `lib/survey-comments.js`
  (`saidSomething`): strip fillers and the stock closers ("that's it", "I don't think so", "you've
  got everything", "sería todo"…), and three content words left means a comment. Checked against
  every distinct live comment; "Went smooth as silk." and "Everything was smooth." count, "No, I
  don't think so. Thank you." does not. `comments` now carries `said_more`, `people_said_more`,
  `nothing_more`, and every `recent` row a `more` flag; `given` is unchanged for old readers. The
  card leads with "N comments from M people · K more said no", lists real comments only, and the
  drawer folds the declines under "K callers said no · show them" so the count can be checked. The
  themes gate counts real comments, the model is told a decline is not a theme, and a theme resting
  on choice-question words lists those calls tagged "on the choice question". (2) The 60-second
  refresh cleared the themes and refetched them every minute (five hits a minute in the logs), so
  the card sat on "finding themes…" with the raw list most of the time. Themes now fetch when the
  slice or its comments change and stay on screen while a newer set loads. `survey-themes` gets
  `maxDuration: 60` in `vercel.json` (the function's actual duration is unmeasured; 200s in the
  logs, no timeouts seen). Also this pass: the excluded-calls card explains itself (Robin only asks
  at the end of a call that ends with her; the lower bars are why the rest were never asked), with
  per-row sublabels, a fuller drawer paragraph per reason, and the tour step to match. Tests 71/71;
  fixture render: one themes fetch across a load and a refresh, drawer grouped with the declines
  folded, no script errors.
- **Portal production got the branch (2026-09-25, ~9:24 AM Central).** Two `robin-portal`
  deployments with target **production** were made from `claude/quality-rail` (commits 26a7abe and
  b14d5ab) from Tanner's Vercel account, from the dashboard. Production portal then served the
  branch page against the **production broker** (main, no slice support), which reads as "0 calls
  in range", no waves in the rail, and the caption's "30 people" beside "0 surveyed". The live
  database was checked at the same time and is intact: 141 rows, both waves. The last main
  production deployment is `dpl_DbVeXREJ8g2vcaQSys86MMpK4e2G` (537466a). The branch alias also
  pointed at the production-targeted build until the next push made a new preview. Not rolled back
  from here: production is Tanner's call.
- **Open, for Tanner:** second-wave dates when known (one row in `experiment_waves`); the
  retired-instrument note on the NPS tile and drawer, if wanted.
- **Merged to `main` 2026-09-25 on Tanner's say-so** ("I like the dashboard"), which puts it on
  flyrobin.app. On the merge, two migrations were both numbered 017 (this branch's
  `waves_are_a_dimension` and main's `loan_limit`, written the same evening in different sessions);
  live order is waves (20:49Z), spellings (20:52Z), loan limit (20:53Z), so the loan-limit file is
  now `019_loan_limit.sql`. The entry below still says "Migration 017" for it; read that as 019.

---

### 2026-09-24 (later) — Loan limit fix, in progress

- **Root cause, from the live agent.** The 401(k) Loan Inquiries procedure
  (`agtprcv_7001m2tvy0ccfc0s52j3cv09pxn8`) taught the limit with a worked example in which 50% of
  vested is always the smaller number, and step 1 hard-coded "$17,500". The prompt said to "answer
  from the plan rule AND their figures together". `get_balance` returned no limit.
- **Migration 017 applied live** (`20260924205338 loan_limit`): `member_loans.paid_off_on`, a
  check that paid-off loans are dated, synthetic persona **90004 Elena** (DOB 1968-02-14, $150,000
  vested, $20,000 loan paid off 2026-03-20, expected limit $30,000). Verified: members 53 → 54,
  member_loans 1 → 2, Marcus's row unchanged.
- **Code, not yet deployed:** `get_balance` returns `loan_eligible`, `max_loan`, `min_loan`,
  `loan_limit_reason` (`loanLimit()`); 65/65 tests. **017 must stay applied while this code is
  live**: without `paid_off_on` every caller gets `needs_specialist`.
- **Live-agent text** for the procedure, prompt and tool description is in
  [`loan-limit-rollout.md`](./loan-limit-rollout.md). Nothing on the agent has changed yet.
  Rollback point `agtvrsn_9101m2zv730xe9ss1h2yapgk7ga5` (the 9/11 note naming v115 is stale).
- **`get_plan_details` removal approved.** No procedure references it any more; only Robin's
  `tool_ids` does. Drop it on the agent branch, delete the tool after the merge, without `force`.
- **Unverified from here:** the live `/api/verify_caller` for 90004; this environment's proxy
  returns 403 for `vercel.app`.

---

### 2026-09-24 — Customer wave judged against the judgement guide (read-only session)

Wave window 2026-09-21 12:16 → 09-23 21:23 UTC. 87 calls, 61 surveyed (60 excluding Tanner). Nothing
live was changed. All figures below are from the live views, queried today.

**Verdict: the survey half passes, the accuracy half fails the guide's own standard.** Do not
present it as "people preferred her and she was accurate" until the loan-limit fix ships and the
wave is regraded.

- **Unit (Tanner's decision, same day): every surveyed call counts, and Tanner's own call is
  excluded.** 60 surveyed calls from 29 people. The page's code does not exclude Tanner yet.
- **Trust checks.** Asked when eligible 57 of 63 decided calls (90%, standard 70%). 29 people
  (chart threshold 20). One shared office line (Colin, Kelsey, Stacy), resolved by 015/016.
- **Preference.** 46 of 56 classified calls chose Robin, 82%, Wilson range 70 to 90%. Whole range
  above 50%: **holds**. Two `unclassified` answers: María Retana Aguilera said "sí, preferiría
  hacerlo contigo" (Robin; the parser has no Spanish) and Paul White said "I'd rather do it myself".
- **NPS.** 31 promoters, 22 passives, 4 detractors of 57 calls: **+47** ("strong" band). Minus
  the guide's 10 to 20 point employee discount, +27 to +37: good. Three of the four detractor calls
  are Colin Stephens (3, 3, 0); the fourth is Kristen Johnson's third call (5).
- **Voice.** 8.46 mean on 52 calls (good). Low scores with reasons: Ian Burrows 6 ×3 ("robot",
  "too fast"), Maddie Bolton 5 ×3 (no reason), Colin Stephens 3. Robin Path's `voice_score = 1` on
  `conv_8601m32vz43rearbt6mh15f4k72n` is a **parser defect** ("This one was..." read as 1); without
  it the mean is 8.61 on 51.
- **Fans who still want a person:** 0 of 31 promoter calls.
- **Grader did not run on the wave.** `scored_at` is null on all 87 wave calls; last grade
  2026-09-16 19:19 UTC. `api/grade.js` has no cron, so it is manual. `security_flag` defaults to
  `false` (NOT NULL), so the "0 security flags" the dashboard shows for the wave is the column
  default, **not a verdict. Security is unmeasured.**
- **Contradicted the source: at least 6 calls** (transcript text search, not the grader). The KB
  says the max is the lesser of $50,000 or 50% of vested. For Priya ($214,906 vested) that is
  $50,000. Robin gave **$107,453** as the maximum on `conv_8701m327kzadf79syy0nh6q2jkn4` (David
  Sutton), `conv_2201m3592zckee0byks4dk072kqk` (Maddie Bolton), `conv_4001m35re1mcfd9a0ft7rn0yy53f`
  (Carla Lechliter, "which is less than the plan's $50,000 cap"), `conv_3401m359q90xfqy80c8jzcz2e4x0`
  (Jacob Horse), `conv_7501m376gv5zf8hrrg17vmqzt8b4` (Matthew Fritz, NPS 10, "best one so far"),
  `conv_1701m37e02g3e7h98tbx5bd5egeb` (Kristen Johnson). Only Jacob and Carla caught it. Another 3
  calls state 50% = $107,453 then leave the cap implicit. The 2026-09-11 note that "derived loan
  figures were correct" held for Marcus, where the 50% prong binds; Priya is where the $50k prong
  binds, and she fails there about as often as she passes.
- **Not Robin defects:** Colin's "it's a flat fee": Robin matched the live Loans doc
  (`omgR8I0aJlWd7BAUptbJ`, "$75 origination fee and a $25/year maintenance fee") every time; he is
  answering from a real plan he knows. Kristen's "Helen": the transcript text says "Kristen";
  audio unverified (egress blocks elevenlabs.io).
- **Pronunciation, reported by 3 testers:** `nesteggu.com` written as one token is heard as
  "nesticu"; she writes "nest egg you dot com" on some calls and "nesteggu.com" on others. Nick
  Mazioski: "401AKs" for 401(k)s.

**Next session:**
> (1) Design checkpoint: compute the loan maximum deterministically in `get_balance`
> (lesser of $50,000 minus the highest loan balance in the past 12 months, or 50% of vested) and
> retire the `no loan limit is ever returned` test, whose premise (limits unpublished) is false.
> (2) Run the grader on all 87 wave calls; report security and contradiction counts from it.
> (3) Pronunciation: normalise the portal URL and "401(k)s" in the prompt, the KB and the dictionary.
> (4) Fix the voice parser returning 1 on a comment with no number.
> (5) Get the call center's NPS for loan calls. That is the comparator the guide says matters.
> (6) Survey page: exclude the builder's own calls, relabel "N respondents" as "N responses from
> M people", and compute NPS from unrounded shares.

---

### 2026-09-24 — A respondent is the name they gave (migrations 015 and 016, applied live mid-wave)

- **Why.** Three testers dialled in from one office line. Migration 014 keyed a respondent on
  phone + persona, so Colin Stevens, Kelsey Simonson and Stacy Oliver were one respondent with six
  responses, labelled by the latest name heard, and the review list credited Stacy with Colin's
  words (`conv_7001m378zqa0f8s8v938vbq7sqmg`, NPS 3). Tanner: identity is the `caller_name` the
  tester gave, and the phone number must not merge people.
- **Rule (015).** `person_key` is a hash of the normalised name. Phone is used for one thing: two
  spellings heard on the same phone whose first or last name are within Levenshtein 2 are one
  person (`fuzzystrmatch`), because the transcriber hears "Maziaski", "Mazioski" and "Nick" for
  one caller. Different names on one phone are different people; the same name on two phones is
  one person. `respondent_aliases` is the hand-correction table, first row "Katie Rubless" →
  Adie Robles (Tanner's call, to be confirmed at work). Calls without a name keep the old key.
- **Label (016).** `survey_answers.respondent_name` is the alias-resolved, fullest spelling for
  the person on that call; `survey_people.caller_name` and the broker's `respondentLabels` both
  use it, fullest name first, earliest on a tie. 015 alone labelled Adie "Katie Rubless".
- **Verified live, before → after:** respondents 29 → 30, surveyed wave calls 61 → 61, no call
  left unkeyed. The shared line is now Colin (3 calls, all flagged), Kelsey (2), Stacy (1). Adie's
  three calls are one person under one name. Kristen Johnson, previously two persona keys on one
  phone, is one person with three calls, which is what the rule says.
- **Unverified: the spelling of nine labels.** The fullest-name rule is a guess where the
  transcriber disagreed with itself: Cherie Ann/Anne Holbrook, Nick Maziaski/Mazioski, Robin
  Paff/Path, Steve Castro/Castrol/Kestrel/Cattrall Miller, Maddie Bolton/Walton, Ian Massey vs
  Ian Matthew McCall Burrows, Jennifer Berdamati/Bertamani, Colin Stevens vs Colin James Stephens,
  Adie/Ady Robles. Each is fixed with one `respondent_aliases` row per misheard spelling; the view
  picks it up on the next read.
- Broker: `respondent_name` added to `CALL_COLS`; labeller test rewritten; 56/56.

### 2026-09-20 — Customer wave cutover (applied live, day before the wave)

- **Migration 014 applied to the live project.** `experiment_waves` holds one row, `customer`,
  starting 2026-09-21 00:00 Central (05:00 UTC). `survey_answers.in_survey_era` now also requires
  `started_at` on or after `survey_wave_start()`, and `response_seq` restarts inside the wave, so an
  internal tester's first wave call counts as a first call. `caller_name` added to both views and to
  the broker's column lists; respondent labels use it when present. Verified: raw calls 108 before
  and after; survey-era calls 52 → 0 and respondents 8 → 0 until the first wave call; the same
  clause with a Sep 8 start reproduces the 52. Calls and Accuracy untouched.
- **Robin change Tanner makes in the dashboard:** Data Collection field `caller_name` (string,
  "the caller's full name exactly as they gave it when introducing themselves; empty if they never
  gave one"). Post-call analysis only; the call path is unchanged. Must exist before the first
  tester call.
- To move the start: `update experiment_waves set started_at = ... where wave = 'customer'`. To show
  the testing wave again: delete the row.

### 2026-09-11 — Session 9 (the loan-wave handout, and a tool deletion stopped two steps in)

**Status:** live agent is **`agtvrsn_8701m28xknxne5vb4rd1q77ff5nc`** (v115, "Add Spanish language
support and localization presets", committed 1789153368 by Tanner in the dashboard). The handoff
above named v114 `agtvrsn_0801…` as live; it is now the parent. **Rollback point is v114.** The
phone number is assigned to the Main branch, not pinned to a version. Broker unchanged at `dc6fd8f`.

**What we did**

- **Tester handout rewritten for a 25-person loan wave** — [`demo/TEST-PLAN.md`](./demo/TEST-PLAN.md),
  published at https://claude.ai/code/artifact/3c55b0a8-d557-404d-851f-c36bb39df607, and sent as a
  Word document for Tanner's edits. Five loan scenarios run in order (3 minimum), scenario 3 ends in
  an accepted transfer, five non-loan curveballs (three the live KB answers, two it routes to the
  portal, where the tester declines the transfer so the survey still fires). Testers give their
  **own full name** at the top of the call and Marcus's Member ID + DOB to verify. Rules and the
  end-of-call section removed at Tanner's request; one closing line keeps the survey visible.
- **Every question verified against the live KB** — [`demo/TEST-PLAN-answer-key.md`](./demo/TEST-PLAN-answer-key.md)
  (internal). All four Vertex documents read from the dashboard, not `kb/`. Of 14 scenario
  questions, 11 were heard on `conv_8301m28d4f7zfeja4k2ycd9mb9eh` in the expected form; 3 are in the
  KB but unheard ($1,000 minimum, after-tax payroll repayment, the accepted transfer). All five
  curveballs are in the KB and unheard.
- **`get_plan_details` deletion, stopped at step 3 of 4.** Step 1 done: the Plan Questions draft
  references `get_balance` (`tool_4901ky8939e2e7stm12y3p2xw7kt`) with "borrowing limit" dropped from
  the list of things to look up, guardrail intact. Step 2, `agents_compile_procedures`, ran and
  changed nothing — the branch HEAD procedure is still `agtprcv_8401…` with `get_plan_details`,
  and the agent version is unchanged. `survey/README.md` already said so: **compile does not publish;
  an `agents_update` on the agent does.** Step 3 (`agents_update` dropping the tool id, which would
  also publish the draft) was refused by the harness permission classifier, twice. Nothing on the
  live agent changed this session. Robin runs as she did this morning.

- **Loans KB document updated live (2026-09-14)** — `omgR8I0aJlWd7BAUptbJ`, in place, same id, via
  `agents_update_kb_document` with `content`. Two new sections: "Contributing while you have a loan"
  (yes; match continues; repayments are a separate after-tax deduction) and "Paying a loan off early"
  (full payoff, no penalty). Source of truth is now
  [`kb/vertex/vertex-401k-loans.md`](./kb/vertex/vertex-401k-loans.md); `kb/vertex/README.md` maps
  live ids to sources. **Verified from the far side:** the RAG index rebuilt on its own
  (`last_updated 1789404496`, new chunk ids), and both sections are the top chunk for their
  question. `agents_get_kb_dependents` shows Robin and the survey-test clone
  (`agent_7401m1f4033qene9ybgt78d3saw4`) both use this document, so the clone got the change too.
  One side effect: the document is now stored as markdown text where it used to be rendered HTML
  (`content_format` still reads `html`); it chunks as one large block plus a tail rather than
  several small ones. Retrieval works; watch `rag_retrieval_info` on the first live loan call.

- **Survey dashboard reworked for a cold reader (2026-09-15)** — `broker/public/survey/index.html`,
  on the branch, **not promoted**. Order is answer → reasons → proof: hero, then the score-vs-choice
  grid (retitled, with the changed-mind and detractor-who-prefers-Robin lines under it), Needs
  review, **What people said** (themes and comments merged: each theme is a `<details>` whose body
  is the comments behind it, unplaced comments under "Other comments", plain list until themes are
  ready), **Is the sample big enough?** (adherence line moved here from the hero; section now
  renders below 20 respondents with a "chart appears at 20" note), Every call, Downloads. Every
  section title carries a "?" tooltip with "what it shows / how to read it"; the dot grid has its
  own ("Each dot represents one call"). **Ask a question** is a floating bottom-right button that
  opens a panel; same endpoint and gate. Dropped as fluff: the "Test instrument" tag, the model
  narrative paragraph, the adherence and response-rate hero tiles, both retired-scale footnotes,
  the "Unclear" prose under the grid, the repeat-caller count, the dot-order caption. Voice now
  sits beside NPS with the same thin-sample state. Verified by rendering with a 25-call fixture
  served over local HTTP (Playwright routes do not intercept `file://` fetches, and a catch-all
  route registered last shadows specific ones); tests 50/50. Reader's guide
  (`survey/READING-THE-DASHBOARD.md` and the published page) updated to the new section names.

**What broke / surprised us**

- **`transfer_to_number` points at `+13166807638`** — the same number that placed
  `conv_8301m28d4f7…`, i.e. Tanner's phone. Scenario 3 sends every tester there once. Tanner is
  changing it before the wave.
- **Egress blocks `elevenlabs.io` entirely** — no docs, no conversation audio, and the MCP server
  has no audio endpoint. Both audio defects are **unverified** and stay that way from this
  environment. From the payload: `[smile] Bye now.` is the LLM's own `message` at 469s, it occurs
  exactly once across every Robin conversation (transcript search), and `eleven_v3_conversational`
  with `expressive_mode: true` most likely consumed it. Search snippets say `optimize_streaming_latency`
  is deprecated; whether it does anything on v3 conversational is unknown. Pronunciation dictionary
  `cFBuHh4kIgF2ajFPLWvN` is attached and unreadable through the MCP — an equal suspect.
- **The classifier treats every ElevenLabs write on Robin as a production deploy.** Draft writes
  pass; compile, agent update and (presumably) tool delete do not. Either allow those actions for
  the session or do steps 3–4 in the dashboard.
- **Any agent save publishes the pending procedure draft.** When Tanner changes the transfer number
  in the dashboard, the Plan Questions procedure will switch to `get_balance` in the same version.
  That is the intended state, but it will happen as a side effect, so expect it.

**Still open**

- **Steps 3–4:** remove `tool_1201kwwewchgef7tcp1kbn77jjtf` from the agent's `tool_ids` (or save
  any dashboard change, which publishes the draft), verify the HEAD procedure references
  `get_balance`, then delete the tool **without** `force`. Then re-read the agent and diff against
  `pre-update.json` fields: two earlier updates altered fields nobody sent (`skip_turn.description`,
  `post_call_webhook_id`).
- **Audio:** needs Tanner's two answers — which word came out wrong at ~450s, and whether "smile"
  was audible at 7:49 — before any TTS change. If a change is made, `optimize_streaming_latency`
  3 → 0 is the low-risk first move; stability and the dictionary stay put.
- **Tracking who asked what:** the tester's stated name lands in the transcript and `notes`, not a
  dashboard column. A `caller_stated_name` Data Collection field plus a view change would make it one.
  Data-collection writes are a **full replace** — send the whole field set.
- **Topic slice:** the wave is loans-only by design, so NPS-by-`plan_topic` will have one row plus
  whatever curveball C (quit next month) pulls into `leaving_employer`.
- Carried: `version_id` slice, Marcus's loan figures drifting one payment per fortnight past
  2026-09-10, the Account Recovery SSN instruction, the RMD gap, two `send_reset_email` copies,
  `document_resolution` on every call, and `survey/data-collection-fields.json` being stale (1–5
  satisfaction; live is 0–10 NPS).

**Next session:**
> Read `CLAUDE.md` Settled decisions first. Then: (1) finish steps 3–4 above and verify from the
> live side; (2) confirm the transfer destination Tanner set; (3) fold any further handout edits
> from the Word document into `demo/TEST-PLAN.md` and the artifact, keeping the answer key in step;
> (4) audio, only with Tanner's answers in hand.

---

### 2026-09-11 — Sessions 7–8 (Marcus's loan, the prompt reconciled, the survey re-based)

**Status:** live agent `agtvrsn_0801m28cx0z8fmf92kbqg9jq99ng`. **Rollback point:
`agtvrsn_6701m268gntcfhs8sq3h1hphg8dy`.** Broker promoted through `008a2d0` — topic slice and NPS
redesign are live. Survey dashboard: `voiceagents-seven.vercel.app/survey` (gated by
`SURVEY_PASSWORD`).

**What we did**

- **Marcus can be asked about his loan.** New `member_loans` table (migration 013) with a partial
  unique index on `(subject_ref) where status='active'`, so the plan's one-loan rule cannot be
  violated by data — verified by attempting a second active loan and getting `23505`. `get_balance`
  returns a `loan` object; `dollarsExact()` and `spokenDate()` are deliberately separate from
  `dollars()`, which rounds to whole dollars and is right for a balance but would quote $75 for a
  $75.64 payment. Marcus's schedule is a checked amortisation, not invented figures.
- **Verified live** on `conv_8301m28d4f7zfeja4k2ycd9mb9eh`: `get_balance` 683ms, `is_error` false,
  Robin said "five thousand four hundred ninety dollars and thirty-seven cents… *scheduled* to be
  paid off." The LOAN TRAP also fired **flat** this time, grounded in his real 83 remaining payments.
- **Prompt pushed live** after reconciling repo against live. The drift was exactly three items,
  bounded by diffing a transcription of the live prompt against the pre-edit repo file at `6e4853c`.
  Repo and live are now equal for both prompt files.
- **`get_balance` protected from interruptions** (`disable_during_tool_and_turn`), after a caller's
  "Okay" mid-lookup returned `is_error: true, latency 0` and Robin answered with no account data.
- **Survey re-based on RESPONSES, not people** — deliberate for the testing wave, where one tester
  runs several scenarios and each reaction is wanted. People, `repeat_callers` and `changed_mind` are
  still counted over PEOPLE. Filtered to `in_nps_era`: clean start, v2 only. Nothing deleted.
- **NPS sliced by `plan_topic`**, plus `detractor_but_prefers_agent` — the cell that makes the
  deployment case. **This is the highest-value thing in the dashboard and it only works if testers
  spread across topics.** If every tester asks about loans it has one row and says nothing.
- **NPS block redesigned** after the first attempt read as muddled: definition into the label,
  composition into a diverging bar, thin-sample expressed as a rendered state.

**What broke / surprised us — four corrections to my own claims**

- **`kb/` is not the Knowledge Base.** Live is five **Vertex** documents in the dashboard, with no
  source in this repo. `kb/` is INTRUST-era, drives nothing, and contradicts live on loan limits and
  fees. A whole design rested on `kb/` saying limits are unpublished. They are published, in full.
  Files now carry a staleness banner.
- **`lumio-retirement.vercel.app` is NOT a dead host.** It answers. `document_resolution` returned
  `{"logged":true,"ticket_id":"ticket_1"}` in 287ms. `get_plan_details` returns `{"found":false}`
  because that deployment's database has no Marcus — a data mismatch, not a missing server. I
  inferred "dead" from a `found:false`, which is a successful HTTP 200.
- **A transcript is not a tool payload.** Reading only the transcript produced a confident, wrong
  diagnosis of a LOAN TRAP failure when `tool_results` said the lookup had been aborted.
- **Robin's derived loan figures were correct.** I flagged "she computed a borrowing limit" as a
  defect. 50% of vested is $9,561.35 and she said "around nine thousand five hundred"; the clause I
  accused her of dropping applies to the $50,000 prong, which is not binding. `max_loan_cents` is
  read by **no code at all**. The real finding is weaker and more structural: four sources could
  answer "what can he borrow" and only one is wired to anything, so nothing could have caught her
  if she *had* been wrong.

**Still open**

- **`get_plan_details` should be deleted** — superseded by `get_balance`. It is the Plan Questions
  procedure's `referenced_tool_ids` entry, so the tool and the procedure reference must be cleaned
  **in the same change** or the procedure breaks.
- **`[smile]`** — Robin's final turn on `conv_8301m28d4f7...` was `[smile] Bye now.`, against the
  prompt's explicit bar on bracketed audio tags. Check the recording: `eleven_v3` runs with
  `expressive_mode` on, so it may have been consumed as expression rather than spoken.
- **A word came out wrong on the wire.** Transcript reads "Have a great day"; the caller heard
  something else. **Unverified** — audio not reachable from the session. First suspect is
  `optimize_streaming_latency: 3`; try 1–2 before touching stability or the pronunciation dictionary.
- **`version_id` slice deferred.** It is in `raw_payload->'data'->>'version_id'` but is not a column
  anywhere, so it needs view surgery on `survey_answers` (7,263 chars, 31 dependents) or a PostgREST
  JSON-path fetch. I told Tanner it was "stamped on every conversation" — it is in the payload, not
  in a column.
- **Marcus's loan figures are point-in-time** and drift one payment every two weeks past 2026-09-10.
  Re-run the amortisation if the demo slips a month.
- Carried: the Account Recovery procedure's SSN instruction, the RMD coverage gap, two copies of
  `send_reset_email` in the workspace, and `document_resolution` firing on every call.

**Next session:**
> **Read `CLAUDE.md` first — its "Settled decisions" block and the three new bullets in "Prove the
> premise" are load-bearing.** Robin does NOT disclose she is a virtual assistant; that was
> deliberate and is not a defect to fix.
>
> **The 3-day tester plan is written and submitted for approval** — [`demo/TEST-PLAN.md`](./demo/TEST-PLAN.md),
> published at https://claude.ai/code/artifact/30f17d77-27f7-4c66-b730-b6a392347b78. Eight scenarios
> on the Marcus profile. Two decisions in it are load-bearing and should not be undone casually:
> testers get **no answer key**, so they cannot grade accuracy even if they want to; and scenarios
> **spread across `plan_topic`**, or the topic slice has one row and tells you nothing.
> Waiting on approval — if it comes back with changes, they land in that file.
>
> Architecture of a Robin call, read off live config:
> https://claude.ai/code/artifact/44838694-1dd8-418d-a7e1-7e8d09bcbc93
>
> Then: delete `get_plan_details` together with its procedure reference, and chase the two audio
> defects above.
>
> Verification habits that earned their place today, all three now in `CLAUDE.md`: read
> `tool_results` not transcripts; compare promote timestamps to `start_time_unix_secs`; and check
> live config before trusting any file in this repo.

---

### 2026-09-09 — Session 6 (two live-call defects, and the repo caught up to live)

**What we did**

- Fixed the **age remark**. On `conv_7701m23fw5m6fy2vn5h15srv4j7g` Robin said "RMDs start at age
  seventy-three. Since you're well past that, I'm guessing you're either already taking them or
  want to know how they work," twice in one call. The caller named it in question four: "a little
  disrespectful." That call scored 3, went negative, and preferred a person. New
  **DON'T CHARACTERISE THE CALLER'S SITUATION** block, placed high in the prompt.
- Fixed the **dead air**. On `conv_0701m236q3cve3hr1rkftmamfkmz` the caller said "Um, five," Robin
  called `skip_turn`, and eight seconds later the caller repeated himself: "That was a five. What?"
  `skip_turn` has fired on **6 of 59 calls**, five times in one of them.
- Root cause was config, not prompt: **`skip_turn`'s description was empty**, so the model picked
  when to use it from its own prior. It now has one. The survey block's TAKE THE ANSWER AND MOVE ON
  line also names the short-answer case — restating the rule alone would not have helped, since the
  rule was already there and got ignored.

**What broke / surprised us**

- **A banned-word list would have contradicted the LOAN TRAP rule.** The first draft of the new
  block banned the tokens "only" and "already"; the prompt elsewhere *requires* "this plan allows
  only ONE loan outstanding" and "they already have a loan." Caught in the pre-ship read of the
  diff. The block names full phrases attached to a caller fact instead.
- **`agents_update` wrote a field that was never sent.** The call passed `prompt` only. The response
  came back with `built_in_tools.skip_turn.description` populated with the exact text drafted in
  this session — line breaks and all — and `metadata.updated_at` is identical across the update
  response and a following read, so it was one write, not two. The outcome is correct and verified,
  but the mechanism is **unexplained**. Session 4 left "merge-vs-replace semantics" open for partial
  updates; this is a data point that the connector may do more than pass through. Treat any partial
  `agents_update` as capable of touching fields you did not name, and read back after every write.
- **The update response omits `phone_numbers`** (returns `[]`) where the read includes it. Not a
  detachment — the following `agents_get` shows `+18335739530` still assigned. Don't panic on it.

**Repo vs live drift, now closed**

`survey/survey-block.txt` had question one as "Quick one to five, how was that for you?"; live Robin
asks "On a scale from one to five, how was this experience for you?".
`survey/robin-prompt-WITH-survey.txt` was staler still — it carried the abandoned TWO-question
survey. Both now match live exactly, verified by diff (`grep -v '^$'` on both sides, zero
differences). `elevenlabs-experiment-setup.md`'s paste-ready prompt would break Robin if pasted (it
still says "INTRUST 401(k) Plan") and is now marked stale, pointing at the file that is kept in step.

**Simulation results (79 runs against the updated live agent)**

- **Tone fix: verified.** 12/12 on the corrected test, and **zero** occurrences of "well past" in any
  agent response across 32 tone runs. Robin now says "Required Minimum Distributions must begin at age
  seventy-three. Since you are seventy-three this year, your RMDs are due now" — the corrected phrasing,
  and factually right where the old one was not.
- **skip_turn fix: verified.** `skip_turn` appears in agent responses **once** in 79 runs, and that one
  was after Robin's own plan-confirmation question, not after a short answer and not during the survey.
  Zero in all 20 runs of the one-word-answer test. Base rate before the fix was 6 of 59 real calls.
- **Eligibility gates: intact.** Suppressed-on-transfer 5/5, suppressed-on-failed-verification 5/5.
- **Survey adherence: NOT clean.** 2 runs reached a natural close on an eligible call and Robin never
  raised the survey, closing with "It was a pleasure assisting you today." The live evaluation criterion
  agrees: `survey_verdict` on real survey-era calls is 3 success / 1 failure. Small n, but the simulation
  and the real data point the same way. This is pre-existing, not caused by this session's change.

**Gate fix: a transfer they turned down is not a transfer**

Diagnosed from `conv_2601m218pga3fgc809erb1q619hp`, the only real adherence miss. Robin entered the
transfer path at t=68, Marcus declined at t=80, and she closed at t=91 with no survey. Gate (a) had no
clause saying a declined offer is not a transfer. Clause added, live as
`agtvrsn_0701m240shshe47arv4tdf4a3099`.

- **Suppression is unharmed**, which was the risk: suppressed-on-failed-verification **8/8**,
  suppressed-on-transfer **8/8**, and across all 16 suppression runs the survey leaked **zero** times.
- **The desired behaviour occurs.** On a declined-transfer call Robin now says "Before I go, please
  answer the following questions. On a scale from one to five, how was this experience for you?"
- **The survey fired in 2 of 7 usable pre-fix runs and 6 of 8 post-fix** (29% -> 75%).
- Judge this test by whether the survey FIRED, not by its pass/fail verdict. 6 of 8 post-fix runs are
  recorded as failures because the simulation timed out, but the survey had already fired in most of
  them. v4 is the longest scenario in the suite — declining transfers stretches the call — and it hits
  the harness's 60s-per-turn ceiling routinely. Shorten it or raise the turn budget before relying on
  its verdicts.
- **Still not a verified rate.** n=8 on a backup-model-served harness. Those runs were also Gemini-served (see `_model_note`).
  The real verification is the live `survey_asked_when_eligible` criterion on the next batch of calls,
  which already runs on every call and costs nothing extra.

**⚠️ The post-call webhook ID changed and nobody meant to change it**

At 1788983254 the agent carried `post_call_webhook_id: 4deed01a5a2d420f8781ecdb1d7fa804`. After an
update that sent ONLY the prompt field, it reads `933e9fc471ac45349b6a5768edab3cbb`. This is the second
time an `agents_update` came back having altered a field that was not sent (the first was
`skip_turn.description`). **Confirm in the ElevenLabs dashboard that the post-call webhook still points
at the broker's `/api/postcall` before the wave.** If it does not, calls stop reaching `ai_call_events`
and the survey silently collects nothing. Last confirmed good delivery: the 21:10 call on 2026-09-09.

**New defect found while reading transcripts**

Robin sometimes speaks her filler wrapped in literal quotation marks. On real call
`conv_9901kymzs07yfg0vat8pqg2eg2rb` at t=85s her entire turn was `"Okay...". "Right..."...`. The prompt's
closing line already forbids this ("Speak ONLY the words meant to be heard"). One turn in 762 recorded,
so rare, but it is real and it is on a Haiku-served production call, not a simulation artifact.

**Still open**

- The live **Data Collection `satisfaction`** description still quotes the old question-one wording.
  Cosmetic — both scores parsed — but live is internally inconsistent until it changes.
- The **RMD coverage gap** behind that 3-star call: Robin answered an RMD question with no
  `get_balance`, said "yes, you'd need to be taking them" (close to the tax-advice line the prompt
  forbids), offered a transfer, and on refusal just repeated the age-73 fact. RMDs are in none of
  the five KB documents. This is why that call went badly; the tone fix does not address it.
- Neither prompt change has been **verified behaviourally**. `survey/simulation-tests.json` exists
  and could be run against the updated agent.

**Next session:**
> Decide on the RMD coverage gap: either a KB article or an explicit "we don't cover RMDs, here's a
> transfer" path. It is the substantive defect behind the only negative call in the survey era.
>
> Then run `survey/simulation-tests.json` against live Robin to confirm the two prompt changes
> actually hold under pressure — neither has been tested past a config read.
>
> Rollback point for this session's live change: version `agtvrsn_6901m23g5bpgfq1arvgqzpnecwdr`
> (pre-change). Current is `agtvrsn_5301m23vc77yfxqrdqnz01yyt0gy`.
>
> Carried over, still open: the three pre-existing live-agent defects (dead `get_plan_details` host,
> the Account Recovery procedure's SSN instruction, the prompt fork), the `survey_people` /
> `person_key` rename, and whether `needs_review` should include 3s.

---

### 2026-09-04 — Session 5 (the survey, built and measured)

**What we did**

- Built the **viability survey** on a clone (`agent_7401m1f4033qene9ybgt78d3saw4`), never on
  live Robin. Everything is in [`survey/`](./survey/) — block, fields, tests, criterion,
  architecture, and the paste-ready assembled prompt.
- Cut it from four questions to **two**: a 1-5 satisfaction rating and the preference question
  with Tanner's "even if it took longer" clause, which is load-bearing.
- Wrote **three simulation tests** and ran them at `repeat_count` 20. Sixty simulated calls,
  no phone involved.
- Added a **per-call evaluation criterion** (`survey_asked_when_eligible`) so adherence is
  measured on every real call rather than assumed.

**What broke / surprised us**

- **The tests found two defects that reading the prompt would not have.** The pre-transfer
  carve-out overrode the verification-failed gate about 1 call in 10 — Robin ran the whole
  survey on someone she had just failed to identify. Separately, 3 in 20 she *offered* the
  questions and then fired `transfer_to_number` before collecting the answers, spending the
  ask and recording nothing. Both fixed in v3 by hoisting the gate above both ask paths and
  forbidding the transfer call until both answers are in.
- **Reading pass counts without reading failure causes is a trap.** The resolved-call scenario
  read 3/20, which looks like disaster. All 17 failures were harness: 12 simulation timeouts,
  5 simulated callers hanging up. Every criterion that could be evaluated passed, with the
  judge quoting Robin verbatim.
- **The stale Lumio host is live and quantified.** Across 60 runs the agent hit
  `lumio-retirement.vercel.app` 26 times (`document_resolution` 18, `get_plan_details` 7,
  `send_reset_email` 1). `get_plan_details` returns `{"found":false}` with no error and is the
  prime suspect for those 12 turn timeouts.
- **The branch is not the gate we thought.** ElevenLabs stores Data Collection results on the
  conversation itself — verified by reading two real calls. Fields + prompt is enough to
  *capture* data. `claude/robin-survey` gates the dashboard, not the collection.

**Decisions made**

- The survey is a **temporary instrument**, the grader is the permanent system. They write
  different tables and don't interact — confirmed by reading `grader/lib/judge.js`, which only
  scores questions the *caller* asks, so survey turns never enter the eval set.
- **Ask on transfers too.** A transfer is often a win (5 of 10 transfer-ending calls in the
  history carried positive sentiment), and the moment before a handoff is the most informative
  place to ask the preference question.
- **Don't suppress on frustration.** That rule deleted exactly the responses worth having.
- Field writes through the connector are a **full replace, not a merge**.

**Next session:**
> Read the re-run of the 60-call suite and confirm both defects are gone. Then, in order:
> (1) fix the live-agent defects — `get_plan_details`, the Account Recovery procedure's SSN
> instruction, and the prompt fork; (2) rename `understood` → `satisfaction` in
> `broker/lib/survey.js` or the parser writes nulls; (3) add the `members.cohort` column and
> the `postcall` join so waves stay separable.
>
> Tanner's calls, still open: settle the prompt fork, sign off the two questions, merge
> `claude/robin-survey`, set the verdict thresholds, decide whether any non-employees can be
> recruited, and place one real widget call before the wave.

---

### 2026-09-01 — Session 4 (the connector answers, and the prompt has forked)

**Task 1 from the Session 3 handoff is done. Both halves of it answered yes.**

**Can the connector write Data Collection fields? Yes — and it does the new thing too.**
The read-only `agents_get` shows fields under `platform_settings.data_collection`, and a write
through `agents_update` (raw `body` escape hatch) created all 8 survey fields on the first try.
More usefully, the API also minted 8 matching `analysis_items.data_collection` entries
(`aitem_…m1f41…`), which is the newer structure the dashboard actually reads — so this is a real
create, not a write into a legacy field the UI ignores. **No hand-entry in the Analysis tab is
needed.** Count went 11 → 19.

- One wrinkle: `data_collection_scopes` still lists only the original 11. The new fields carry
  `"scope":"conversation"` on their `analysis_items` entries, so this is probably a vestigial map,
  but it is unverified — check the 8 fields actually populate on the first real call.
- The full 19-field set was sent deliberately, so merge-vs-replace semantics never mattered. That
  question is still open if anyone wants to send a partial update later.

**Survey-test clone is live and configured:** `agent_7401m1f4033qene9ybgt78d3saw4`
("Robin — survey test"). Prompt + all 19 fields set. **No phone number attached** (duplication
doesn't carry one), so it is web-widget only until someone assigns one. Live Robin
(`agent_8301kwj5qa8ve1atremxxwjjp9f8`) was not touched.

**What broke / surprised us**

- **The system prompt has forked three ways, and production is the odd one out.** Session 3 left
  two copies with a drift test. There are actually three, and the live agent matches neither: it
  carries a condensed `A SPOKEN NAME IS NOT IDENTIFICATION` block, where `claude/robin-survey` has
  the fuller `GET A NAME BEFORE YOU VERIFY` flow, the `A SPOKEN NAME IS NEVER IDENTIFICATION`
  wording, and a `USE THE NAME ON THE RECORD ONCE VERIFIED` rule (use `first_name` from
  `verify_caller`) that production **does not have at all**. Live was last updated ~2026-08-06,
  three days *after* the branch — so someone edited the dashboard from an older base and dropped
  the branch's name-handling work.
  Neither copy is a superset. **This is a decision, not a merge**, and it is Tanner's:
  does production keep its condensed rule, or take the branch's name-first flow?
  Captured production verbatim to `robin-system-prompt.LIVE-2026-09-01.txt` so the live text exists
  somewhere other than the dashboard. The clone was built by appending *only* the survey block to
  that live text, so testing the survey does not smuggle in the name-flow change.
- **Three tools on the live agent still point at `lumio-retirement.vercel.app`** —
  `get_plan_details`, `send_reset_email`, `document_resolution` — while `verify_caller` and
  `get_balance` point at `voiceagents-seven.vercel.app`. `get_plan_details` is the dangerous one: it
  overlaps `get_balance`, the prompt never mentions it, and nothing stops the model reaching for it
  and getting figures from a different deployment. The setup doc's §2 note already says the
  experiment dropped `send_reset_email` and `document_resolution`; they are still attached.
- **The clone inherited production's post-call webhook** (`post_call_webhook_id`
  `4deed01a…`). Test calls on the clone will POST to the *production* `/api/postcall` and write
  real `ai_call_events` rows. Harmless for the survey (prod has no parser, so survey fields are
  ignored) but it means clone traffic is not isolated from the experiment's data.

**Next session:**
> **Task 1 is finished except the part that needs a human**: place a web-widget call to the clone and
> confirm Robin (a) offers the survey after a resolved question, (b) does NOT offer it on a transfer
> or a failed verification, and (c) that the 8 fields populate. Use Priya — Member ID `90003`,
> DOB 1974-06-08 — per Session 3; Marcus routes to a transfer and suppresses the survey by design.
> Nothing will be *recorded* until Task 2 ships, so this call tests prompt behaviour and field
> extraction only.
>
> **Then Task 2, unchanged and still the blocker:** get `claude/robin-survey` to production.
>
> Two new items, both small and both live-config risks: **detach or repoint the three
> `lumio-retirement` tools**, and **settle the prompt fork** (see above) before anything is pasted
> into the live agent.

---

### 2026-08-03 — Session 3 (survey + a broken grader)

**HANDOFF: read this block first, then the two "Start here" tasks at the bottom.**

**Where things stand**

Two branches, neither merged. `main` does not have any of this.

| Branch | Contents |
|---|---|
| `claude/repo-familiarization-h6dd80` | edit fact-check on save, grader stuck-detection, dashboard tile split, name-first prompt, outbound-calling reference |
| `claude/robin-survey` | branched off the above, so it contains **all of it** plus the survey. 11 commits ahead of `main`. |

`claude/robin-survey` is the one to work from — it has the complete prompt.

**Three switches, and only one is on.** The survey needs all three:

| Piece | Where | State |
|---|---|---|
| `call_surveys` table | Supabase | ✅ applied (migrations 007, 008) |
| `postcall.js` survey write + `GET /api/surveys` | Vercel prod | ❌ unmerged branch |
| Survey prompt block | ElevenLabs system prompt | ❌ not pasted |
| 8 Data Collection fields | ElevenLabs Analysis tab | ❌ not created |

⚠️ **Paste the prompt without deploying the branch and Robin asks all three questions while nothing
is recorded** — production `postcall` has no parser. Order: deploy → fields → prompt.

**The survey, as designed.** Asks about the agent, not the outcome:
1. "How well did I understand what you were asking?" (1-5) → `understood`
2. "Would you rather sort this out with me, or wait for a person?" → `prefer_agent`
3. "Anything I could have done better?" (open) → `improve_verbatim`, PII-scrubbed
4. Callback consent + window → the seed for outbound

There is deliberately **no "did we solve it" question** — the grader already computes resolution per
question from the transcript. `csat` remains as a column and parses if it comes up, but is no longer
asked directly.

**What broke / surprised us**

- **The grader had been silently dead for weeks.** `call_question_scores.question_key` still had a
  foreign key to `curated_questions`, left behind by the answer-key removal. Observed keys are
  kebab-case (`loan-eligibility-401k`); curated keys are underscored. Every score row for a call
  where Robin actually answered threw 23503, the error went to `console.error`, `scored_at` was
  never stamped, and the same ten calls were re-graded on every 30-second dashboard refresh —
  paying for the model each time and writing nothing. Only calls where she answered *nothing* got
  through, because those write no score rows. That is why 3 of 30 looked graded.
  Fixed by migration `drop_call_question_scores_curated_fk`; backlog drained to 30/30.
- **The real numbers were nothing like the stale ones.** After the fix: 130 questions asked across
  30 calls, **100 answered (77%)**, 13 fixable by writing an article, 17 not content problems at all
  (10 out of scope, 7 correct declines).
- **Only 8 of 97 answers could be fact-checked**, because the Vertex documents were hand-loaded and
  have no `kb_articles` row. Of those 8, **6 made a claim the source didn't support.** Tiny sample,
  points the wrong way, worth watching as coverage grows.
- **Gap closure is wired to fail.** The dashboard's "Ask for this" button posts no `plan_id`, so
  rows land with `plan_id=''`, while `resolveGapsFor()` queries by the article's real `plan_id`
  (`intrust-401k-plan-1`). It has never fired, and when it does it will match nothing. **Not fixed.**
- **Three copies of the system prompt existed and one had rotted** — the setup doc still said INTRUST
  months after the move to Vertex and was missing every rule added from live-call testing. Now two
  copies with `test/prompt-sync.test.mjs` failing on drift.

**Decisions made**

- Survey collected via **Data Collection, not a mid-call tool** — answers are in the transcript,
  nothing needs them during the call, and a tool adds latency plus a new way for the conversation to
  break.
- Ratings outside 1-5 are **discarded, not clamped**; unknown stays `null`, never `false`.
- `call_surveys` has **no `plan_id` column**, deliberately — we cannot populate one from a call, and
  `gap_requests` just showed what an always-empty tenant column costs.
- Outbound survey calls are **gated on TCPA**, not engineering. The API exists (below); consent is
  the blocker and needs a human at INTRUST.

**Environment gotchas that cost time**

- `elevenlabs.io` and `*.vercel.app` are **blocked by the agent proxy**. Use
  `mcp__Vercel__web_fetch_vercel_url` for Vercel URLs; for ElevenLabs docs, `github.com/elevenlabs/skills`
  is reachable and first-party.
- **Vercel builds only what is inside a project root** — `content-cleaner/cleaner` and
  `robin-experiment/broker` are separate projects and cannot import from each other. That is why the
  PII scan is reimplemented in `broker/lib/survey.js` instead of reusing `deterministicScan`.
- Migrations are applied via Supabase MCP **and** mirrored into `supabase/migrations/`.

**Demo credentials (synthetic)**

- **Marcus — Member ID `90002`, DOB 1998-09-30.** Not fully vested, **has an outstanding loan** →
  best for demoing the loan trap, but the loan-limit gap routes to a transfer, and the prompt
  forbids offering the survey mid-transfer.
- **Priya — Member ID `90003`, DOB 1974-06-08.** Fully vested, no loan → nothing triggers a
  transfer, so the survey actually fires. **Use Priya to demo the survey.**

**Outbound calling — verified, for when TCPA clears**

`POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` with `agent_id`,
`agent_phone_number_id`, `to_number` (E.164), plus
`conversation_initiation_client_data.dynamic_variables` — that last one is how an outbound agent
knows who it is calling and why. Batch endpoint exists too but its body schema is **not** first-party
verified. See `docs/elevenlabs-reference.md`. The caller's number already arrives on every inbound
call at `metadata.phone_call.external_number`.

**Open unknowns, cheapest probe first**

| Unknown | Probe |
|---|---|
| Does the ElevenLabs API return KB **document text**? If yes, hand-loaded Vertex docs become gradeable and the `no_source` problem disappears | `broker/api/kb_probe.js` — **written, never run** |
| Does the ElevenLabs MCP connector expose **Data Collection field** creation? | one read-only `agents_get` |
| Is 6-of-8 unsupported real or noise? | needs more checkable answers |
| Does multi-tenancy work with two live plans? | seed a second `plan_id`, run one call |

**Next session:**
> **Start here (1) — ElevenLabs, with the connector live.** It was announced this session but
> disconnected before it could be used. First call is **read-only `agents_get`** on the Robin agent to
> see what the config payload actually exposes — specifically whether Data Collection fields can be
> written, which is unconfirmed. If yes: use `agents_duplicate` to clone Robin into a survey-test
> agent so the live agent stays untouched, put the survey prompt + 8 fields on the clone
> (`elevenlabs-experiment-setup.md` §2 and §7), and test through the web widget. If field creation is
> not exposed, set the prompt and add the fields by hand.
>
> **Start here (2) — get the code to production.** Nothing records until `claude/robin-survey` is
> deployed. Merge it or open the PR; it carries 11 commits, so if only the survey is wanted, rebase
> the two survey commits onto `main` on a clean branch instead.
>
> Then: fix the `plan_id` bug in the dashboard's gap request (2 lines, currently guarantees gap
> closure matches nothing), run `kb_probe`, and start the TCPA conversation — it has the longest lead
> time and the outbound dialer waits on it, while the consented population only accumulates once the
> survey is live.

---

### 2026-07-23 — Session 2

**Time spent:** ~1 session
**Status after session:** on track

**What we did:**
- Loaded **50 synthetic members** into Supabase (member_id + synthetic DOB + synthetic balances;
  varied vesting/loans/consent; zero real PII).
- Built the **broker** (`broker/`): dependency-free Vercel functions `verify_caller`,
  `get_balance`, `postcall` (HMAC-verified webhook → idempotent `ai_call_events`), with tolerant
  spoken member-id/DOB parsing (unit-tested).
- Ingested the **INTRUST enrollment packet** → 3 RAG KB docs + 25 curated questions (seeded).
- Built the **grader** (`grader/`): deterministic security scan + **claude-opus-4-8** LLM judge
  (structured output) grading quality vs. ideal answers, sentiment, and security; writes
  `call_question_scores` + call-level verdict. Added migrations 005 (security_flag/detail) + 006
  (scored_at).
- Dashboard reached its final **reductive (Rams/Vignelli)** design with by-question/by-category
  grouping + per-question answer drill-down (`dashboard/`, sample data).

**What broke / surprised us:**
- Enrollment packet reveals the real INTRUST login uses SSN — reinforced Robin's hard no-SSN rule.
- Loan limits absent from the packet → grader flags invented limits as `wrong`.

**Decisions made:**
- Judge model is stronger than Robin (Opus 4.8 vs Haiku); grade vs. stored ideal answers.
- Security is deterministic-first and hard-fails the Security verdict.

**Next session:**
> DONE since: broker **deployed & live** at `https://voiceagents-seven.vercel.app` (verify_caller +
> get_balance verified working against Supabase); **ElevenLabs setup guide written**
> (`elevenlabs-experiment-setup.md`) with the real broker URL baked in.
> NEW TODO (Tanner's ask): a **boss-facing Q&A test artifact** (Phase 1) — paste ~25 questions,
> LLM RAGs the KB (3 docs, small enough to stuff), outputs Q+A readably, each with a "resend" button
> for answer-variation testing. Likely a broker `/api/ask` endpoint + a static artifact frontend.
> Remaining: (1) ~~deploy broker~~ ✅; (2) **configure ElevenLabs** for the experiment
> (system prompt for member_id+DOB verify + no-SSN rule + INTRUST plan, upload 3 KB docs, point
> verify_caller/get_balance webhook tools at the broker, post-call webhook → /api/postcall, add
> Data Collection fields) — I write the paste-ready guide; (3) **wire the dashboard to live
> Supabase** (read-only view + publishable key); (4) run the **grader calibration** set once real
> transcripts exist; (5) generate **tester credential cards** (last). Confirm verdict thresholds.

### 2026-07-23 — Session 1

**Time spent:** ~1 session
**Status after session:** on track

**What we did:**
- Scoped the experiment (`SCOPE.md`) and locked decisions: synthetic balances, opt-in tester
  consent, verify by **Member ID + DOB** (no SSN), dedicated Supabase project.
- Provisioned Supabase **`robin-experiment`** (ref `rlhybqslnqhggbykjrqg`, us-east-2, ~$10/mo) and
  applied 4 migrations: `members`, `ai_call_events`, `curated_questions`, `call_question_scores`
  (RLS on, service-role-only). Mirrored in `supabase/migrations/`.
- Turned the 2025 INTRUST enrollment packet into **3 RAG-ready KB docs** (`kb/`) and the
  **25-question eval set** (`curated-questions.md`), seeded into `curated_questions`.
- Built the **experiment dashboard** through 3 design passes → reductive (Rams/Vignelli) verdict-first
  monitor with by-question/by-category grouping and per-question answer drill-down
  (`dashboard/robin-dashboard.html`, sample data).
- Agreed the **grading design** (see `SPEC.md`): async LLM-judge graded vs. ground-truth ideal
  answers, transcript sentiment, deterministic-first security checks, calibration + human review.
- Wrote **`SPEC.md`** capturing the full system.

**What broke / surprised us:**
- The enrollment packet reveals the **real INTRUST login uses SSN as User ID + last-4 as password**.
  Reinforced the hard rule: Robin verifies on Member ID + DOB and must never ask for/echo an SSN.
- The packet gives a **$100 loan fee but no loan limits/terms** → Robin must route loan specifics to
  a specialist, not invent them (the grader flags invented facts as `wrong`).
- Local PDF tooling was broken (`cryptography`/poppler); used **PyMuPDF** to extract the packet text.

**Decisions made:**
- Verify on synthetic Member ID + DOB — verification DB holds **zero real PII**.
- Grade quality **against the stored `ideal_answer`**, not open-ended; judge model stronger than Robin.
- **Security flag hard-fails the experiment Security verdict** (compliance event, not per-call).
- KB = the guide (Robin reasons/RAGs); the 25 Q&A = the eval set/yardstick.

**Next session:**
> Build the **broker tools against Supabase**: (1) generate 50 synthetic `members` rows + printable
> tester credential cards (member_id + synthetic DOB + synthetic balance) and load them; (2) write
> `verify_caller { member_id, dob }` and `get_balance { subject_ref }` as Vercel functions hitting
> Supabase (service key in env), reusing the mock-backend pattern; (3) the `postcall` webhook
> receiver that writes `ai_call_events`. Then draft the grader prompt + JSON schema and run the
> calibration set once real transcripts exist. Confirm the success thresholds for the verdict tiles.
