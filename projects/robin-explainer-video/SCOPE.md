# SCOPE — Robin Explainer Video

**Slug:** robin-explainer-video
**Status:** draft
**Created:** 2026-08-07
**Effort:** M
**Owner:** Tanner

> A ~3-minute explainer that shows how the Robin system fits together, built in **ElevenCreative**.
> Audience: non-technical stakeholders (leadership, business owners, compliance, plan sponsors) who
> don't want the nuts and bolts — they want to see the puzzle.

---

## Problem

Robin is now four moving parts — source content, the Knowledge Factory, the agent's instructions,
and the grading dashboard that feeds gaps back — and no one outside the build can see how they
connect. Every explanation so far has been a live walkthrough by Tanner, which doesn't scale, doesn't
travel, and lands differently every time. Non-technical audiences hear "voice AI" and picture either
magic or a chatbot; neither is what this is.

## Solution

A single ~3-minute narrated explainer with one controlling metaphor — **a library and the workshop
that stocks it** — that walks the loop end to end: a member's question at 9pm → where answers live
today → the factory that turns documents into clean cards → the instructions that make Robin behave
→ the call getting answered → the report card → the gaps going back to the factory → the shelf
growing. Deliverables in this folder: talk track, storyboard/image direction, and copy-paste
ElevenCreative prompts.

## Success criteria

- [ ] A non-technical viewer can, unprompted, describe the loop back in one sentence ("documents get
      cleaned up into cards, Robin only answers from the cards, and the calls she flubs turn into
      the next batch of cards").
- [ ] Runs **3:00–3:30** and needs no live narrator — it can be sent as a link.
- [ ] Nothing in it over-claims: what's live reads as live, what's planned reads as planned.
- [ ] Zero real member data, zero real PII, no real account screens in any frame.

## Why now

The experiment, the factory, and the publish pipeline all landed within weeks of each other. This is
the first moment the story is actually a *loop* rather than a pile of parts — and the audience for
the next decision (wider rollout, more plans) is exactly the audience that has never seen it work.

## Constraints

- **Regulated financial services.** Synthetic only. No real member PII, no real balances, no real
  account screens. If a "member" appears on screen, they're an illustration, not a person.
- **Do not over-claim.** Today = one plan, one topic area, ~50 internal testers, answer-only. The
  video says that out loud (Scene 8) rather than implying a launched product.
- **Fisher-Price depth.** No architecture diagrams, no vendor names on screen, no mention of
  Supabase / Vercel / RAG / embeddings. One metaphor, held all the way through.
- **Style ban:** no robots, no glowing brains, no blue circuit boards, no binary rain. Warm, tactile,
  paper-and-wood. See `storyboard.md`.

## Non-goals

- Not a product demo — no screen recording of the real dashboard or console (that's a separate,
  shorter "here's the actual thing" clip if it's wanted).
- Not a sales video and not a compliance deck.
- Not a technical explainer — the how of retrieval, grading, or publishing is deliberately out.
- Not a live-call recording — the call in Scene 5 is illustrated, not captured.

## Locked decisions (2026-08-07)

1. **Unbranded.** "The plan," "the recordkeeper." No employer or product name in the narration; a
   branded title card at the top is the only place a logo appears. The same video works for any
   audience without a re-cut, and real INTRUST plan content stays out of frame.
2. **16:9, sent as a link.** ~3:10, boardroom and email. A 9:16 cut can come later from the same
   stills if it's ever wanted.
3. **Voice only, over motion stills.** No on-screen presenter and no avatar — consistent with the
   storyboard's hands-only, never-faces rule, and it keeps eight scenes visually coherent.
4. **Topic = plan questions and general plan information.** How the match works, whether you can take
   a loan, what happens if you leave. **Password reset and account access are explicitly out** —
   that isn't the path being taken first, so the video must not imply it is. No call-volume or
   deflection figures; Scene 2 stays qualitative.
5. **Internal only — no compliance review gate.** Treated as internal explainer material. **If this
   ever goes to a plan sponsor, a member, or anyone outside the team, revisit this first** — it
   depicts a financial-services member interaction.
6. **One version first.** Build the 3:00–3:30 cut and prove it before cutting anything shorter. A
   ~90-second version (scenes 1, 3, 4, 7) needs no new generation, so it stays cheap to add later.
7. **The transcript demand miner folds into Scene 7** rather than getting its own beat. "People keep
   asking this, and we have nothing for it" already carries it, and one loop is the whole point for a
   non-technical viewer.

---

*Scope locked: 2026-08-07*
