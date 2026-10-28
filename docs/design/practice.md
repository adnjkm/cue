# Practice: implementation spec

Source: Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens", artboard "04 Practice" (`IT-0`), 1440×900. This is the only artboard for this screen. All px values come from `get_jsx`. Colors are given as Cue token names. Paper stores them as hex; the app must define them in OKLCH (plan.md). OKLCH values are in section 7.

Practice already runs in the codebase: `components/Practice.tsx`, `components/Navigator.tsx`, `components/AskChat.tsx`, styles in `app/globals.css`. This spec describes the design so the screen can be ported to shadcn (Base UI flavour). Where the code differs from the design, section 6 says so.

Notation: `13/20 420` means font-size 13px, line-height 20px, weight 420. "Caps" means uppercase with `letter-spacing: var(--tracking-caps)` (0.08em). "Display tracking" means `letter-spacing: -0.02em`.

## 1. Purpose and content

Practice turns an uploaded past paper or multiple-choice test into a clean, one-question-at-a-time practice interface. The student picks an answer. Cue marks it at once, notes why each wrong option is wrong, and shows a worked solution with links back into the course material that teaches the idea (lecture slides, a transcript moment, course notes). A topic filter narrows the paper to one topic. "Ask why" opens a conversation about the current question. A bar along the bottom shows every question, grouped by topic, with its result, so the student sees at a glance what they got right, what they missed and what is left. The artboard has no app sidebar. Like Study session, it is a focus screen (see `today.md` section 7). The product also needs a way to ask the AI for new questions; the design has none, so section 5.4 proposes one.

### Content shown (verbatim)

Toolbar:
- Title: `CSC148 · 2024 Midterm`
- Topic select: `All topics`
- Button: `Ask why`
- Icon buttons: previous question, next question (chevrons, no labels)

Question:
- Eyebrow (caps): `Question 7 · Multiple choice · 2 marks`
- Prompt: `A postorder traversal visits every node in the tree on the right. In what order are the values printed?`
- Figure: a binary tree. Root `A`; `A` has children `B` (left) and `C` (right); `B` has children `D` (left) and `E` (right).

Options (2×2 grid):

| Letter | Text | Trailing note | Drawn state |
| --- | --- | --- | --- |
| A | `A, B, D, E, C` | none | not chosen |
| B | `D, E, B, C, A` | `Your answer · correct` | chosen, correct |
| C | `D, B, E, A, C` | `That's inorder` | not chosen |
| D | `C, E, D, B, A` | `Reversed preorder` | not chosen |

Worked solution:
- Section label (caps): `Worked solution`
- Explanation: `Postorder finishes both subtrees before printing the root. Walk the tree that way:`
- Steps (label, value): `B's subtree` / `D, E, then B`; `C's subtree` / `C`; `Root` / `A`
- Conclusion: `So the order is D, E, B, C, A.`
- Provenance (muted): `The original exam had no answer key; Cue wrote this from Lecture 8.`
- Button: `Next question` with a chevron
- Resources label: `Relevant resources`
- Resource rows (title / meta):
  - `Postorder traversal` / `Lecture 8 slides · Slide 17`
  - `“Delete the children before the parent”` / `Lecture 8 transcript · 41:05`
  - `Tree traversals` / `Course notes · §5.3`

Question bar (topic label, then tiles):

| Topic (caps) | Tiles in order | Correct | Missed | Current | Unanswered |
| --- | --- | --- | --- | --- | --- |
| `Recursion & trees` | 1, 2, 3, 4, 7, 8 | 1, 2, 4 | 3 | 7 | 8 |
| `Big-O & efficiency` | 5, 6, 9, 10, 11 | 5, 9 | 6 | none | 10, 11 |
| `Linked lists` | 12, 13, 14, 15 | none | none | none | 12 to 15 |

### Facts the content implies

- The paper has 15 questions in 3 topics. Topic groups keep the printed question numbers, so numbers interleave across groups (7 sits after 4 in the first group).
- Question 7 is current and already answered correctly. The current style wins over the result style on its tile.
- 8 of 15 answered: 6 correct (1, 2, 4, 5, 7, 9), 2 missed (3, 6), 7 left. The current tile hides its own result.
- The answer B is correct for this tree: postorder D, E, B, C, A. C is the inorder walk. D is the preorder walk (A, B, D, E, C) reversed. A is the preorder walk itself, so its missing note would read `That's preorder`.
- Each question carries a type ("Multiple choice") and marks ("2 marks"). The current `Question` type has neither.
- The paper had no answer key. Cue produced the answer and solution and grounds it in Lecture 8. Resource rows point to a slide number, a transcript timestamp and a textbook section, so Practice needs the course material store from the full app.
- Step labels are meaningful ("B's subtree"), not numbered. The solution schema needs `{ label, text }` steps.

