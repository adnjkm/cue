# Study session: implementation spec

Source: Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens", artboard "02 Study session" (`55-0`), 1440×900. This is the only artboard for this screen. All px values come from `get_jsx`. Colors are given as Cue token names. Paper stores them as hex; the app must define them in OKLCH (plan.md).

Notation: `13/20 420` means font-size 13px, line-height 20px, weight 420. "Caps" means uppercase with `letter-spacing: var(--tracking-caps)` (0.08em).

## 1. Purpose and content

The study session is a focused, timed review of one lecture. Cue opens it from Today ("Start session"). The student works through a five-step plan on the left. The middle shows the material for the current step, already scrolled to the right place: slides, transcript or textbook. Under the material sits the transcript moment that matters most for this step, and a check-yourself question with a "Next step" button. The right column is a chat scoped to this lecture: answers cite slides, transcript times, handouts and the web, and the student picks a fast or a deep model per question. A Pomodoro-style progress bar and countdown sit in the toolbar. The screen has no app sidebar: like Lecture notes, it is a focus mode.

### Content shown (verbatim)

| Region | Element | Text |
| --- | --- | --- |
| Toolbar | Title | `CSC148 · Recursion & tree traversal` |
| Toolbar | Time left | `31:48 left` (progress fill 29%) |
| Toolbar | Button | `End session` |
| Plan | Label | `Session plan` (drawn as caps) |
| Plan | Step 1, done | `Cold recall` |
| Plan | Step 2, current | `Re-read key slides`, meta `Slides 12–17 · 8 min` |
| Plan | Step 3 | `Explain it back` |
| Plan | Step 4 | `Practice questions` |
| Plan | Step 5 | `Flag what's fuzzy` |
| Material | Label | `Slide 14 of 32` (caps) |
| Material | Tabs | `Slides` (selected), `Transcript`, `Textbook §5.2` |
| Slide | Heading | `Preorder traversal` |
| Slide | Body | `Visit the root first, then recurse on each subtree, left to right.` |
| Slide | Code | see block below |
| Transcript moment | Time | `32:14` |
| Transcript moment | Quote | `“…and this is the part people lose marks on. If you forget the empty-tree check, every leaf calls into nothing. I will put a base-case question on the midterm.”` |
| Check | Question | `Why does preorder need the empty-tree check first?` |
| Check | Button | `Next step` |
| Chat | Label | `Ask about this lecture` (caps) |
| Chat | User message | `Is postorder just preorder backwards? For A2 I need to delete subtrees.` |
| Chat | Answer, paragraph 1 | `Not quite. Reversing preorder gives root-last, but it also flips the order of the children, so it isn't postorder.` |
| Chat | Answer, paragraph 2 | `For deleting, postorder is the right call: you remove the children before the parent, so nothing points into freed nodes. Prof. Liu makes the same point at 41:05.` |
| Chat | Source chips | `Slide 17`, `Transcript 41:05`, `A2 handout §3`, `docs.python.org` |
| Chat | Follow-ups | `Quiz me on this`, `Add to study guide` |
| Composer | Placeholder | `Ask anything about Lecture 8…` |
| Composer | Modes | `Quick · Nano` (selected), `Deep · Ultra` |

Slide code, exact whitespace (4-space indents, 8 spaces before the comment):

```python
def preorder(self) -> list:
    if self.is_empty():        # base case
        return []
    items = [self._root]
    for subtree in self._subtrees:
        items.extend(subtree.preorder())
    return items
```

### Facts the content implies

- Session length is 45 minutes. 31:48 left means 13:12 elapsed, and 13:12 / 45:00 = 29.3%, which matches the 29% fill (`round(29%, 1px)` of 160px = 46px). Today lists the same block as `10:30–11:15am` and `After-lecture · 45m`.
- The lecture is CSC148 Lecture 8, taught by Prof. Liu. Practice (`IT-0`) cites the same sources: "Lecture 8 slides · Slide 17" and "Lecture 8 transcript · 41:05". Keep the sample data consistent with both screens.
- Slide 14 sits inside the current step's range (12–17). Slide 17 (cited in chat) is postorder traversal, per Practice.
- The transcript quote is an exam hint ("I will put a base-case question on the midterm").

### Sample data sketch (inferred, not drawn)

