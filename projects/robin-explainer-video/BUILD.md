# BUILD LOG — Robin Explainer Video

**Slug:** robin-explainer-video
**Started:** 2026-08-07
**Status:** active

---

## Session log

<!-- Add new sessions at the top, newest first -->

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