### Sample data sketch

```ts
const exam = {
  course: "CSC148",
  title: "2024 Midterm",
  answerKey: false,
  topics: ["Recursion & trees", "Big-O & efficiency", "Linked lists"],
  questions: [
    // numbers 1..15; topic per number:
    // 1,2,3,4,7,8 -> Recursion & trees; 5,6,9,10,11 -> Big-O & efficiency; 12..15 -> Linked lists
    {
      number: "7",
      topic: "Recursion & trees",
      type: "multiple_choice",
      marks: 2,
      prompt: "A postorder traversal visits every node in the tree on the right. In what order are the values printed?",
      figure: { kind: "tree", root: { v: "A", l: { v: "B", l: { v: "D" }, r: { v: "E" } }, r: { v: "C" } } },
      options: [
        { label: "A", text: "A, B, D, E, C" },
        { label: "B", text: "D, E, B, C, A" },
        { label: "C", text: "D, B, E, A, C" },
        { label: "D", text: "C, E, D, B, A" },
      ],
      answer: "B",
      answerSource: "model",
    },
  ],
};
const attempts = { 1: "correct", 2: "correct", 3: "missed", 4: "correct", 5: "correct", 6: "missed", 7: "correct", 9: "correct" };
const current = "7";
const solution7 = {
  explanation: "Postorder finishes both subtrees before printing the root. Walk the tree that way:",
  steps: [
    { label: "B's subtree", text: "D, E, then B" },
    { label: "C's subtree", text: "C" },
    { label: "Root", text: "A" },
  ],
  conclusion: "So the order is D, E, B, C, A.",
  whyNot: { A: "That's preorder", C: "That's inorder", D: "Reversed preorder" },
  provenance: { source: "model", groundedIn: "Lecture 8" },
  resources: [
    { kind: "slide", title: "Postorder traversal", meta: "Lecture 8 slides · Slide 17" },
    { kind: "transcript", title: "“Delete the children before the parent”", meta: "Lecture 8 transcript · 41:05" },
    { kind: "textbook", title: "Tree traversals", meta: "Course notes · §5.3" },
  ],
};
```

For realistic variety, other questions should include a code snippet prompt (Big-O), a figure-less prompt, and an option text long enough to wrap.

## 2. Layout skeleton

```
Artboard 1440×900, bg --color-page, overflow clip
└ Practice main: column, flex 1, padding 28 40 32, gap 24
  ├ Toolbar: row, height 32, space-between, align center, flex-shrink 0
  │  ├ Title (h1)
  │  └ Controls: row, gap 12, align center
  │     ├ Topic select 102×32
  │     ├ Ask why 80×32
  │     └ Arrows: row, gap 2 (two 32×32 icon buttons)
  ├ Body: row, flex 1, min-height 0, padding-top 16, gap 48 (one child; see 6.6)
  │  └ Work area: column, flex 1, min-width 0, gap 32
  │     ├ Question row: row, align start, gap 164
  │     │  ├ Question head: column, fixed 520 wide, gap 12
  │     │  └ Figure: 360×200
  │     ├ Answers: column, gap 8
  │     │  ├ Row: gap 8, two options, each flex 1 (676)
  │     │  └ Row: gap 8, two options, each flex 1 (676)
  │     └ Solution: column, gap 12
  │        ├ Section label
  │        └ Solution panel: row, padding 24, gap 24, bg --color-fill
  │           ├ Explanation column: flex 1 (644), gap 16
  │           └ Resources column: flex 1 (644), gap 8
  └ Question bar: row, align center, gap 40, border-top 1, padding-top 16, flex-shrink 0
     └ Topic group ×3: row, align center, gap 12
        ├ Topic label (max-content)
        └ Tiles: row, gap 6, 36×36 each
```

### Containers

