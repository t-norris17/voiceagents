# SCOPE — Vertex Manufacturing Demo Site (multi-channel Robin)

**Slug:** vertex-demo-site
**Status:** active
**Created:** 2026-09-30
**Effort:** M
**Owner:** Tanner

---

## Problem

Robin is proven on one channel: a phone call. Leadership's next question is whether members can reach
her the way they prefer (typing, talking in a browser, texting) with the same accuracy, and what
happens when Robin cannot finish the job. Nothing today lets us test the non-phone channels in a
believable member context, and the Robin portal is a set of separate tools rather than one
workspace with a place for escalated requests to land.

## Solution

A fictional employer site, **Vertex Manufacturing**, whose 401(k) plan is the plan already loaded in
Robin's Knowledge Base. The Robin widget sits on every page and offers typing and browser voice from
one launcher. It talks to a **duplicate** agent, `Robin (web demo)`, with prompt, procedures, tools
and KB identical to live Robin, so demo traffic stays out of the tester-wave metrics and any
difference in behavior is the channel, not the config. A tester guide page holds the synthetic
personas and a parity script.

## Success criteria

- [ ] A visitor on the deployed site can start a typed conversation and a voice conversation from the widget with no setup.
- [ ] Ten paired questions asked in chat and in voice are graded for accuracy and completeness, and the gap (if any) is written down with conversation ids.
- [ ] We know, from a real conversation, whether the ElevenLabs post-call webhook fires for text-only chats (this decides how chat escalation reaches a Rangly-style inbox).
- [ ] The prove-it list has a written answer for chat parity and chat escalation, and a scoped plan for SMS and the portal redesign.

## Why now

The tester wave is running and leadership wants to know if Robin scales past the phone before
committing to a channel strategy. Chat is the cheapest channel to prove; it is a page and an embed.

## Constraints

- Synthetic data only. Personas come from `robin-experiment/demo` (member ids 90001 to 90003).
- The live tester line and the live agent are not touched. All agent changes land on the duplicate.
- Robin does not disclose she is a virtual assistant. Settled 2026-09-10; not a defect here.
- The site is fictional and says so in the footer. No real company, person or plan data.
- No SMS in this pass (pinned by Tanner 2026-09-30).

## Non-goals

- Not: SMS. Pinned until a number and carrier registration are sorted.
- Not: the chat-escalation inbox or the agent command center. Those are the next two prove-it items; this pass only finds out what the channel can do.
- Not: a real plan-information site. The benefits page names topics and defers every plan fact to Robin so the site cannot contradict the KB.
- Not: authenticated member experience or a real portal.

## Open questions

- [ ] Does the post-call webhook fire for text-only widget conversations? (First real test.)
- [ ] Does the agent allowlist accept wildcard hosts, or do we need one stable production hostname?
- [ ] Account Recovery still says "last 4 of SSN + DOB" while the call cards say Robin verifies on Member ID + DOB. Which is live in practice?

---

*Scope locked: 2026-09-30 (design approved by Tanner in chat; duplicate agent and SMS pin confirmed)*