Step durations other than step 2 are not drawn. A split that sums to 45 minutes and fits 13:12 elapsed: Cold recall 5 min, Re-read key slides 8 min, Explain it back 10 min, Practice questions 15 min, Flag what's fuzzy 7 min.

```ts
const session = {
  course: "CSC148",
  title: "Recursion & tree traversal",
  lecture: { number: 8, professor: "Prof. Liu", slideCount: 32 },
  durationMin: 45,
  elapsedSec: 792, // 13:12
  steps: [
    { title: "Cold recall", minutes: 5, status: "done" },
    { title: "Re-read key slides", minutes: 8, status: "current", slides: [12, 17] },
    { title: "Explain it back", minutes: 10, status: "upcoming" },
    { title: "Practice questions", minutes: 15, status: "upcoming" },
    { title: "Flag what's fuzzy", minutes: 7, status: "upcoming" },
  ],
  material: { tab: "slides", slide: 14, textbookSection: "§5.2" },
  moment: { at: "32:14", examHint: true, quote: "…and this is the part people lose marks on. …" },
  check: "Why does preorder need the empty-tree check first?",
  mode: "quick",
};
```

## 2. Layout skeleton

```
1440 x 900, background --color-page, no page scroll
+--------------------------------------------------------------------------------------+
| padding 28 top / 40 sides / 32 bottom                                                |
| Toolbar  h32  [title .................................. progress 160 | 31:48 left | End session] |
| gap 24                                                                               |
| Body h784  row, gap 40                                                               |
|  Plan 240      | Material flex (680 @1440)                  | Chat 360               |
|  label 28      | header 28: label ........ tabs             | label 22               |
|  gap 12        | gap 24                                     | gap 24                 |
|  steps 228     | slide card 328                             | messages flex (620)    |
|                | gap 24                                     |   scrolls              |
|                | transcript moment 72                       | gap 24                 |
|                | gap 24                                     | composer 94 (pinned)   |
|                | check row 49                               |                        |
+--------------------------------------------------------------------------------------+
```

### Containers

| Container | Measured style |
| --- | --- |
| Root | 1440×900, `display:flex; flex-direction:column; overflow:clip`, bg `--color-page`, font `--font-sans`, antialiased, `font-synthesis:none`, `overflow-wrap:anywhere` |
| Main | `flex:1; min-height:0; flex-direction:column; gap:24px; padding:28px 40px 32px` |
| Toolbar | height 32, `flex-shrink:0; align-items:center; justify-content:space-between` |
| Toolbar title group | `align-items:center; gap:8px` (one child) |
| Toolbar controls | `align-items:center; gap:12px`; progress group inside also `gap:12px` |
| Body | `flex:1; min-height:0; display:flex; gap:40px` (row) |
| Plan column | width 240, `flex-shrink:0; flex-direction:column; gap:12px` |
| Steps list | `flex-direction:column; gap:4px` |
| Material column | `flex:1 1 0; min-width:0; flex-direction:column; gap:24px` |
| Material header | height 28, `flex-shrink:0; align-items:center; justify-content:space-between` |
| Chat column | width 360, `flex-shrink:0; flex-direction:column; gap:24px` |
| Chat header | `flex-direction:column; gap:4px; padding-top:6px; align-items:start` (22 tall) |
| Messages | `flex:1 1 0; min-height:0; flex-direction:column; gap:20px` |
| Answer block | `flex-direction:column; gap:12px` |
| Composer | see components |

### Measured boxes at 1440×900

| Box | x | y | w | h |
| --- | --- | --- | --- | --- |
| Toolbar | 40 | 28 | 1360 | 32 |
| Title text | 40 | 32 | 313 | 24 |
| Controls (progress 232 + gap 12 + button 101) | 1055 | 28 | 345 | 32 |
| Body | 40 | 84 | 1360 | 784 |
| Plan column | 40 | 84 | 240 | 784 (content 268) |
| Material column | 320 | 84 | 680 | 784 (content 549) |
| Slide card | 320 | 136 | 680 | 328 |
| Transcript moment | 320 | 488 | 680 | 72 |
| Check row | 320 | 584 | 680 | 49 |
| Chat column | 1040 | 84 | 360 | 784 |
| Messages | 1040 | 130 | 360 | 620 |
| Composer | 1040 | 774 | 360 | 94 |

### Alignment notes