| Container | Display | Size | Padding | Gap | Other |
| --- | --- | --- | --- | --- | --- |
| Artboard | flex row | 1440×900 | 0 | n/a | `overflow:clip`, bg `--color-page` |
| Practice main | flex column | fills | 28 top, 40 inline, 32 bottom | 24 | `min-width:0` |
| Toolbar | flex row | 1360×32 | 0 | n/a | `justify-content:space-between; align-items:center` |
| Controls | flex row | 272×32 | 0 | 12 | align center |
| Arrows | flex row | 66×32 | 0 | 2 | align center |
| Body | flex row | 1360×707 | 16 top | 48 | `flex:1 1 0; min-height:0` |
| Work area | flex column | 1360×691 | 0 | 32 | `flex:1 1 0; min-width:0` |
| Question row | flex row | 1360×200 | 0 | 164 | `align-items:start` |
| Question head | flex column | 520 wide | 0 | 12 | `flex:0 0 520px; max-width:520px` |
| Answers | flex column | 1360×120 | 0 | 8 | each row is flex with gap 8 |
| Solution | flex column | 1360×300 | 0 | 12 | n/a |
| Solution panel | flex row | 1360×272 | 24 | 24 | bg `--color-fill`, radius 6 |
| Explanation column | flex column | 644×224 | 0 | 16 | `flex:1 1 0; min-width:0` |
| Steps list | flex column | 644×68 | 0 | 4 | rows are flex, gap 12 |
| Resources column | flex column | 644×224 | 0 | 8 | `flex:1 1 0; min-width:0` |
| Question bar | flex row | 1360×53 | 16 top | 40 | border-top 1px `--color-rule`, align center |
| Topic group | flex row | 409 / 368 / 273 wide | 0 | 12 | align center |
| Tiles | flex row | 36 tall | 0 | 6 | n/a |

### Measured boxes at 1440×900

Vertical budget: 28 + 32 (toolbar) + 24 + 707 (body) + 24 + 53 (question bar) + 32 = 900.

| Element | x | y | w | h |
| --- | --- | --- | --- | --- |
| Toolbar | 40 | 28 | 1360 | 32 |
| Eyebrow | 40 | 100 | 520 | 16 |
| Prompt | 40 | 128 | 520 | 56 (2 lines of 28) |
| Figure | 724 | 100 | 360 | 200 |
| Option row 1 | 40 | 332 | 1360 | 56 |
| Option row 2 | 40 | 396 | 1360 | 56 |
| "Worked solution" label | 40 | 484 | 1360 | 16 |
| Solution panel | 40 | 512 | 1360 | 272 |
| Question bar (border line) | 40 | 815 | 1360 | 1 |
| First tile | 203 | 832 | 36 | 36 |

The work area content is 684 tall inside a 691 box, so 7px is spare at 1440×900.

### Alignment notes

- The figure's left edge (x 724 = 40 + 520 + 164) equals the left edge of the right option column (40 + 676 + 8). Build the question row as the same two-column grid as the options (`grid-template-columns: 1fr 1fr; column-gap: 8px`) rather than with the literal 164 gap. The code already does this (`.stem`).
- The prompt keeps a 520 measure even when there is no figure.
- Option letters sit in a fixed 16px slot, so option texts line up across all four options at x + 20 + 16 + 12 = 48 from the option edge.
- Step labels sit in a fixed 96px slot, so values line up.
- The solution panel's two columns are equal (644 each). The resources column starts at x 732, 8px right of the right option column (724), because the panel's 24px padding and gap differ from the options' 8px gap. Keep the equal split; do not force the two edges to match.
- Tiles are fixed 36×36 so numbers 1 to 15 line up regardless of digit count.

### Scroll behavior

- Toolbar and question bar are fixed. The body is the only scroll container (`flex:1; min-height:0; overflow-y:auto`).
- Let the scroll container bleed to the window edges (negative 40px inline margin, 40px inline padding) so the scrollbar sits at the edge and focus rings are not clipped. The code does this.
- On question change, reset the body scroll to top.
- The question bar scrolls horizontally when topics overflow. Hide the scrollbar, fade the overflowing edge with a 48px mask, and keep the current tile in view. At 1440 the drawn groups use 1130 of 1360, so overflow starts near 20 questions.
- Inside the solution, long chat threads (proposal 5.3) scroll in their own ScrollArea.

## 3. Components

All text is `--font-sans` (Timeless Sans) unless noted. No component has a shadow. Every text node is 13px or 20px, weight 420 or 500.

