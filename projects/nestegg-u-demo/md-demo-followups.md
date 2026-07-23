# MD demo — follow-up answers

Answers to the three questions the MD raised after the Robin demo (Jul 7, 2026). Written to be
read out loud in a follow-up conversation, with the technical backing behind each. Deeper detail
lives in [`phase2/PROGRAM-SPEC.md`](./phase2/PROGRAM-SPEC.md) and
[`phase2/multi-tenant-plan-qa.md`](./phase2/multi-tenant-plan-qa.md).

---

## 1. Does Relius have an API we can hook up to ElevenLabs to authenticate against the client database?

**Short answer: yes, integration is possible — but it's a contracted FIS engagement, not a public
self-serve API, and for *auth* we should almost certainly sync a minimal verification store rather
than call Relius live on every call.**

**What Relius actually offers.** Relius Administration (FIS, formerly SunGard) is the recordkeeping
/ admin system of record. FIS supports three integration paths into it: **API connection**,
**endpoint connection**, and **batch file via SFTP**. Third parties already integrate this way —
e.g. Finch pulls payroll/census *into* Relius. FIS is also rolling out a **new cloud recordkeeping
platform (announced for July 2026) that is explicitly API-first** and built to let clients grant
third-party apps controlled access to plan data. So the capability exists; what does **not** exist
is a public developer portal you can wire up over a weekend — it goes through FIS, with a contract
and their integration team.

**The architecture nuance that matters for auth.** Robin needs a **synchronous, low-latency,
mid-call** lookup ("do DOB + last-4 match a participant, and is there an email on file?"). Two ways
to get that:

| Option | How | Trade-off |
|---|---|---|
| **A — Live call to Relius** | Robin's `verify_caller` tool hits a real-time FIS/Relius participant-lookup endpoint | Cleanest *if* FIS exposes a synchronous verify endpoint with a tight SLA. Depends on their API, adds their latency to every call, and hits the system of record on every attempt. |
| **B — Verification read-model (recommended v1)** | Nightly / near-real-time sync (SFTP census or API) of **only the fields needed to verify** into our own store; Robin queries that | Fast, resilient, vendor-portable, and lets us **minimize PII** — we store a *salted hash* of the SSN-last-4, DOB, an `email_on_file` flag/address, and `plan_id`. Never the raw SSN. |

**Recommendation:** default to **Option B**. It's better for latency, better for data
minimization (a compliance win), and it decouples the demo-to-production path from FIS's API
timeline. Revisit Option A only if FIS confirms a real-time verify endpoint we're comfortable
putting in the call path.

**Action to take:** ask FIS/our Relius account team two specific questions — (1) *is there a
synchronous participant-lookup / verification endpoint, and what's its SLA?* and (2) *what's the
supported extract (SFTP census or API) for a nightly identity sync?* Those two answers pick A vs B.

---

## 2. How does this fit our stack (Talkdesk)? Where does it plug in — before, middle, instead of, alongside?

**Alongside and in the middle — not instead of.** Talkdesk stays the front door and the
switchboard. Robin is a new **self-service tier that sits between the IVR and your live agents.**

```
Caller ──PSTN──▶ Talkdesk  (1-800 · IVR/Navigator intent routing · recording · human queues · SIP trunk)
                   │
                   ├─ AI-eligible topic ──SIP──▶  ROBIN (ElevenLabs)
                   │                                • verify_caller (→ Relius sync / Lumio API)
                   │                                • answers from KB via free-form procedures
                   │                                • transfer_to_number (SIP REFER) ─┐
                   └─ human-only topic ─────────▶  Talkdesk human queue ◀─────────────┘  (warm, with context)
                                                          │
Robin ──post-call webhook──▶ Lumio /api ──▶ metrics store ──▶ supervisor dashboard
```

- **Before Robin:** Talkdesk owns the 1-800 number, the "why are you calling" routing, call
  recording, and the SIP trunk. Nothing about that changes.