- The three section labels share one baseline: each text box starts 6px below the body top (plan label has `padding-block:6px`, the material label is centered in a 28px row, the chat header has `padding-top:6px`).
- Content below the labels starts at different heights: steps at body +40, slide card at +52, first chat message at +46. See section 6.
- The material column is the only flexible width. At 1440 it is 680px. At 1280 it would be 520px.

### Scroll behavior

- The page does not scroll. Root is `100dvh`, Main and Body use `min-height:0`.
- The chat Messages region is the scroll container (`ScrollArea`). The composer stays pinned at the bottom of the chat column. New messages scroll the region to the bottom unless the user has scrolled up.
- The material column fits at 549 of 784px with the Slides tab. Transcript and Textbook tabs will overflow, so the viewer area below the material header must scroll on its own. The material header (label and tabs) stays fixed. Proposal: the transcript moment and check row stay pinned below the scrolling viewer, so the next-step action is always visible.
- The plan column uses 268 of 784px. Give it `overflow-y:auto` for plans with more steps.

## 3. Components

All text is `--font-sans` (Timeless Sans) unless noted. No component has a shadow.

| Component | Structure | Typography | Colors | Radius / border | Size and spacing | shadcn mapping |
| --- | --- | --- | --- | --- | --- | --- |
| Session title | `h1`, one line | 20/24 420, tracking -0.02em | text `--color-ink` | none | 313×24 at this content | custom |
| Pomodoro progress | track > fill | n/a | track `--color-control`, fill `--color-ink` | `999px` on both, track `overflow:clip` | track 160×4, fill width = elapsed % | Progress |
| Time left | text, `font-feature-settings:"tnum"`, `width:max-content` | 13/16 420 | `--color-graphite` | none | 12px gap after track | custom (part of timer) |
| End session | button, one label | 13/16 420 | bg `--color-control`, text `--color-ink` | `--radius-sm` (6), no border | padding 8 15, height 32, width 101 | Button `variant="secondary"` |
| Section label | text: "Session plan", "Slide 14 of 32", "Ask about this lecture" | 13/16 420, caps | `--color-graphite` | none | plan: `padding-block:6px`; chat: `padding-top:6px` | custom |
| Plan step row | row: badge + text column | title 13/16 (420, or 500 when current); meta 13/16 420 | see states | badge 6px | row `padding-block:8px; gap:12px`; badge 24×24 centered; text column `padding-top:4px`; rows 40 tall, current row 52 | custom (`ol` of buttons) |
| Step badge | 24×24 box, number or check icon | 13/16 420 number | see states | 6px, outline variant has 1px `--color-border` | check icon 12px, stroke 1.75 | custom |
| Source tabs | tab list, 3 tabs | 13/16; selected 500, others 420 | selected bg `--color-control` + text `--color-ink`; others transparent + `--color-graphite` | `--radius-sm` | list gap 4; tab padding 6 12, height 28; widths 60, 84, 107 | Tabs (Base UI), list has no background |
| Slide card | column: heading, body, code | heading 20/24 420, tracking -0.02em; body 13/20 420 | bg `--color-page`, text `--color-ink` | 6px, 1px `--color-border` | padding 32, gap 16, inner width 614 | Card (no shadow, custom padding) |
| Code block | `pre > code`, `white-space:pre`, `width:max-content` | `--font-mono` 13/22 420 (`"wght" 420`) | bg `--color-fill`, text `--color-ink`, comment same color | 4px, no border | padding 16 20, 7 lines = 154 tall, block 186 | custom |
| Transcript moment | row: timestamp + quote column | 13/20 420 both | bg `--color-fill`; time `--color-graphite`; quote `--color-ink` | 6px, no border | padding 16 20, gap 16; time fixed 40 wide; quote column gap 4; 72 tall | custom (button or `figure`/`blockquote`) |
| Check row | top rule, question left, button right | question 13/20 500 | rule `--color-rule`, text `--color-ink` | 1px top border | `padding-top:16px`, gap 24, `space-between`, centered | Separator + custom |
| Next step | label + chevron | 13/16 420 | bg `--color-ink`, text and icon `--color-page` | `--radius-sm` | padding 8, left 15, right 13; gap 8; chevron 12px stroke 2; height 32, width 106 | Button default, trailing icon |
| User message | right-aligned bubble (`justify-content:end`) | 13/20 420 | bg `--color-fill`, text `--color-ink` | 6px | `max-width:280px`, padding 10 14 | custom |
| Answer | plain paragraphs, no bubble | 13/20 420 | `--color-ink` | none | paragraph gap 12 | custom |
| Source chip | label + chevron, wraps | 13/16 420 | text `--color-ink`, chevron `--color-graphite`, transparent bg | 4px, 1px `--color-border` | padding 3, left 7, right 5; gap 4; height 24; chip row `flex-wrap` gap 4 | Badge `variant="outline"` rendered as a link or button |
| Follow-up action | button | 13/16 420 | bg `--color-control`, text `--color-ink` | `--radius-sm` | padding 6 12, height 28, row gap 8 | Button `variant="secondary" size="sm"` |
| Composer | column: textarea, footer row | placeholder 13/20 420 | border `--color-border`, placeholder `--color-graphite`, bg page | 6px, 1px | padding 14, gap 12, inner 330 wide; footer `space-between`, centered; 94 tall | InputGroup with Textarea, or custom wrapper + Textarea |
| Mode switch | 2 segments | 13/16; selected 500, other 420 | selected bg `--color-control` + `--color-ink`; other transparent + `--color-graphite` | `--radius-sm` | gap 2; segment padding 4 10, height 24; group 190 wide | ToggleGroup (single) |
| Send | icon button | n/a | bg `--color-ink`, icon `--color-page` | `999px` | 32×32, arrow-up 14px, stroke 1.5 | Button `size="icon"`, rounded-full |
| Messages region | scroll area | n/a | n/a | none | flex 1, 620 tall at 900 | ScrollArea |
| End-session confirm (proposal) | dialog | 13/20 body, 20/24 title | page, ink | `--radius-md` | n/a | AlertDialog |