| Component | Structure | Typography | Colors | Radius / border | Size and spacing | shadcn mapping |
| --- | --- | --- | --- | --- | --- | --- |
| Screen title | `h1`, one line: course · exam title | 20/24 420, display tracking | text `--color-ink` | none | 218×24 at this content | custom |
| Topic select (trigger) | label + 12px chevron (`M3 4.5l3 3 3-3`, stroke 1.5, round caps) | 13/16 420 | bg `--color-control`, text and chevron `--color-ink` | `--radius-sm` (6), no border | padding 8 11 8 15, gap 8, height 32, width 102 | Select (Base UI); restyle `SelectTrigger`, items list "All topics" + each topic |
| Ask why | button, one label | 13/16 420 | bg `--color-control`, text `--color-ink` | `--radius-sm`, no border | padding 8 15, 80×32 | Button `variant="secondary"` |
| Previous / Next question | icon button, 16px chevron (`M10 3L5 8l5 5` / `M6 3l5 5-5 5`, stroke 1.5) | n/a | no bg, icon `--color-ink` | `999px` (full) | 32×32, gap 2 between them | Button `variant="ghost" size="icon"`, rounded-full, with Tooltip |
| Question eyebrow | `p`: Question n · type · marks | 13/16 420, caps | `--color-graphite` | none | 520 wide | custom |
| Question prompt | text block; may hold paragraphs and code | 20/28 420, display tracking | `--color-ink` | none | max 520 wide, 12 below eyebrow | custom (`Prose`) |
| Figure: tree | inline SVG 360×200; edges then nodes then labels | labels 13px, `text-anchor:middle`, baseline at cy + 4.5 | edges stroke `--color-border` 1px; nodes fill `--color-page`, stroke `--color-ink` 1px; labels `--color-ink` | circles r 24 | nodes at (180,26) (96,100) (264,100) (48,174) (144,174) | custom. Parsed exams use a cropped image instead (`.figure img`, natural size, max-height 420) |
| Answer option | `button`: letter slot, text, optional trailing note | 13/16; 420 idle, 500 when chosen | idle: border `--color-border`, bg none, letter `--color-graphite`, text `--color-ink`, note `--color-graphite`. Chosen: see section 4 | 6px, 1px solid | height 56 (use `min-height` so text can wrap), padding 0 20, gap 12, letter slot 16 wide, text `flex:1` | custom `AnswerOption` on a plain `button` (not RadioGroup: a choice commits and locks) |
| Options grid | 2 columns × n rows | n/a | n/a | n/a | gap 8 both ways, columns 676 | custom (`div role="group" aria-label="Answer choices"`) |
| Section label | `h2` "Worked solution" | 13/16 420, caps | `--color-graphite` | none | 12 above panel | custom |
| Solution panel | two equal columns | n/a | bg `--color-fill` | 6px, no border | padding 24, gap 24 | Card restyled (no border, no shadow, padding 24) or custom |
| Explanation text | paragraph | 13/20 420 | `--color-ink` | none | column gap 16 | custom (`Prose`) |
| Step row | label slot + value | 13/20 420 | label `--color-graphite`, value `--color-ink` | none | label 96 wide, gap 12; rows gap 4 | custom (`dl` with `dt`/`dd`, or `ol`) |
| Conclusion | paragraph | 13/20 420 | `--color-ink` | none | n/a | custom |
| Provenance note | paragraph | 13/20 420 | `--color-graphite` | none | n/a | custom |
| Next question | button: label + 12px chevron (16 viewBox, stroke 2) | 13/16 420 | bg `--color-ink`, text and icon `--color-page` | `--radius-sm` | padding 8 13 8 15, gap 8, 131×32, `align-self:start` | Button `variant="default"` |
| Resources label | text "Relevant resources" | 13/16 420, sentence case | `--color-graphite` | none | 8 above first row | custom |
| Resource row | link: column (title, meta) + 16px chevron (stroke 1.5) | title 13/16 500; meta 13/16 420 | bg `--color-page`; title `--color-ink`; meta and chevron `--color-graphite` | 6px, 1px solid `--color-border` | padding 12 16, gap 12, `justify-content:space-between`, height 58, rows gap 8 | Item `variant="outline"` rendered as a link (`render={<a/>}` in Base UI), or custom |
| Question bar | `nav` with topic groups | n/a | border-top 1px `--color-rule` | none | padding-top 16, group gap 40 | Separator + ScrollArea (horizontal) + custom |
| Topic label | text | 13/16 420, caps, `width:max-content` | `--color-graphite` | none | 12 before tiles | custom |
| Question tile | `button` with the printed number | 13/16 420, tabular figures (code) | see section 4 | 6px | 36×36, gap 6, number centered | custom `QuestionTile` (Button primitives, `aria-current`) |

