# ELEVENCREATIVE PROMPTS — Robin Explainer

Copy-paste prompts for ElevenCreative. Work top to bottom: style anchor first, then stills, then the
three motion shots, then the voiceover.

**Locked settings (2026-08-07):** **16:9** on every generation — set it once and don't mix, since
re-framing a 9:16 still into a widescreen edit costs you the composition. **Voice only, no avatar,
no on-screen presenter.** **Unbranded** — no logos, no product names, and no readable text in any
generated frame.

> **Verification note.** `docs/elevenlabs-reference.md` covers Conversational AI, not ElevenCreative,
> and elevenlabs.io is blocked from this sandbox, so I could not read the ElevenCreative docs
> directly. What's confirmed from search results: the Playground takes a **text prompt plus optional
> reference images, video clips, or audio**; you pick a model, generate, then **refine iteratively,
> upscale, and lip-sync**; **Seedance 2.0** is the most capable model and handles multimodal input
> with synchronized audio in one pass. **Not verified:** max clip length, aspect-ratio options, exact
> model list. Check those in the product before you plan the edit around them —
> `https://elevenlabs.io/docs/eleven-creative/playground/image-video`.

---

## Step 1 — The style anchor (generate this first)

Generate this as a **still**. Re-roll until the palette and texture are exactly what you want. Then
use the winner as a **reference image on every subsequent prompt** — that single move is what makes
eight scenes look like one video.

```
A tabletop paper-craft miniature scene, shot from a low three-quarter angle. A small handmade wooden
machine sits on a warm walnut desk: a stack of dense printed documents feeds into one side, and clean
cream index cards emerge from the other into a neat stack. A small bin of paper offcuts beside it.
Materials look real and handmade — textured card stock, matte wood grain, visible paper fibers.
Palette: warm paper white, kraft tan, walnut brown, with a single soft amber light source from the
upper left casting long soft shadows. Shallow depth of field, macro lens feel, gentle film grain.
Stop-motion miniature aesthetic. No text, no lettering, no signage, no people, no faces.
Photorealistic but obviously miniature and handmade.
```

**Negative / avoid list** (paste into a negative-prompt field if there is one, otherwise append as a
sentence): `robots, humanoid figures, faces, glowing brains, circuit boards, binary code, neural
network diagrams, holograms, floating UI panels, blue neon, lens flare, HUD overlays, readable text,
logos, watermarks`

---

## Step 2 — Stills (attach the style anchor as reference on every one)

Prefix each with: `Same tabletop paper-craft miniature style, same warm amber lighting and walnut/
kraft palette as the reference image.`

### Scene 1 — The question
```
A dark home kitchen at night, miniature paper-craft style. A single warm lamp glows over a counter.
On the counter: a smartphone lying face-up and dark, a ceramic mug, and an unopened envelope. A wall
clock in soft focus behind. No people, no faces, no readable text. Quiet, still, slightly lonely.
Deep shadows, one warm light source, shallow depth of field.
```

### Scene 2 — Where the answers live today
```
Overhead flat-lay of a tidy wooden desk, miniature paper-craft style. A thick spiral-bound booklet
with colored tab dividers, a fanned manila folder of documents, a single printed sheet with a faint
coffee ring, and a small square sticky note. Everything is neat, well-kept, and carefully organized —
not messy. Warm overhead light, soft shadows, kraft and cream palette. No readable text, no letter
forms on any page — pages are blank textured paper. No people.
```

### Scene 2b — The office closes
```
A small desk lamp on an empty wooden desk, miniature paper-craft style, the lamp switched off and the
room falling into cool shadow. A stack of documents sits untouched beside it. One faint window light
from the far side. Melancholy, quiet, end-of-day. No people, no text.
```

### Scene 3b — The human approval stamp *(the trust shot)*
```
Extreme close-up, miniature paper-craft style. A human hand holding a wooden rubber stamp, pressing
down onto a single cream index card lying on a walnut desk. Beside it, a second index card with one
corner deliberately left blank and a small kraft paper tag attached to it. Warm amber light from the
upper left, strong soft shadow under the hand. Only the hand is visible — no face, no body. Tactile,
deliberate, craftsmanlike. No readable text on the cards.
```

### Scene 4 — Robin's instructions *(the screenshot shot)*
```
A warm desk workspace, miniature paper-craft style, shot straight on. A softly glowing amber desk
lamp and a vintage telephone handset on a walnut desk. Pinned to the plain wall directly above them,
a single cream index card with five evenly spaced blank ruled lines — deliberately empty, no writing.
The lamp is the only light source, glowing warm and steady. Calm, orderly, purposeful. No people, no
faces, no readable text.
```
> Leave the card blank on purpose. The five instruction lines type on in the edit, in sync with the VO.