### Icons

| Use | Paper path | Size | Stroke | Color | Lucide equivalent |
| --- | --- | --- | --- | --- | --- |
| Done step | `M3 8.5l3 3 7-7` | 12 | 1.75 | `--color-ink` | Check |
| Next step, source chips | `M6 3l5 5-5 5` | 12 | 2 | page (button), graphite (chips) | ChevronRight |
| Send | `M8 13V3M3.5 7.5L8 3l4.5 4.5` | 14 | 1.5 | `--color-page` | ArrowUp |

All icons use a 16×16 viewBox with round caps and joins. Use the app's `components/icons.tsx` if it already has these paths.

## 4. States

"Seen" means drawn in the artboard. "Inferred" means a proposal.

| Element | State | How it is drawn | Carried by more than color? | Source |
| --- | --- | --- | --- | --- |
| Plan step | Done | Badge bg `--color-fill`, no border, check icon `--color-ink`. Title `--color-graphite` 420. No meta line. | Yes: check glyph replaces the number. | Seen (step 1) |
| Plan step | Current | Badge bg `--color-ink`, number `--color-page`. Title `--color-ink` 500. Meta line `--color-graphite` 420 (`Slides 12–17 · 8 min`). | Yes: filled badge, heavier title, extra meta line. Add `aria-current="step"`. | Seen (step 2) |
| Plan step | Upcoming | Badge transparent, 1px `--color-border`, number `--color-graphite`. Title `--color-ink` 420. | Yes: outline badge and number. | Seen (steps 3 to 5) |
| Plan step | Skipped / missed | Outline badge with the number in `--color-graphite`, title `--color-graphite`, meta `Skipped`. | Yes: the word "Skipped". | Inferred |
| Plan step | Hover / focus | Row bg `--color-wash`, `--radius-sm`, padding unchanged. Focus: 2px `--color-ink` outline, offset 2 (app default). | Focus ring is shape. | Inferred |
| Timer | Running | Track `--color-control`, fill `--color-ink` at elapsed %, `31:48 left` in graphite tabular figures. | Yes: text countdown. | Seen |
| Timer | Paused | Fill keeps its width. Label reads `Paused · 31:48 left`. Needs a Pause control (see section 6). | Yes: the word "Paused". | Inferred |
| Timer | Break | Pomodoro break between steps. Fill resets and counts the break. Label `Break · 4:12 left`. | Yes: the word "Break". | Inferred |
| Timer | Time up | Fill full. Label `Time's up` in `--color-ink` 500. The Next step button reads `Finish session`. | Yes: text and weight. | Inferred |
| Source tab | Selected | bg `--color-control`, `--color-ink` 500. | Yes: weight and fill shape. Use `role="tab"` with `aria-selected`. | Seen (Slides) |
| Source tab | Unselected | transparent, `--color-graphite` 420. | n/a | Seen |
| Source tab | Hover | Text `--color-ink`, bg `--color-wash`. | No (affordance only). | Inferred |
| Source tab | Unavailable | Tab hidden when the step has no source of that kind (for example no textbook mapped). Do not show a disabled tab. | n/a | Inferred |
| Material header label | Per tab | Slides: `Slide 14 of 32`. Transcript: `Transcript · 32:14`. Textbook: `Textbook §5.2 · p. 214` (page number invented for sample data). | Text | Inferred |
| Material viewer | Loading | Slide card shell with 1px border; heading and body as `--color-fill` blocks 24 and 20 tall; no shimmer if reduced motion. | Shape | Inferred |
| Transcript moment | Exam hint | Drawn as a plain fill card. Lecture notes marks the same kind of line with a second line `Flagged · on Term Test 2` (13/16 500 ink). Proposal: add `Flagged · on the midterm` under the quote. | Yes, with the proposed label. | Inferred |
| Transcript moment | Hover / focus | bg `--color-control`. Click opens the Transcript tab at 32:14. | Shape on focus. | Inferred |
| Check row | Active | Question 500 ink, Next step primary. | n/a | Seen |
| Check row | Last step | Button label `Finish session`. | Text | Inferred |
| Chat | Conversation | User bubble right, answer left as plain text, sources and follow-ups under the answer. | Yes: position and bubble. | Seen |
| Chat | Empty | Messages region shows 2 or 3 suggested questions as secondary buttons (13/16 420, `--color-control`), drawn from the current step, for example `Why does preorder visit the root first?`. | Text | Inferred |
| Chat | Streaming | Answer text appears in place. A single `--color-graphite` line `Thinking…` (Quick) or `Reading Lecture 8, slides and A2 handout…` (Deep) before the first token. Source chips and follow-ups appear only when the answer is complete. | Text | Inferred |
| Chat | Error | Under the user bubble: `Couldn't answer. Try again.` in graphite, with a secondary `Retry` button (size sm). | Text | Inferred |
| Chat | Spending cap reached | `lib/spend.ts` returns HTTP 402 kind `budget` once the $30 cap is used. Show `Cue's $30 model budget is used up.` in graphite above the composer. Textarea and Send disabled. | Text | Inferred |
| Mode switch | Quick selected | Segment bg `--color-control`, ink 500. | Weight and fill. Use `aria-pressed` or radio semantics. | Seen |
| Mode switch | Deep selected | Mirror of Quick. | Same | Inferred |
| Mode switch | Disabled | Both segments graphite, no fill, when the cap is reached. | Text notice explains it. | Inferred |
| Send | Ready | Ink circle, page arrow. | Shape | Seen (drawn as ready even with empty input) |
| Send | Empty input | bg `--color-control`, arrow `--color-graphite`, `disabled`. | Color only; the empty field is the cue. | Inferred |
| Send | Streaming | Same circle with a 10×10 page square (stop). `aria-label="Stop"`. | Glyph | Inferred |
| Source chip | Hover | bg `--color-wash` (matches app `.option:hover`). | No | Inferred |
| Source chip | External | `docs.python.org` should use an up-right arrow and open a new tab. Internal chips keep the chevron. | Glyph | Inferred |
| Follow-up | Done | `Add to study guide` becomes `Added to study guide` with a 12px check, not clickable. | Text and glyph | Inferred |
| Secondary buttons | Hover / active | bg `--color-border` (app `.button:hover`). | No | Inferred, from app CSS |
| Primary buttons | Hover | Slightly lighter ink. The app uses `#2c2c2a` today with no token. Add a token. | No | Inferred, from app CSS |

