# VOICEOVER PROMPT — Robin Explainer

Paste-ready narration for ElevenLabs. Generate **one file per scene** (eight files) so a single bad
read costs you one re-roll instead of the whole track.

> **Verification note.** elevenlabs.io is blocked from the build sandbox, so slider names, model
> names, and whether inline delivery tags are supported could not be checked against live docs.
> `docs/elevenlabs-reference.md` covers the Conversational AI voice settings only, and those are
> tuned for **low latency on a call** — the opposite of what narration wants. Treat the settings
> below as a starting point and confirm in-product.

---

## Step 1 — The voice

**Do not use Robin's voice.** If the narrator sounds like the agent, the video reads as Robin
explaining herself, which quietly undercuts the point that a human wrote her instructions and a human
approves her content. Robin is a warm American female — so **make the narrator contrast clearly**,
most simply by going lower in register.

**Voice Design prompt** (if you're generating a custom voice from a description):

```
A warm, grounded American narrator, mid-to-low register, forties. Relaxed and unhurried, with a
natural conversational rhythm and audible soft breath between thoughts. Sounds like a knowledgeable
colleague explaining something across a kitchen table — thoughtful, plain-spoken, quietly confident.
Not an announcer, not a documentary voice, not upbeat corporate, no sales energy. Clear diction,
minimal vocal fry, no vocal smile. Dry studio recording, close mic, no room reverb.
```

**Or A/B two stock voices** and pick by ear on Scene 4 — it's the hardest read in the script and the
most exposed, so whichever voice survives Scene 4 will carry the rest.

**Settings starting point (narration, not conversation):**

| Setting | Value | Why |
|---|---|---|
| Stability | **70–80%** | High. Eight separate files have to sound like one session — this is the setting that gets you that. |
| Similarity | 75–85% | Keeps the voice identity steady across files. |
| Style / exaggeration | **0–15%** | Low. Style is what makes explainer VO sound like an ad. |
| Speed | slightly **below** default | Explainer VO almost always wants slowing down. |
| Model | **highest quality available** | Latency is irrelevant here. Do **not** use Flash/Turbo — that guidance in the reference doc is for live calls. |

---

## Step 2 — The script blocks

Paste each block exactly as written. Three things are deliberate:

- **Numbers are spelled the way they should sound** (`four-oh-one-k`, `twenty nineteen`). Digits and
  parentheses get read unpredictably.
- **Line breaks are the pacing.** Each blank line is a beat. Don't collapse them.
- **No bracketed stage directions inside the blocks.** Many models read `[pause]` and `[warmly]`
  aloud. Control delivery with punctuation, breaks, and the stability slider instead. If you confirm
  the model supports inline audio tags, you can add them — but generate a clean version first.

### Scene 1
```
It's nine at night.

Someone who's been paying into their retirement plan for eleven years has a question. Can I borrow against my four-oh-one-k?

The answer exists. It's written down. It's in a plan document, somewhere.

But the office is closed. So the answer doesn't come out until Monday.
```

### Scene 2
```
Today, the answers live where answers have always lived.

A twenty-five page enrollment packet. A folder of plan documents. A help article somebody wrote in twenty nineteen. And a person on the phone who knows which one to look in.

None of that is wrong. It's all accurate, and it's all there.

It's just not in a shape anyone can get to at nine at night.
```

### Scene 3
```
So the first thing we built was a factory.

Raw documents go in one end. Long, dense, full of fee tables and fine print and see the section above.

And out the other end comes something much smaller. One clean card, per question, written the way a person would actually ask it. Plain language. Short enough to say out loud.

Two rules on that factory floor. And they matter more than anything else in this video.

Nothing gets invented. If the source document doesn't say it, the card doesn't say it. The card says, we don't cover that, talk to a specialist.

Nothing gets on the shelf until a person says yes. Every card is read and approved by a human, before it goes anywhere near a phone call.
```

### Scene 4
```
Then we hired Robin.

Robin is the voice that answers the phone. But the voice isn't what makes her Robin. Her instructions are.

Think of it as a job description we hand her at the start of every single call.

Say your name. And say you're not a person.

Find out who you're talking to, before you say one word about their account.

Never ask anyone for a Social Security number.

Answer only from what's on the shelf.

And if you don't know. Say so. And hand the call to a human.

She follows it exactly. On every call. At nine at night, the same as nine in the morning.
```
> The five instructions are a **list**. If the read runs them together, generate the five lines as
> their own file and drop it into the middle — that's cheaper than fighting one long take.

### Scene 5
```
So the question at nine at night gets an answer.

In about ninety seconds. From something that read the plan document, so nobody else has to.
```

### Scene 6
```
Now here's the part that makes it get better.

Every call Robin takes gets written down, and graded. Not on a feeling. Every answer is scored against what the right answer should have been.

Was it accurate. Was it complete. Did the caller sound satisfied. Did she follow her rules.

It all lands on one screen. So you can see how Robin is doing, the same way you'd see how any new hire is doing.
```
> The four questions are written as statements on purpose. If the read puts a rising question
> inflection on them, it sounds like an ad. Flat and declarative is right.

### Scene 7
```
And the most useful thing on that screen isn't the good grades.

It's the questions she couldn't answer.

Every one of those becomes an order slip that goes straight back to the factory. People keep asking this. We have nothing for it.

Somebody writes the card. Somebody approves it. It goes on the shelf.

And the next person who asks that question gets an answer.
```
> *"It's the questions she couldn't answer"* is the turn of the whole video. If the take doesn't slow
> down and drop slightly there, re-roll this scene — it's the one line worth spending re-rolls on.

### Scene 8
```
That's the whole machine. Content in. Calls out. Gaps back. Shelf grows.

Today it's one plan, one set of topics, and a small group of testers. It's built this way because of what's next. A hundred and fifty plans, each with its own shelf, all running the same loop.

The point was never that Robin knows everything.

It's that she knows what she doesn't know, she says so, and she gets less wrong every week.
```
> The last line has to land and stop. If it lifts at the end, re-roll.

---

## Step 3 — After generation

1. **Listen to all eight back to back before cutting anything.** Tone drift between files is the
   failure mode here, and it's invisible when you audition scenes one at a time.
2. If one file sits differently from the rest, **re-roll it rather than EQ it** — same seed voice,
   same settings, new generation.
3. **Cut picture to the VO**, not the reverse. The timings in `talk-track.md` are estimates; the
   generated read is the truth.
4. Normalize all eight to the same loudness before the music goes under.
