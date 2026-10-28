1. **Need**: `sourceLabel(ref, "footnote")` in `lib/sources.ts` to name a single slide in the singular: "Lecture 7 slide 9", keeping "Lecture 7 slides 6–8" for a range.
2. **Why**: a guide footnote that cites one slide reads "Lecture 7 slides 9" today; generated sections cite single slides often (the mock rewrite of the Paper section shows "Lecture 7 slides 6. Used in Problem Set 4, Q1.").
3. **Proposed diff**: in `pageLabel`, footnote style for slides: `many ? \`${doc.title} ${slideRange(ref)}\` : \`${doc.title.replace(/ slides$/, " slide")} ${ref.page}\``, falling back to `${doc.title}, slide ${ref.page}` when the title does not end in "slides"; plus a case in `lib/sources.test.ts`.
4. **Workaround in use**: none; `features/guides/cites.ts` merges consecutive slides of a deck into one range, so the plural form is right whenever a block cites two or more neighbouring slides.
5. **Unblocks**: footnote copy only; no step or test depends on it.