## 5. Interactions

### What each control does

| Control | Action |
| --- | --- |
| End session | Opens an AlertDialog: `End this session?` with what is left (`3 steps left · 31:48`). Confirm saves progress (completed steps, flagged items, chat) and returns to Today. Cancel closes. |
| Timer | Counts down every second from the session length. When the current step's time runs out, nothing jumps; the step meta switches to `Over by 1 min` in graphite. Do not announce every tick to screen readers: render the text with `aria-live="off"` and announce at 5 minutes left and at time up. |
| Plan step | Jumps to that step. The material viewer opens that step's source and range. Done steps stay reviewable. |
| Source tabs | Switch the viewer between Slides, Transcript and Textbook for the current step. The header label changes per tab (section 4). |
| Slide viewer | Shows one slide. The design has no previous/next slide control (section 6). Proposal: left and right arrow keys, plus small chevron icon buttons beside `Slide 14 of 32`. |
| Transcript moment | Opens the Transcript tab scrolled to 32:14 with that line highlighted. |
| Next step | Marks the current step done and makes the next step current. The check question is a self-test prompt; it needs no answer field. Proposal: clicking the question sends it to the chat as a Quick question. |
| Chat composer | Sends the question with the selected mode. Context is this lecture: slides, transcript, textbook section, course handouts. |
| Quick · Nano / Deep · Ultra | Picks the model role for the next question. Quick uses the fast role (low latency, thinking off). Deep uses Ultra (thinking on, slower, more costly). Remember the choice per session. |
| Source chip | `Slide 17` opens the Slides tab at slide 17. `Transcript 41:05` opens the Transcript tab at 41:05. `A2 handout §3` opens the handout (a fourth viewer tab, or a Dialog). `docs.python.org` opens the web page in a new tab. |
| Quiz me on this | Generates one practice question from this answer and shows it inline in the chat, with a link to Practice. |
| Add to study guide | Saves the answer and its sources to the course study guide. Confirms in place (section 4). |

