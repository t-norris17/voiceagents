# Plan Q&A — knowledge base + setup

Adds a second capability to the NestEgg U voice agent: answering **retirement-plan questions** by
reasoning over a Knowledge Base with RAG. Built around a fictional large employer, **Vertex
Manufacturing**, whose 401(k) is recordkept by NestEgg. **All content is synthetic.**

## Architecture (why it's split this way)
- **Plan rules → ElevenLabs Knowledge Base (RAG).** Same for every participant on the plan, so
  they're safe to retrieve over. Upload the four articles below.
- **A caller's own numbers → the `get_plan_details` tool.** Per-person and changing — never put a
  real balance or loan status in the shared KB. See `participant-profile.md`.

This keeps answers **grounded** (rules from the plan document) and **personal** (their figures from
the tool) without cross-contamination.

> **Demo uses ONE plan (Vertex) in the native KB — that's not the production shape.** NestEgg
> records ~150 employer plans, so the prompt stays **plan-agnostic** (it never names a plan; the
> plan comes from the caller's record). At scale, retrieval is scoped by `plan_id` through a tool,
> not a shared KB — see [`../phase2/multi-tenant-plan-qa.md`](../phase2/multi-tenant-plan-qa.md).

## Files
| File | Upload to KB? | What it is |
|---|---|---|
| `vertex-401k-overview.md` | ✅ Yes | Plan facts: eligibility, contributions, match, vesting, fees, contacts |
| `vertex-401k-loans.md` | ✅ Yes | Loan rules (answers "can I take a loan?") |
| `vertex-401k-rollovers.md` | ✅ Yes | Roll-in rules (answers "can I roll money in?") |
| `vertex-401k-leaving-employer.md` | ✅ Yes | Termination options (answers "I'm leaving") |
| `participant-profile.md` | ❌ **No** | Per-person data + the `get_plan_details` tool contract |

## ElevenLabs setup
1. **Upload the four articles** to the agent's Knowledge Base (keep the existing password-reset KBA
   too). Give each a clear title so retrieval is clean.
2. **Add a free-form procedure "Plan Questions"** — free-form so it can reference the KB — with
   triggers like *"loan against my 401k," "borrow from my 401k," "roll over," "rollover," "leaving
   the company," "quitting," "retirement plan question," "contribution," "vesting," "match."*
   Body: *only handle this **after the caller is verified**. If not yet verified, do **not** mention
   the plan, employer, or any account detail — say you can help and that you first need to verify
   them, then verify with `verify_caller`. Once verified, answer from the Vertex plan Knowledge Base;
   if the answer needs the caller's own numbers, call `get_plan_details`; if it's out of scope or
   tax/legal advice, say so and offer the participant line.*
3. **Register the `get_plan_details` tool** (webhook → the mock backend) so personal answers work.
4. **System-prompt addition** (the agent now handles two topics):

   ```
   You also answer general questions about the caller's Vertex Manufacturing 401(k) using the plan
   Knowledge Base. IDENTITY GATE: do NOT reveal, confirm, or reference any account, plan, employer,
   or balance detail — including the plan's name — until the caller is verified with verify_caller.
   If an unverified caller asks a plan question, respond generically ("I can help — first I need to
   verify your identity") and verify before saying anything specific. Once verified, answer only
   from the plan documents — do not guess. For questions that need the caller's own numbers (their
   balance, whether they have a loan, vesting), call get_plan_details and use those figures. You
   provide plan information and education, NOT tax, legal, or investment advice — for personal tax
   questions, point them to a tax advisor or the participant line. If a question isn't covered by
   the plan documents, say you're not certain and offer to connect them to a specialist.
   ```
   The full consolidated system prompt (Robin, both topics, identity gate) is in
   `../elevenlabs-poc-setup.md` §2.

5. **RAG settings:** enable Knowledge Base retrieval on the agent; keep a low-latency model so
   answers stay fast. Tune the number of retrieved chunks so the agent cites the right article.

## Sample grounded answers (what "confident + correct" sounds like)

**Q: "Can I take out a loan against my 401(k)?"**
> "Yes — the Vertex plan allows loans. You can borrow the lesser of $50,000 or half your vested
> balance, with one loan at a time, repaid over up to five years through payroll at prime plus one
> percent. *(with the tool)* For your account specifically, you have no loan outstanding and you're
> fully vested, so you could borrow up to about $50,000. Want me to point you to where to request it?"

**Q: "Can I roll over funds from a previous retirement plan into this one?"**
> "Yes. The plan accepts roll-ins from old 401(k), 403(b), and 457(b) plans and traditional IRAs,
> both pre-tax and Roth. The clean way is a direct rollover — your old provider sends it straight to
> NestEgg with no taxes withheld. NestEgg's Rollover Concierge can set it up and give you the exact
> instructions for your previous provider."

**Q: "I'm leaving the company — how does this affect my plan?"**
> "Your vested balance is yours to keep. You've got four options: leave it in the Vertex plan (your
> balance is above the $7,000 threshold), roll it to your new employer's plan, roll it to an IRA, or
> take cash — though cash is taxed and, if you were under 59½, penalized. *(with the tool)* You're 58
> and fully vested, so under the Rule of 55 a distribution from this plan would avoid the 10%
> penalty, though it's still taxed as income. If you have a loan when you leave, it becomes due. Want
> the steps to start a rollover?"

## Guardrails
- **Education, not advice.** The agent states plan facts and points to a tax advisor for personal
  tax/legal questions.
- **Verify first**, and only use `get_plan_details` for the verified caller's own figures.
- **Synthetic only** — Vertex Manufacturing and Michael Reynolds are fictional; the SSN is in the
  invalid 900-range.
