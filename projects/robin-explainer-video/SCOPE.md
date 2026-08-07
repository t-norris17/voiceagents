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

## Open decisions (need Tanner)

- [ ] **Branding.** Is this INTRUST-branded, NestEgg U-branded, or unbranded? The KB carries real
      INTRUST plan content but the demo brand is NestEgg U. Recommend: **unbranded** ("the plan,"
      "the recordkeeper") so the same video works for any audience, with a branded title card only.
- [ ] **Where it plays.** Boardroom/email link (16:9) vs. internal social (9:16). Recommend 16:9,
      cut a 9:16 later from the same stills.
- [ ] **Narrator.** Voice-only over motion stills (recommended), or an on-screen ElevenCreative
      avatar presenter. Avatar adds a face but costs consistency across 8 scenes.
- [ ] **Does it need compliance review before it leaves the building?** Recommend yes, once, before
      first external send — it depicts a financial-services member interaction.
- [ ] **The number.** Scene 2 can carry the password-reset business case (3,136 calls, 3% self-serve,
      55% callback) or stay qualitative. Confirm those figures are shareable outside the team.

---

*Scope locked: pending the five decisions above*