### Icons

Three glyphs, all inline SVG with round caps and joins: chevron down 12px (select), chevron left and right 16px at stroke 1.5 (arrows, resource rows), chevron right 12px at stroke 2 (Next question; drawn from a 16 viewBox so it renders at about 1.5px). `components/icons.tsx` already has `ChevronLeft` and `ChevronRight` with `size` and `strokeWidth`. Use `currentColor` so the icon follows the text color.

## 4. States

"Drawn" means it is on the artboard. "Code" means `Practice.tsx` / `globals.css` already does it. "Proposal" is new.

| Element | State | How it is drawn | Carried by more than color? | Source |
| --- | --- | --- | --- | --- |
| Option | idle | 1px `--color-border`, no fill, letter graphite, text ink, weight 420 | n/a | Drawn |
| Option | hover | bg `--color-wash` | n/a | Code |
| Option | pressed | bg `--color-fill` | n/a | Code |
| Option | focus-visible | 2px `--color-ink` outline, 2px offset | outline shape | Code |
| Option | chosen, correct | bg `--color-fill`, border `--color-ink`, letter, text and note `--color-ink` at 500, note `Your answer · correct` | yes: weight 500, darker border, words | Drawn |
| Option | chosen, wrong | no fill, 1px dashed `--color-ink`, ink 500, note `Your answer` | yes: dashed border, words. Proposal: note `Your answer · wrong` so words alone carry it | Code |
| Option | correct answer, not chosen | same as chosen correct, note `Correct answer` | yes: words, weight | Code |
| Option | checking (no answer key yet) | border `--color-ink`, letter ink 500, note `Your answer · checking…` | yes: words | Code |
| Option | other option after answering | idle look, trailing note = why it is wrong, graphite | words | Drawn (C, D) |
| Option | locked after answering | `disabled`, cursor default, no dimming | n/a | Code |
| Tile | unanswered | 1px solid `--color-border`, no fill, number `--color-graphite` | outline only | Drawn (8, 10 to 15) |
| Tile | correct | bg `--color-fill`, no border, number `--color-ink` | no border vs border, darker number. Fill is only 1.15:1 against page (see 6, item 12) | Drawn (1, 2, 4, 5, 9) |
| Tile | missed | 1px dashed `--color-ink`, no fill, number ink | yes: dashed border | Drawn (3, 6) |
| Tile | current | bg `--color-ink`, number `--color-page` | yes: inverted. `aria-current="true"` | Drawn (7) |
| Tile | current and answered | current look wins; `aria-label` adds the result ("Question 7, current, correct") | words for screen readers | Drawn + Code |
| Tile | hover | bg `--color-wash` (correct tile shows its border instead) | n/a | Code |
| Tile | generated by Cue | as its result state, plus a 4×4 `--color-graphite` dot 4px from the top right corner, `aria-label` adds "written by Cue" | shape | Proposal |
| Tile | being generated | 36×36 `--color-control` block with the skeleton breathe animation, no number | motion and shape | Proposal |
| Select | open | Base UI popup: bg `--color-page`, 1px `--color-border`, radius 6, items 13/16, highlighted item bg `--color-wash`, check on the selected item | check glyph | Proposal |
| Select | filter applied | label shows the topic name; question bar shows only that group; Prev/Next walk only that topic | words | Code |
| Prev / Next | disabled at the ends | opacity 0.4, no hover | n/a | Code |
| Buttons | hover | secondary: bg `--color-border`. Default (ink): needs a token, see 6.8 | n/a | Code |
| Solution | hidden | before an answer, the section is absent and options sit directly above the question bar | n/a | Code |
| Solution | loading | panel shows `Working it out with Nemotron Ultra…` in graphite and three skeleton bars (10 tall, radius 3, `--color-control`, widths 100/86/64%, staggered 1.6s breathe) | motion, words, `aria-busy` | Code |
| Solution | error | graphite message + `Try again` (secondary button). Copy by kind: rate limited, budget (`The $30 spending cap is reached`), other | words | Code; budget copy is a proposal (code shows the generic message for `budget`) |
| Solution | hint mode | `Ask why` before answering opens the chat with hint suggestions and no answer | words | Code |
| Solution | last question answered | button replaced by `All 15 answered · 12 correct` at 500 | words | Code |
| Next question | next is answered | label `Next unanswered`, jumps to the first unanswered visible question | words | Code |
| Resource row | hover | bg `--color-wash` | n/a | Proposal (matches `.row-button`) |
| Resource row | none found | hide the resources column; the explanation column takes the full width | n/a | Proposal |
| Screen | empty (no paper yet) | the Intake drop zone (`components/Intake.tsx`), not this layout | n/a | Code |
| Screen | parsing | Intake progress: page count and a 2px progress bar | words + bar | Code |