### Keyboard (proposal)

| Key | Where | Effect |
| --- | --- | --- |
| Tab | everywhere | Order: End session, plan steps, tabs, viewer, transcript moment, Next step, messages, composer, mode switch, Send. |
| ↑ / ↓ | plan list | Move focus between steps (roving tabindex). Enter or Space jumps to the step. |
| ← / → | tab list | Move between tabs (Base UI Tabs default). |
| ← / → | slide viewer focused | Previous / next slide. |
| / | anywhere outside a text field | Focus the composer. |
| Enter / Shift+Enter | composer | Send / new line. Ignore Enter during IME composition. |
| Esc | composer | Blur the composer. Esc while streaming stops the answer. |
| ← / → | mode switch | Move between Quick and Deep. |
| N | outside a text field | Next step. |
| P | outside a text field | Pause or resume the timer (needs the Pause control). |

Single-letter shortcuts must not fire while focus is in an input, textarea or contenteditable.

### Responsive (proposal)

| Width | Layout |
| --- | --- |
| ≥ 1280 | As designed. Material is the only flexible column (680 at 1440, 520 at 1280). |
| 1024 to 1279 | Plan column becomes a horizontal step strip under the toolbar: five 24px badges with gap 8, then the current step title and meta in one line. Body is two columns: material flex, chat 320. Gap 32. At 1024 the material gets 944 − 320 − 32 = 592px. |
| 768 to 1023 | Side padding 24. Material takes the full width. Chat moves into a right Sheet (400 wide) opened by an `Ask` secondary button in the toolbar. The composer lives in the Sheet. |
| 375 | Side padding 16. Toolbar wraps to two rows: title (one line, truncates with ellipsis, full text in `title`) with End session as a 32px secondary button; then the progress track at full width with `31:48 left` right-aligned. Plan collapses to one line `Step 2 of 5 · Re-read key slides` that opens a Drawer with all steps. Tabs scroll horizontally if needed. Slide card padding 20. The code block keeps `white-space:pre` and scrolls horizontally inside the card; do not wrap code. The transcript moment keeps the 40px time column. The check row stacks: question, then a full-width Next step. Chat opens in a bottom Drawer from an `Ask` button. The composer textarea uses 16px on touch devices so iOS does not zoom. Respect `env(safe-area-inset-bottom)` under the composer. |

## 6. Inconsistencies and flags

