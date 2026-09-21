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

## Where a one-pager fits

`../one-pager/` is a strict single-page format for a different job: a summary someone reads standing
up. It carries a benefits band, so it is the capability-summary shape described above. Use it when
that is genuinely what is wanted, and do not reach for it when someone asks how a system works.
