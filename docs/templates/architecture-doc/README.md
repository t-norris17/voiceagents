# Architecture document template

For walking a non-engineering audience through a system they will never open: what the parts are,
which of them are on the hot path, and what crosses the line between one part and the next.

Used first for [Robin](../../../projects/robin-experiment/robin-architecture.html).

`architecture-template.html` is the whole thing: the design system, the eight-section skeleton with
guidance in comments, and three working SVG figure scaffolds on an explicit coordinate grid.

## This is not a capability summary

The distinction is worth being blunt about, because the first attempt at the Robin document got it
wrong. A capability summary answers "what can it do and why should I care", and its shape is a
headline claim, a feature list and a benefits band. An architecture document answers "what is it
made of and where are the joints", and its shape is components, paths and boundaries.

If you are writing a benefits section, you are writing the other document. The persuasion in an
architecture document comes from precision, not from framing: a reader who can see exactly where the
identity check sits and exactly what happens when it fails will draw the favourable conclusion
themselves, and will trust it, because you did not ask them to.

## Method

1. **Read the live system first.** Configuration facts come from the running platform's API and the
   running database, never from a file in the repository. Put "read live on DD Mon" in the header
   and make it true. On Robin this caught a version number wrong by twelve releases, three tools
   nobody knew were still attached, and a table that is empty on purpose.
2. **Decompose once, at one altitude.** Three to five things in section 01. If you need more, you
   are mixing deployables with internal parts; nest them instead (section 02 is the core's own
   parts, section 05 is the deployables).
3. **Write section 06 last.** The seams table is the most valuable thing on the page and needs the
   most knowledge. What crosses, what holds it shut, and what a person sees when it does not.
4. **Write section 08 honestly.** The half-finished migration, the empty table, the Alpha feature,
   the retention setting nobody revisited. A reader who discovers one of these later discounts
   everything else you wrote.
5. **Check both themes and the print layout** before you hand it over.

## Figures

Three scaffolds are in the template, each on a stated coordinate grid:

| Figure | Shape | Use it for |
|---|---|---|
| 1 | Pipeline with a branch group hanging off one stage | Decomposing the hot component: what it is made of, what it reads, what it can call |
| 2 | Linear chain, one accent hop, one branch above | The main request path, end to end |
| 3 | Parallel chains with identical geometry, one in accent | Loops that run outside the main path, where the point is that one of them is different |

Rules that matter more than they look:

- **Keep the grid.** Shared baselines and even gaps are most of what makes a hand-drawn diagram read
  as deliberate. The scaffolds state their spacing in a comment; change the labels, not the maths.
- **Spend the accent once per figure**, on the mark that carries the claim. Everything else is
  `currentColor`, which is what makes the figures work in both light and dark.
- **Label every arrow.** An unlabelled arrow means "related somehow".
- **Put sentences in the `figcaption`, never in the drawing.** An annotation inside the band will
  collide with its own line, which is exactly what happened on the first draft of Robin's Figure 2.
- **Depict the mechanism, not the name.** A box labelled "cache" says less than the prose. The two
  stores it sits between, and the arrow that disappears when you remove it, say what words cannot.

## Two registers, one structure

The same eight sections and the same three figures serve a technical audience and a non-technical
one. Only the register changes. Robin has both, and they are the worked pair:

- [`robin-architecture.html`](../../../projects/robin-experiment/robin-architecture.html) for people
  who will read the code.
- [`robin-how-it-works.html`](../../../projects/robin-experiment/robin-how-it-works.html) for an
  executive who has never opened a settings screen.

**Do not write the non-technical one by deleting things.** A document that keeps only the
comfortable parts is a reassurance document, and a reader who has been reassured rather than
informed will discover the rest from somebody else. Translate instead: every fact survives, in
words that carry it.

**Set the mental model once, then drop the metaphor.** Robin's plain version opens by framing her as
a new person on the phone team with four things: memorised rules, a binder she may only answer from,
a phone line to records, and a supervisor who reads every call. It then writes plainly and only
calls the frame back where it genuinely helps. An extended metaphor maintained across eight sections
starts to strain, and strained metaphors read as condescension.

**The three hardest sentences to translate are the ones that matter most.** In Robin's case: the
identity rule is a handbook procedure rather than a lock, the numbers start at zero, and recordings
are kept indefinitely. If those come out vaguer in the plain version than in the technical one, the
translation has failed.

**Keep the vendor names.** An executive signing off needs to know which outside companies are
involved and what would stop working if one of them did. Name them; subordinate the jargon, not the
accountability.

### Translation table

The substitutions used across Robin's pair. The pattern generalises: name the function, not the
product.

| Technical version | Plain version |
|---|---|
| Speech-to-text, turn model, language model, text-to-speech | Hearing, taking turns, deciding, speaking |
| System prompt | Her rules, which apply on every call |
| Procedures, trigger-matched | Playbooks that switch on from what the caller says |
| Knowledge base, retrieved in-runtime | Her binder, which sits with her so lookups cost no time |
| Webhook tool | A question she is allowed to ask our systems |
| Opaque `subject_ref` | A meaningless reference code instead of the person's details |
| Post-call analysis, data collection fields | The write-up: it reads the conversation back and fills in a form |
| HMAC signature, idempotent upsert | Proof it came from the platform; sending it twice cannot file it twice |
| The grader, per-claim scoring against retrieved documents | The review: it fetches the binder pages she used and checks each thing she said |
| Human-gated publish to the knowledge base | Nobody can change what she says without a person approving it |
| Route map, server-side enforcement, 404 on unlisted paths | It can read everything and change nothing |
| The seams | The handoffs, and what a caller would notice |
| "When it fails" | "What a caller would experience" |

The last row is the important one. A technical reader wants the failure mode; a business reader
wants the consequence. Same fact, different end of the sentence.

## Where a one-pager fits

`../one-pager/` is a strict single-page format for a different job: a summary someone reads standing
up. It carries a benefits band, so it is the capability-summary shape described above. Use it when
that is genuinely what is wanted, and do not reach for it when someone asks how a system works.
