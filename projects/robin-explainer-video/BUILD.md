# BUILD LOG — Robin Explainer Video

**Slug:** robin-explainer-video
**Started:** 2026-08-07
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

---

### 2026-08-07 — Session 3

**Status after session:** motion prompts rewritten; ready to re-generate

**What we did:**
- Scene 7 wouldn't generate. Root cause: the prompt chained **seven sequential beats** in one clip.
  Rewrote it as three one-motion clips (**Loop A/B/C**) plus a push-in on the existing Scene 3b stamp
  still, assembled into a loop in the edit.
- Same flaw found and fixed preemptively in **Scene 3** (three simultaneous motions → Conveyor A/B)
  and **Scene 5** (four beats plus a camera move → Call A/B).
- Added a **"Rules that make these actually generate"** block to `elevencreative-prompts.md`: one
  motion per clip, describe the opening frame then the single change, state what stays still, never
  ask for a transformation, never ask it to count, one explicit camera instruction, direction beats
  action, generate short and cut.
- Renamed the motion clips (Conveyor/Call/Loop A-B-C) so they stop colliding with the Scene 3b still.

**What broke / surprised us:**
- The single biggest fix was narrative, not technical: **follow one card, not many.** A single marked
  card leaving the wall and returning reads as a loop far better than a swarm — and it's renderable.
- Hands in motion are the fastest way to break these models. The stamp beat stays a still.

**Decisions made:**
- The loop is built in the **edit**, not in one generation. Three clips + one still, cut on the motion.
- Fallback for Loop A if it keeps failing: animate only the ribbon (one object, one direction).

**Next session:**
> Re-generate Loop A/B/C, Conveyor A/B, Call A/B against the new prompts and log which ones still
> needed re-rolls. If a shot resists after three attempts, split it further rather than re-seeding.

---

### 2026-08-07 — Session 2

**Time spent:** short
**Status after session:** scope locked — ready to generate

**What we did:**
- Walked the open decisions with Tanner and locked all seven in `SCOPE.md`.
- Removed the password-reset business-case swap from `talk-track.md` and added an explicit topic
  guard (plan questions + general plan information only).
- Added the locked format settings (16:9, VO-only, unbranded) to `talk-track.md` and
  `elevencreative-prompts.md`, plus a note to use a **different voice from Robin's** for the narrator.

**What broke / surprised us:**
- The password-reset framing is legacy from `nestegg-u-demo` and is **not** the path being taken
  first. Anything reused from that project's story needs the same check — the current story is plan
  questions and general information, and Scene 1's loan question was already the right example.

**Decisions made:**
- See the seven locked decisions in `SCOPE.md`. Notable: internal-only with **no compliance gate**,
  which is fine as long as the video stays inside the team — flagged in SCOPE for the day it doesn't.

**Next session:**
> Generate the **style anchor** still (Step 1 of `elevencreative-prompts.md`) and lock it before
> anything else — every other prompt references it. Then VO, then stills, then the three motion
> shots. Log which prompts needed re-rolling so the prompt file improves rather than being rewritten.
> While you're in ElevenCreative, capture what's actually true about **max clip length, aspect-ratio
> options, and the model list** and add an ElevenCreative section to `docs/elevenlabs-reference.md` —
> those three are unverified here because elevenlabs.io is blocked from the build sandbox.

---

### 2026-08-07 — Session 1

**Time spent:** ~1 session
**Status after session:** on track (all three asked-for artifacts drafted; needs 5 decisions + generation)

**What we did:**
- Read across the four Robin projects (`content-cleaner`, `robin-experiment`, `robin-kb-pipeline`,
  `transcript-demand-miner`) to get the real loop rather than the assumed one.
- Wrote `SCOPE.md`, `talk-track.md` (8 scenes, ~3:10), `storyboard.md` (metaphor + style bible +
  shot list), `elevencreative-prompts.md` (style anchor → stills → 3 motion shots → VO).
- Settled on **library + workshop** as the single controlling metaphor, and on **never
  anthropomorphizing Robin** (lamp + phone + job card, no robot, no face).

**What broke / surprised us:**
- `elevenlabs.io` is blocked by the sandbox egress proxy, so the ElevenCreative docs could not be
  read directly. Prompts are written against what search results confirm (text prompt + reference
  images/video/audio, iterate/upscale/lip-sync, Seedance 2.0 multimodal). **Max clip length,
  aspect-ratio options, and the full model list are unverified** — confirm in-product before
  planning the edit around them.
- The user's four-part outline was missing the trust half of the story: verification, the no-SSN
  rule, the human approval gate, and the escalation-to-a-human path. For a regulated-services
  audience those are the first questions asked, so they became Scene 3b and Scene 4.

**Decisions made:**
- Robin is depicted as a lamp, a phone, and a handwritten job card — never a robot or avatar.
- The system prompt is called **"her instructions"** on screen and in the VO; the word "prompt"
  never appears.
- Scene 8 states the real state of play (one plan, ~50 testers, answer-only) rather than implying a
  launched product.
- Illustrate the dashboard; do not screen-record the real one.
- Production approach: stills + motion in the edit, with true video generation reserved for the
  three shots where motion carries meaning (conveyor, call connecting, loop closing).

**Next session:**
> Tanner to answer the **five open decisions** in `SCOPE.md` — branding (recommend unbranded),
> aspect ratio (recommend 16:9), narrator style (recommend VO-only over motion stills), whether
> compliance reviews it before first external send (recommend yes), and whether the password-reset
> figures (3,136 / 3% / 55%) are shareable outside the team. Then: generate the **style anchor**
> still first and lock it before anything else — every other prompt references it. After the first
> generation pass, log which prompts needed re-rolling so the prompt file gets better rather than
> being rewritten from scratch next time.
>
> Also still open: whether to cut a **90-second version** (scenes 1, 3, 4, 7 only) for people who
> won't watch three minutes, and whether the **transcript demand miner** earns its own beat or stays
> folded into Scene 7's "people keep asking this."