Live, recording and flagged states do not apply to this screen.

## 5. Interactions, keyboard, responsive

### 5.1 What each control does

- **Topic select:** filters the questions to one topic or "All topics". If the current question leaves the filter, jump to the first question in the topic. Remember the choice with the session.
- **Ask why:** opens the chat for the current question (5.3). Before an answer it gives hints without the answer. After an answer it explains, with suggested prompts (`Why not C?`, `Why is B right?`, `Explain it more simply`, `Show a similar example`).
- **Previous / Next arrows:** move through the visible questions in printed order. Disabled at the ends.
- **Answer option:** commits the choice and locks the question. Marks it at once when an answer is known. Otherwise shows "checking" until Cue's answer arrives. Reveals the worked solution and the why-not notes.
- **Next question:** goes to the next visible question, or the first unanswered one when the next is done. Gone when all are answered.
- **Resource row:** opens the source at the exact place: the slide (Lecture 8, slide 17), the transcript at 41:05, or the course notes at §5.3. Open in the app's viewer, keeping Practice state, so Back returns to the same question.
- **Question tile:** jumps to that question.

### 5.2 Keyboard

Code today: `←` / `→` previous and next question; `1` to `9` or `A` to `D` choose an option while unanswered; `Enter` goes to the next question after answering, unless focus is on a button or link. Options carry `aria-keyshortcuts`.

Proposal:

| Key | Action |
| --- | --- |
| `?` | Ask why (focus the chat input) |
| `Esc` | close the chat panel or sheet; with nothing open, leave Practice (see `today.md` section 7) |
| `T` | open the topic select |
| `←` / `→` inside the question bar | move focus between tiles (roving tabindex, one Tab stop for the whole bar). The global arrow handler must skip when focus is in the bar. |
| `Home` / `End` inside the bar | first / last tile |
| `N` | open "Write new questions" (5.4) |

Show shortcuts in the Tooltips on the arrow buttons and on Ask why, using the shadcn `Kbd` component. Announce the position after each move in a polite live region (`Question 7 of 15`), as the code does.

### 5.3 Ask why panel (proposal)

The design gives the toolbar an `Ask why` button but draws no chat. The solution's right column holds resources, not chat. The Body frame keeps a 48px gap with a single child, which reads as a slot for a side column. Study session draws its chat as a 360px column (`55-0`, "Lecture chat").

- At 1280 and wider: Ask why opens a 360px column to the right of the work area inside Body (gap 48). Header `Ask about question 7` (13/16 caps graphite), messages in a ScrollArea, composer at the bottom styled like Study session's composer. The work area narrows to 952; options become 472 each. The question row must use the grid from section 2, since 520 + 164 + 360 no longer fits.
- Below 1280: the same content in a right Sheet, 400 wide (full width below 768, as a bottom sheet at 85% height).
- Toggle with the same button; it shows a pressed state (bg `--color-border`) while open.

### 5.4 Write new questions with AI (proposal)

Entry points:
1. **Question bar, trailing:** a secondary Button `Write questions` with a 12px plus icon, right-aligned outside the scroll area so it never scrolls away. The bar has 230px free at 1440. This also replaces the code's `New document` text button, which moves into a toolbar overflow menu (`…`, DropdownMenu) with `Upload another paper`.
2. **After a miss:** in the solution panel, under `Next question`, a secondary Button `Try a similar question`. It writes one question on the same idea and inserts it right after the current one.
3. **All answered:** next to `All 15 answered · 12 correct`, a default Button `Write 5 more on what I missed`.