- **Robin's slot:** she's **one routing destination** behind Talkdesk. Talkdesk hands her the
  AI-eligible, high-volume/low-risk topics (password reset today; more later). She **deflects** the
  ones she can fully resolve and **warm-transfers everything else** — out-of-scope, low confidence,
  failed auth, or "get me a person" — back into a Talkdesk human queue *with context* (topic +
  verified-identity status + summary carried over SIP).
- **Not "instead of Talkdesk":** Talkdesk is the telephony backbone; we're not replacing it.
- **Not "instead of humans":** v1 is **answer-only, transfer-to-transact.** Robin informs and
  guides; anything that changes an account still goes to a person until compliance signs off on a
  higher-assurance model.

**The one-line version for the MD:** *"Talkdesk stays the front door and the safety net. Robin is
an intelligent self-service layer we slot in behind it — she absorbs the repetitive calls and
hands everything else to a human with the context already gathered."*

---

## 3. What are the risks of Robin? What do we need to understand and prepare for?

Grouped by type, with the mitigation we've already built or need to add. (Fuller risk table in
`phase2/PROGRAM-SPEC.md`.)

### A. Compliance / regulatory (this is the big one — regulated financial services)
- **Auth assurance is low by design.** DOB + last-4 SSN is *knowledge-based* — anyone who has that
  data can pass. **Fine for answer-only; NOT enough to change an account.** → v1 answer-only;
  transfer to transact; step up to OTP / higher assurance before enabling any actions.
- **Recording & AI disclosure.** Must disclose recording *and* that the caller is talking to an AI;
  some states are two-party consent. → Disclosure wording is compliance-owned, added at the top of
  the call (Talkdesk or Robin's first message).
- **PII handling / data minimization.** → Store a **salted hash** of SSN-last-4, never the raw
  value; use an opaque `subject_ref` in metrics; access-controlled audit log; a defined retention
  policy.
- **Advice boundary.** Robin gives **plan education, not tax/legal/investment advice.** → Already in
  the system prompt; back it with an ElevenLabs guardrail as a second layer.

### B. Model behavior / correctness
- **Confidently wrong or over-disclosing.** We *hit this in testing* — Robin named the employer's
  plan before verifying. → Fixed with a hardened **identity gate** ("verify before anything
  specific"), **RAG-grounded answers only** (no freelancing), and **default-to-transfer** on low
  confidence. Start with a **small set of well-covered topics.**
- **Social engineering / prompt injection.** Callers will try to rush the gate ("I'm in a hurry,
  just tell me"). → Identity gate is written to **override everything, no exceptions**; guardrails
  as a monitor.
- **Silent failure / dead air.** Latency or a stalled turn reads as a dropped call. → Model choice
  (Haiku) and RAG tuning already fixed the pauses; keep monitoring.

### C. Operational / vendor
- **ElevenLabs Procedures are Alpha** — breaking changes possible. → Keep KBA answers **free-form**
  (you can't convert types later); isolate vendor config; tune triggers against real transcripts.
- **Vendor lock-in.** → We **own the metrics** (provider is a column, dashboard is ours), so we can
  swap voice vendors without losing history.
- **Telephony edge cases.** Transfers only complete on a real PSTN/SIP leg (the browser widget
  can't). → Test one live transfer before every demo; production runs on the Talkdesk SIP trunk.

### D. Reputational / caller trust
- **Frustration loops.** A caller stuck with an agent that can't help churns fast. → **Always a
  clean, fast path to a human**; cap retries; warm transfer with context so they don't repeat
  themselves.

### What we need to prepare (the checklist to bring to compliance/ops)
1. **Compliance sign-off** on: the auth-assurance model (and what Robin is allowed to *do* at each
   level), recording + AI disclosure wording, and PII retention.
2. **Lock v1 to answer-only.** No account-changing actions until higher-assurance auth is approved.
3. **Monitoring from day one:** containment/deflection rate, transfer rate + reasons, and a
   **false-answer rate** we actively watch.
4. **A kill switch / rollback** — the ability to route a topic back to 100% human instantly if
   something goes wrong.
5. **Human fallback always on** — Robin never traps a caller.

---

*All demo data is synthetic. Michael Reynolds / Dana Osborne / Vertex Manufacturing are fictional;
the only real values are the presenter's own inbox and phone, used as the demo email + transfer
target.*
