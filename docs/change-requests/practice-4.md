1. **Need**: section 13.3, practice items 1 and 2, to call the resource rows buttons rather than links.
2. **Why**: a resource row opens SourcePeek over the paper and keeps the student's place; it navigates nowhere, so the foundation built it as a button and the step asserts role button.
3. **Proposed diff**: "`Relevant resources` has 3 buttons" and "Button `Postorder traversal Lecture 8 slides · Slide 17` opens `tid source-peek`".
4. **Workaround in use**: `scripts/e2e/steps/practice.mjs` asserts three buttons with their exact title and meta, then opens the peek from the first.
5. **Unblocks**: a reviewer checking the step against 13.3 word for word.
