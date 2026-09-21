# One-pager template

A print-ready single Letter page for explaining a built thing to people who will never open it.
Used first for [Robin](../../../projects/robin-experiment/robin-one-pager.html).

- `one-pager-template.html` — the page. Copy it, replace the content, keep the CSS.
- `fit-check.mjs` — proves it still fits on one page. Run it before you hand the page to anyone.

## Making one

1. **Copy the template** next to the project it describes, as `<slug>-one-pager.html`.
2. **Gather the facts from the live system first**, not from this repo. Robin's setup section came
   from `agents_get` on the live ElevenLabs agent; the repo's own prompt and KB files contradict
   live in several places. If a fact cannot be verified across the seam, leave it out or label it
   unverified. This is the same rule as the working agreement in `CLAUDE.md`, and it is the one
   that makes a one-pager worth handing to an executive.
3. **Fill the five blocks in order.** They are fixed: masthead, sequence, two columns (setup and
   features), benefits band, standing note. Adding a sixth block is how a one-pager becomes two.
4. **Run the fit check.** `node fit-check.mjs <your file>` must report one page.
5. **Publish** as an artifact for the link, and commit the HTML so the next person has the source.

## The bar for inclusion

Every line answers "so what" for a reader who will never use the system. True is not sufficient.

- A fact that appears in two blocks gets deleted from one of them.
- A capability the reader cannot act on, check, or be reassured by is cut.
- What the thing will **not** do is usually worth more than one more thing it can.
- Results nobody has measured never appear as benefits. They go in the standing note as
  "results start from zero", which is both honest and more persuasive than a rounded claim.
- Identifiers (`model ids`, tool names, version strings) earn their place when a reader might
  want to verify them. Tuning constants almost never do.

## Fitting one page

One Letter page at these sizes holds roughly **700 to 750 words** of body text plus the headings.
Over that, cut in this order:

1. **Merge two steps.** Four steps in one row instead of six in two rows saves about 60px, more
   than any other single change.
2. **Drop the weakest bullet.** A bullet is about 28px.
3. **Trim the longest item in a row.** Every row is as tall as its tallest cell, so trimming the
   second-longest saves nothing. The two body columns should end within about 15px of each other;
   adjust `.body2` column ratio rather than padding one column with filler.
4. **Then, and only then, reduce print type.** The floor is 7.4pt body; below that it stops being
   a document an executive will read standing up.

`fit-check.mjs` prints the height of every block so you can see which one to attack.

## Design notes

Newsreader for headings, IBM Plex Sans for body, IBM Plex Mono for configuration values and the
one number in the masthead. Deep teal accent on a picked near-white; the palette is defined as
tokens on `:root` and redefined for both dark-mode states, so the page reads correctly on screen
in either theme and prints as black on white regardless.

The filled box at the bottom is the only element on the page with a background. That is deliberate:
it is the paragraph a reader must not skim, so it is the only thing competing for attention with
the headline.