Dialog (shadcn Dialog, 480 wide, padding 24, radius 10, bg `--color-page`):
- Title `Write new questions`, 20/24 420, display tracking.
- Description, 13/20 graphite: `Cue writes multiple-choice questions in the style of this paper, from your course material.`
- `Topic`: Select, defaults to the current filter; first item `Topics I missed most`.
- `How many`: ToggleGroup `3` `5` `10`, default 5.
- `Focus on questions I missed`: Checkbox, on when the topic has a miss.
- `Anything specific?`: Textarea, optional, placeholder `For example: harder, with code tracing`.
- Footer: ghost `Cancel`, default `Write questions`. Under them, 13/16 graphite: `Uses Nemotron. Counts toward the $30 model budget.`

Flow:
- Submit closes the dialog. New tiles appear at the end of their topic group in the "being generated" state and fill in as each question arrives. Numbers continue after the paper's last number (16, 17, …).
- A generated question's eyebrow reads `Question 16 · Written by Cue · Multiple choice`. Its solution provenance reads `Cue wrote this question from Lecture 8 and the 2024 Midterm.` Its tile carries the dot from section 4.
- Errors show inline in the bar where the skeleton tiles were: `Couldn't write questions. Try again` with a retry. Budget errors use the Intake copy `The $30 spending cap is reached`. Partial results are kept.
- Server: a new route (for example `POST /api/generate`) that reserves spend through `lib/spend.ts` before calling the model and returns `kind: "budget"` (HTTP 402) at the cap, like the existing routes. Send up to 6 same-topic questions from the paper as style examples plus the linked course material. Validate each question with zod: 4 options, exactly one answer, a why-not note for each distractor, `{label, text}` steps.
- Data: add `origin: "exam" | "generated"`, `type`, and `marks?` to `Question`.

### 5.5 Responsive (proposal)

| Width | Changes |
| --- | --- |
| 1280 and up | As drawn. If Practice ever renders inside the 232px docked Sidebar, main is 1208 and content 1128: options 560 each, figure column 560. |
| 1024 to 1279 | As drawn, two-column options and solution. Ask why uses the Sheet. Tiles scroll horizontally. |
| 768 to 1023 | Gutter 32. Solution panel stacks: explanation, then resources. Figure stays in the right column. Options stay two columns. |
| below 768 | Gutter 16. Top padding 16, bottom `max(12px, env(safe-area-inset-bottom))`. Main gap 16. Toolbar wraps: title on its own line (may wrap to two lines), then a row with the select (`flex:1`), Ask why, and the arrows. Body padding-top 8. Question gap 24. Figure moves under the prompt, `max-width:100%`. Options become one column; each option becomes a 16px + 1fr grid with the trailing note under the text, padding 12 16, min-height 56. Solution panel padding 16, one column. Question bar padding-top 12, group gap 24. The trailing bar button collapses to an icon button (32×32, plus icon, `aria-label="Write questions"`). |
| 375 | All of the above. Prompt stays 20/28; title 20/24. Tiles stay 36×36 (passes the 24px WCAG 2.5.8 minimum). After answering, scroll the `Worked solution` heading into view (instant under reduced motion) so the Next button is reachable. |

## 6. Inconsistencies and flags