1. **No pause control.** The Pomodoro timer has no pause, unlike Lecture notes, which shows `Pause` next to its progress bar. A Pomodoro timer needs pause and a break state. Proposal: a secondary `Pause` button (padding 8 15, height 32) between the timer and End session, matching Lecture notes.
2. **No Pomodoro structure.** The bar shows one 45-minute block. There is no work/break split or cycle count. Decide whether the plan steps are the Pomodoro intervals or whether breaks sit between steps.
3. **End session weight differs from Lecture notes.** Study session draws End session as secondary (`--color-control`). Lecture notes draws `End and save notes` as primary (`--color-ink`). Probably intentional (Next step is the primary action here), but confirm.
4. **Transcript moment differs from the Lecture notes transcript line.** Here: padding 16/20, time column 40px, no tabular figures, no flag label. Lecture notes flagged line: padding 12/16, time column 44px, `font-feature-settings:"tnum"`, and a `Flagged · on Term Test 2` line in 500. The quote here is an exam hint, so it should carry the same flag line. Use one shared transcript-line component with tnum.
5. **Section content starts at three different heights.** Steps start 40px below the body top, the slide card 52px, the first chat message 46px. The chat header is 22px tall (`padding-top:6px` only) while the other headers are 28px. Making the chat header `padding-block:6px` (28px) lines the chat up with the material column.
6. **Weight 420 has no token in Paper.** Paper's tokens define `--font-weight-regular: 400` and `--font-weight-medium: 500`, but every regular text node uses 420. The app already maps this as `--weight-regular: 420`. Keep the app token; do not use the Paper 400 token.
7. **Title tracking has no matching Paper token.** Titles use `-0.02em`; Paper's `--tracking-tight` is `-0.03em`. The app has `--tracking-display: -0.02em`. Use the app token.
8. **Radii outside the token set.** 6px is hardcoded on the step badge, slide card, transcript card, bubble and composer (equal to `--radius-sm`, so use the token). 4px on the code block and source chips has no token. 999px on the progress and Send is `--radius-full` hardcoded.
9. **Odd paddings.** End session and Next step use 15px inline padding (Next step 15 left, 13 right). Source chips use 7 left, 5 right plus a 1px border. These are optical adjustments for borders or trailing icons. Keep them exact; do not round to the spacing scale.
10. **Third font.** The code block uses `--font-mono` "Paper Mono" at weight 420. Paper Mono is not in the app. The app's `--font-mono` is a system stack (`ui-monospace, "SF Mono", …`). Line-height 22px is unique to this block. Decide whether to ship a webfont mono or accept the system stack; the judge comparison will differ either way.
11. **Root font size 12px.** The artboard root sets 12px/16px, but no text inherits it: every text node sets 13px. Only 13px and 20px appear on this screen, which matches the Cue style. Do not use 12px anywhere.
12. **Icon strokes differ.** Check 1.75, chevron 2, arrow-up 1.5. Normalize or keep per icon on purpose.
13. **External source chip.** `docs.python.org` uses the same chevron as in-app sources, although it leaves the app. Use an up-right arrow for external links.
14. **Model naming.** The mode switch says `Quick · Nano`. The app's fast role is Nemotron Lightning (`lib/llm.ts`), and Nano is priced in `lib/spend.ts` but not wired as a role. Pick one model for Quick and make the label match.
15. **Send looks ready with an empty field.** The composer shows its placeholder and an active Send button. Disable Send when the field is empty (section 4).
16. **No slide navigation.** `Slide 14 of 32` implies paging, but no previous/next control is drawn.
17. **Today's materials list does not match the tabs.** Today's next-up card lists `Lecture 8 slides`, `Lecture 8 transcript`, `Lab 6 handout` and `+ 12 practice Qs`. The session shows Slides, Transcript and `Textbook §5.2`, and the chat cites `A2 handout §3`. Practice cites `Course notes · §5.3`. Align the sample data so the same session lists the same sources everywhere.
18. **Colors.** Only grayscale tokens are used (`page`, `ink`, `graphite`, `rule`, `fill`, `border`, `control`; `wash` only in proposed hovers). No accent, highlight or course color appears, which fits the shared style. The app's primary hover `#2c2c2a` is a raw hex and breaks the "OKLCH only, no hex" check; it needs a token.
19. **No app sidebar.** Study session, Lecture notes and Practice are full-bleed. Today shows the app sidebar. Treat Study session as a focus route without the sidebar and keep End session as the way out. *Superseded 2026-10-28: every screen, these three included, has the same sidebar, collapsible to its icon rail with the toggle above Data or Cmd/Ctrl+B; collapsing gives the screen its full width.*