### Scene 6 — The report card wall
```
A corkboard wall filled with a neat grid of small cream index cards, miniature paper-craft style,
shot straight on. Most cards carry a small green check mark, a few carry a small amber mark, one or
two carry a small red mark. The marks are simple hand-drawn shapes, not text. Even warm lighting,
soft shadows behind each card. Orderly, legible at a glance. No readable words, no people.
```

### Scene 8 — The whole machine
```
A wide overhead view of a miniature paper-craft tabletop world arranged in a circle: a stack of
documents, a small wooden machine, a shelf of index cards, a glowing amber desk lamp with a telephone,
and a corkboard of small marked cards — connected in a ring by soft raised paper arrows. Behind it,
the same circular arrangement repeats three more times into soft focus, receding into the distance.
Warm amber key light, kraft and walnut palette, tilt-shift miniature depth of field. No text, no
people, no faces.
```

---

## Step 3 — Motion shots (generate as video; Seedance 2.0 or best available)

Only these three shots need real motion. Attach the style anchor as a reference image on each.

### Scene 3 — The conveyor
```
Locked-off macro shot of a handmade wooden tabletop machine in a paper-craft miniature style. Dense
printed documents feed slowly into the left side; clean cream index cards emerge one at a time from
the right and stack neatly. Small paper offcuts drop into a bin below. Steady, rhythmic, satisfying
mechanical motion. Warm amber light from the upper left, soft shadows, shallow depth of field, gentle
film grain, stop-motion feel. Camera does not move. No text, no people, no faces.
```

### Scene 5 — The call connects
```
Slow overhead push-in on a paper-craft miniature tabletop. On the left, a small dark house; on the
right, a walnut desk with a glowing amber lamp and a telephone. A single thin warm line of light draws
smoothly across the surface from the desk to the house, completes, and pulses once — and the house's
window lights up warm. Everything else is still. Handmade paper textures, deep soft shadows, tilt-shift
miniature depth of field. No text, no people, no faces.
```

### Scene 7 — The loop closes *(the most important motion in the video)*
```
Paper-craft miniature tabletop, wide shot. Small marked index cards lift off a corkboard grid, fold
into little kraft paper order slips, and travel along a soft dusty-teal ribbon back into a handmade
wooden machine on the left. The machine runs briefly; a fresh cream index card emerges, and a hand
enters frame to press a wooden stamp onto it. The card then slides onto a wooden shelf, which visibly
gains one more card. Continuous circular motion, left to right and back again. Warm amber key light
with a single cool teal accent on the ribbon only. Stop-motion feel, handmade textures. No text, no
faces.
```

---

## Step 4 — Voiceover

Narration script: `talk-track.md`. Generate it in one pass per scene (eight files) so you can re-roll
a single scene without redoing the whole read.

**Voice direction:** warm, measured, unhurried. A knowledgeable colleague explaining something over
coffee — not an ad, not a documentary, not upbeat corporate. Lower energy than feels right; explainer
VO almost always wants slowing down.

**Not Robin's voice.** Use a different voice from the agent's. If the narrator sounds like Robin, the
video reads as Robin explaining herself, which quietly undercuts the whole "she follows instructions
a human wrote" point.

**Delivery notes to apply:**
- Full stop on every period. The script is written in short sentences on purpose.
- Scene 4's five instruction lines: read as a **list**, with a real beat between each.
- Scene 7's *"It's the questions she couldn't answer"* is the turn of the whole video — slow down and
  drop pitch slightly.
- Scene 8's last line lands and stops. No upward inflection.

**Music:** sparse, warm, minimal — felt piano or muted marimba, no drums until Scene 3's conveyor,
drop out entirely under Scene 4, return for Scene 7's loop. Duck it 6–8 dB under the VO throughout.

---

## Assembly order

1. Generate + lock the **style anchor**.
2. Generate the **VO** (all 8 scenes).
3. Generate the **stills**, referencing the anchor.
4. Generate the **3 motion shots**.
5. Cut picture **to the VO**, not the reverse.
6. Add all on-screen text in the edit (table at the bottom of `talk-track.md`). Never generate text.
7. Watch it once with the sound off. If the loop in Scene 7 doesn't read as a circle without
   narration, re-roll that shot before anything else.