1. **Eyebrow content.** Design: `Question 7 · Multiple choice · 2 marks`. Code: `Question 7 · {topic}`. The `Question` type has no `type` or `marks`. Add them; the parser should extract marks when printed and omit the segment when not.
2. **Solution right column.** Design: `Relevant resources`. Code: the Ask chat. Resources need the course material store (slides, transcripts, notes) that does not exist in `cue-practice` yet. Proposal 5.3 moves chat to a side column.
3. **Steps.** Design: meaningful labels (`B's subtree`). Code: `Step 1`, `Step 2`. Schema `steps: string[]` should become `{ label, text }[]`. The design also has a separate conclusion line; the schema has none.
4. **Provenance voice.** Design: `Cue wrote this from Lecture 8.` Code: `Nemotron 3 Ultra worked this out.` Today and Study session speak as Cue. Pick one. Keep the model name in a tooltip if the hackathon needs it visible.
5. **Option A has no why-not note** while C and D do. It should read `That's preorder`.
6. **Body gap 48 with one child.** Vestigial slot, used by proposal 5.3. Study session's body gap is 40.
7. **Hard-coded values in Paper.** SVG label fill `#141414` instead of `--color-ink`. Radius `6px` literal on options, solution panel, resource rows and tiles, while controls use `var(--radius-sm)` (same value). `999px` literal on arrows instead of `--radius-full`. Display tracking `-0.02em` is a literal; the token `--tracking-tight` is `-0.03em`, so no token matches. The code adds `--tracking-display: -0.02em`; keep that. Many gaps are off the spacing scale (2, 6, 12, 20, 28, 32, 36, 48, 164); use literal px for them.
8. **Hex in code.** `globals.css` defines tokens in hex, and `.button.primary:hover` uses raw `#2c2c2a`. Both fail `scripts/check-tokens.mjs` (plan.md, done item 4). Add `--color-ink-hover` (section 7).
9. **No sidebar.** Today has the 232px Sidebar with a `Practice` item. Practice and Study session have none. `today.md` section 7 proposes focus screens; this spec follows it. The artboard has no exit control, so `Esc` (5.2) and the overflow menu are the way out.
10. **Bar order vs Next order.** The bar groups by topic (1, 2, 3, 4, 7, 8, then 5, 6, 9, …). Prev/Next follow printed order (4 then 5). Recommended: keep printed order for Prev/Next (it matches the eyebrow and the paper) and keep the bar grouped as an overview.
11. **Only one state is drawn.** No unanswered, wrong, loading, hover or error state exists in Paper. Section 4 fills them from the code.
12. **Contrast.** `--color-border` on page is 1.46:1; the correct tile's fill on page is 1.15:1. Tiles still differ by border presence and text color, and the code's `aria-label` carries the result. `--color-graphite` on `--color-fill` is 4.71:1, which passes AA for the 13px provenance line.
13. **Style check against the shared Cue style.** Passes: Timeless Sans only, weights 420 and 500 only, sizes 13 and 20 only, grayscale tokens only. The artboard root declares `font-size:12px; line-height:16px` but no visible text uses it. The unused tokens `--text-xs` (12), `--text-base` (15) and `--radius-md` (10) do not appear on this screen.
14. **Resources label** is sentence case while `Worked solution` is caps. It reads as a sub-label inside the panel, which seems deliberate. Keep it.
15. **`New document`** exists in code but not in the design. Proposal 5.4 moves it to the overflow menu.

## 7. Porting notes

### Tokens in OKLCH

| Token | Paper hex | OKLCH | shadcn variable |
| --- | --- | --- | --- |
| `--color-page` | `#FFFFFF` | `oklch(100% 0 0)` | `--background`, `--card`, `--popover`, `--primary-foreground` |
| `--color-ink` | `#141414` | `oklch(19.1% 0 0)` | `--foreground`, `--primary`, `--ring` |
| `--color-graphite` | `#6A6A66` | `oklch(52.3% 0.0062 106.6)` | `--muted-foreground` |
| `--color-rule` | `#E8E8E3` | `oklch(93% 0.0067 106.5)` | none (use for Separator) |
| `--color-wash` | `#F6F6F3` | `oklch(97.2% 0.004 106.5)` | `--accent` (hover) |
| `--color-fill` | `#EFEFEB` | `oklch(95.1% 0.0053 106.5)` | `--muted` |
| `--color-border` | `#D6D6D0` | `oklch(87.4% 0.0081 106.6)` | `--border`, `--input` |
| `--color-control` | `#E6E6E3` | `oklch(92.4% 0.004 106.5)` | `--secondary` |
| `--color-ink-hover` (new) | `#2C2C2A` | `oklch(29.2% 0.0036 106.6)` | primary hover |

### Type and radius in Tailwind 4

- Timeless Sans ships Regular and Medium files. `app/layout.tsx` maps weights 400 to 499 to Regular so 420 renders. Set `--font-weight-normal: 420` and `--font-weight-medium: 500` in `@theme` so `font-normal` and `font-medium` match Paper.
- Sizes: 13/16 (controls, labels, options, tiles), 13/20 (solution prose), 20/24 (title), 20/28 (prompt). Use `text-[13px] leading-4`, `leading-5`, `text-[20px] leading-6`, `leading-7`, or define `--text-sm: 13px` and `--text-lg: 20px` with their default line heights.
- shadcn derives radii from `--radius`. Set `--radius: 10px`: `rounded-sm` becomes 6px (Paper `--radius-sm`) and `rounded-lg` 10px. Note the name clash: Paper `--radius-md` is 10px, shadcn `rounded-md` is 8px. Nothing on this screen uses 8.
- Base UI components compose with the `render` prop, not Radix `asChild`.
- Strip shadcn's default shadows and focus rings; use the 2px `--color-ink` outline with 2px offset that the code uses.
