# Calendar: implementation spec

Source: Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens". All px values come from `get_jsx` and `get_computed_styles`. Screenshots were used only to check them.

| Artboard | Size | What it shows |
| --- | --- | --- |
| `9F-0` "03 Week calendar" | 1440×1376 | Week view, full 24-hour grid, no scroll. |
| `1CG-0` "Week calendar, 900px viewport, opens at 8am" | 1440×900 | Same week, hours body clipped to 700 and scrolled 360px. |
| `10F-1` "Day calendar" | 1440×1376 | Day view for Tue 27, full grid. |
| `1N1-1` "Day calendar, 900px viewport, opens at 8am" | 1440×900 | Same day, clipped and scrolled like the week. |
| `T4-1` "03c Month calendar" | 1440×900 | October 2026 month grid. |

None of the five artboards draws the app sidebar. `docs/design/today.md` section 7 resolves this: Calendar is a browse screen and renders inside the 1208px main column next to the 232px sidebar. Every width below is measured at 1440 without the sidebar. Columns are flex, so they shrink inside the shell (week columns go from about 187 to about 154).

## 1. Purpose and content

Calendar shows the student's real schedule and the study time Cue planned around it. Lectures come from an uploaded course schedule or calendar. Deadlines and tests sit at the top of each day. Cue fills the gaps with study blocks: a review soon after each lecture, mid-week reviews, work blocks before a deadline, numbered prep series before a test, and a Saturday end-of-week review. The student reads the week at a glance, steps through days, weeks and months, and opens any block. A study block leads into a Study session. A lecture leads into the Lecture notes taker.

### Sample clock

Today is Tuesday 27 October 2026. The current block is `Review · Recursion` (10:30 to 11:15am), so use 10:40am. Today's card on the Today artboard says `Next up` for the same block; see flag 22.

### Courses (from lecture blocks)

| Course | Lectures | Room |
| --- | --- | --- |
| CSC148 | Mon, Wed, Fri 10–11am | BA 1160 |
| MAT137 | Tue, Thu 9–10am | MP 102 |
| ECO101 | Wed 1–2pm | SS 2102 |
| PSY100 | Mon, Fri 2–3pm | MS 2158 |

### Week of Mon 26 Oct to Sun 1 Nov (week and day artboards)

Strings are verbatim. Times use an en dash (U+2013). Separators are a spaced middle dot (U+00B7). The course column comes from Paper layer names; the blocks themselves do not print it.

| Day | Kind | Title | Second line | Start | End | Course |
| --- | --- | --- | --- | --- | --- | --- |
| Mon 26 | lecture | `CSC148 Lecture` | `10–11am · BA 1160` | 10:00 | 11:00 | CSC148 |
| Mon 26 | study | `Review · Trees` | `11:15am–12pm` | 11:15 | 12:00 | CSC148 |
| Mon 26 | lecture | `PSY100 Lecture` | `2–3pm · MS 2158` | 14:00 | 15:00 | PSY100 |
| Mon 26 | study | `Review · Memory` | none (30 min) | 15:00 | 15:30 | PSY100 |
| Tue 27 | lecture | `MAT137 Lecture` | `9–10am · MP 102` | 09:00 | 10:00 | MAT137 |
| Tue 27 | study (current) | `Review · Recursion` | `10:30–11:15am · now` | 10:30 | 11:15 | CSC148 |
| Tue 27 | study | `Mid-week · PSY` | none (30 min) | 14:00 | 14:30 | PSY100 |
| Tue 27 | study | `Work block · PS4` | `7–9pm` | 19:00 | 21:00 | ECO101 |
| Wed 28 | deadline | `CSC148 A2 due 11:59pm` | | all-day row | | CSC148 |
| Wed 28 | lecture | `CSC148 Lecture` | `10–11am · BA 1160` | 10:00 | 11:00 | CSC148 |
| Wed 28 | study | `Review · Lec 9` | `11:15am–12pm` | 11:15 | 12:00 | CSC148 |
| Wed 28 | lecture | `ECO101 Lecture` | `1–2pm · SS 2102` | 13:00 | 14:00 | ECO101 |
| Wed 28 | study | `Review · Elasticity` | none (30 min) | 14:00 | 14:30 | ECO101 |
| Wed 28 | study | `A2 final push` | `6–8pm` | 18:00 | 20:00 | CSC148 |
| Thu 29 | deadline | `ECO101 PS4 due 5pm` | | all-day row | | ECO101 |
| Thu 29 | lecture | `MAT137 Lecture` | `9–10am · MP 102` | 09:00 | 10:00 | MAT137 |
| Thu 29 | study | `Review · By parts` | `10:15–11am` | 10:15 | 11:00 | MAT137 |
| Thu 29 | study | `Mid-week · CSC` | `4–4:45pm` | 16:00 | 16:45 | CSC148 |
| Fri 30 | deadline | `PSY100 quiz due 12pm` | | all-day row | | PSY100 |
| Fri 30 | lecture | `CSC148 Lecture` | `10–11am · BA 1160` | 10:00 | 11:00 | CSC148 |
| Fri 30 | lecture | `PSY100 Lecture` | `2–3pm · MS 2158` | 14:00 | 15:00 | PSY100 |
| Fri 30 | study | `Review · Ch. 8` | none (30 min) | 15:00 | 15:30 | PSY100 |
| Sat 31 | study | `End-of-week review` | `11am–12:30pm` | 11:00 | 12:30 | all |
| Sun 1 | study | `Test 2 prep · 1 of 4` | `1–2pm` | 13:00 | 14:00 | MAT137 |
| Sun 1 | study | `Midterm prep · 3 of 6` | `3–5pm`, then note `Past paper, timed` | 15:00 | 17:00 | CSC148 |

The Today artboard confirms the 30-minute lengths (`Mid-week · 30m`) and the topics: MAT137 lecture "Integration by parts", CSC148 review "Recursion & tree traversal", PSY100 "Memory & learning", ECO101 "Problem Set 4".

### October 2026 (month artboard)

The grid starts on Monday and shows Sep 28 to Nov 1 in five rows. The month shows deadlines, tests, study blocks and notes. It shows no lectures.

| Date | Items, top to bottom (`[d]` = outlined deadline or test chip, `[s]` = filled study chip, `[n]` = plain note) |
| --- | --- |
| Sep 28, 29, 30 | none (outside month, dimmed). Labels `Sep 28`, `29`, `30`. |
| Thu Oct 1 | label `Oct 1`. [s] `Review · Lists` |
| Fri 2 | [d] `PSY100 quiz 1 due 12pm`, [s] `Review · Ch. 3` |
| Sat 3 | [s] `End-of-week review` |
| Sun 4 | none |
| Mon 5 | [s] `Review · Lec 5` |
| Tue 6 | [s] `Review · Limits` |
| Wed 7 | [d] `CSC148 A1 due 11:59pm`, [s] `Review · Supply` |
| Thu 8 | [s] `Mid-week · CSC` |
| Fri 9 | [d] `MAT137 PS3 due 5pm`, [s] `Review · Ch. 4` |
| Sat 10 | [s] `End-of-week review` |
| Sun 11 | none |
| Mon 12 | [n] `Thanksgiving · no class` |
| Tue 13 | [s] `Review · Lec 6` |
| Wed 14 | [s] `Review · Demand`, [s] `Mid-week · PSY` |
| Thu 15 | [d] `ECO101 PS3 due 5pm`, [s] `Review · Chain rule` |
| Fri 16 | [s] `Review · Lec 7` |
| Sat 17 | [s] `End-of-week review` |
| Sun 18 | [s] `Test 1 prep · 1 of 3` |
| Mon 19 | [s] `Test 1 prep · 2 of 3`, [s] `Review · Lec 8` |
| Tue 20 | [s] `Test 1 prep · 3 of 3` |
| Wed 21 | [d] `MAT137 test 1 at 6pm`, [s] `Review · Elasticity` |
| Thu 22 | [s] `Mid-week · CSC` |
| Fri 23 | [d] `PSY100 quiz 2 due 12pm`, [s] `Review · Ch. 7` |
| Sat 24 | [s] `End-of-week review` |
| Sun 25 | none |
| Mon 26 | [s] `Review · Trees`, [s] `Review · Memory` |
| Tue 27 (today) | [s] `Review · Recursion · now`, [s] `Mid-week · PSY`, `+1 more` |
| Wed 28 | [d] `CSC148 A2 due 11:59pm`, [s] `Review · Lec 9`, `+2 more` |
| Thu 29 | [d] `ECO101 PS4 due 5pm`, [s] `Review · By parts`, [s] `Mid-week · CSC` |
| Fri 30 | [d] `PSY100 quiz due 12pm`, [s] `Review · Ch. 8` |
| Sat 31 | [s] `End-of-week review` |
| Sun Nov 1 | label `Nov 1` (dimmed). [s] `Test 2 prep · 1 of 4`, [s] `Midterm prep · 3 of 6` |

### Text patterns a builder should generate

- Time ranges: drop `:00`, lowercase `am`/`pm` with no space, and write the meridiem once when both ends share it: `9–10am`, `10:30–11:15am`, `4–4:45pm`. Write it twice when they differ: `11:15am–12pm`, `11am–12:30pm`.
- Lecture: title `{COURSE} Lecture`, meta `{time} · {room}`.
- Study titles: `Review · {topic}`, `Mid-week · {SHORT}` (PSY, CSC), `Work block · {assignment}`, `{Test} prep · {n} of {N}`, free titles (`A2 final push`, `End-of-week review`).
- Deadline: `{COURSE} {item} due {time}`. Test: `{COURSE} test {n} at {time}`.
- The current block appends ` · now` to its time line (week, day) or title (month).
- Note: free text on a third line (`Past paper, timed`).
- Period label: `{Month} {year}` (`October 2026`) in all three views.
- Weekday labels: `Mon` to `Sun`, uppercased by CSS.

## 2. Layout skeleton

### Week view (`9F-0`, `1CG-0`)

```
Calendar main  flex column, padding 28 top / 40 inline / 32 bottom, gap 8
├ Toolbar        height 32, flex, space-between, align center
│ ├ Period label   "October 2026"
│ └ Controls       flex, gap 12: View select · Today · Arrows (gap 2)
└ Week grid      flex column, 1360 wide
  ├ Day header     height 40, bottom 1px --color-rule, align center
  │                gutter 52 fixed, then 7 cells flex 1 (186.86 each)
  ├ Due row        height 36, bottom 1px --color-rule, align center
  │                gutter 52 (stretch), then 7 cells flex 1, padding 0 4 0 5
  └ Hours body     position relative, height 1200 (full) or fills viewport
    ├ Hour lines     absolute layer, 23 lines
    ├ Hour labels    gutter 52, absolute labels
    └ Day columns    7 × flex 1, border-left 1px --color-rule, position relative
```

- Vertical column rules exist only in the hours body. The day header and due row have no vertical rules.
- There is no rule at 12am (the due row's bottom border sits there) and none at the bottom. The last column has no right border.
- Day header cell: `display: flex; align-items: baseline; justify-content: center; gap: 6px`.
- Toolbar controls widths: View select 80 (`Week`), 70 (`Day`), 86 (`Month`); Today 66; Arrows 66. The group is right-aligned, so only the select's left edge moves when the label changes.
- Grid top edge: y 68 (28 padding + 32 toolbar + 8 gap). Day header text baseline group centers at y 88.

### Hour grid math

- 50px per hour. 24 hours = 1200px. `pxPerMinute = 50 / 60`.
- Hour line `h` (1 to 23): `top = h * 50`, `left: 52px; right: 0; height: 1px`, `--color-rule`.
- Hour label `h`: `top = h * 50 - 8`, `left: 0`, 13/16, so the label's center sits on its line. Labels run `1am` to `11pm`, with `12pm` at noon. Midnight is unlabeled.
- Event block: `position: absolute; left: 4px; right: 4px; top = startMinutes * 50 / 60`.
- Event height: `durationMinutes * 50 / 60 - 4`. The 4px gap separates back-to-back blocks (lecture 10:00 to 11:00 is 500 to 546; the next block starts at 550).
- Measured heights: 60 min 46, 120 min 96, 90 min 72 (formula 71), 45 min 40 (formula 33.5), 30 min 28 (formula 21). Short blocks are drawn taller so their text fits. Rule to implement: `height = max(minHeight, duration * 50 / 60 - 4)`, where `minHeight` is 40 for a two-line block and 28 for a one-line block. A 45-minute block may then overlap the next 4px gap by up to 6px. That is acceptable.
- Two-line or one-line: show the time line when the block lasts 45 minutes or more. Blocks of 30 minutes or less show the title only, in a 28px block. This matches every drawn block.
- Block width at 1440: column 186.86, minus 1 border, minus 8 = 177.86. Inside the shell: about 145.

### Viewport variants and scrolling (`1CG-0`, `1N1-1`)

- Toolbar, day header and due row stay fixed. Only the hours body scrolls. Gutter labels scroll with the grid.
- Measured: hours body `height: 700px; overflow: clip`. The lines layer, labels and columns all sit at `top: -360px`. That equals `scrollTop = 360`.
- 360 is 8am (400) minus 40. The 8am line sits 40px below the top of the scroll area and its label at 32 to 48. The visible range is 7:12am to 9:12pm.
- Build it as a scroll container: `flex: 1 1 0; min-height: 0; overflow-y: auto`, with the 1200px grid inside. On mount set `scrollTop = 8 * 50 - 40`. Do it before first paint (layout effect), with no smooth scrolling.
- At 900 tall the space left for the hours body is 724 (900 − 28 − 32 − 32 − 8 − 40 − 36), not 700. The drawn version leaves 24px empty under the grid; see flag 15.
- Proposal: when today is in range and now is outside the visible window, scroll so the now line sits 120px below the top. Otherwise use 8am.

### Day view (`10F-1`, `1N1-1`)

Same frame, toolbar, gutter, hour math and scrolling as the week. Differences:

- One column, flex 1 (1308 at 1440). Blocks are 1299 wide.
- Day header: one centered cell, `TUE` plus the today badge. It centers over the column (x 746), not over the full 1360.
- Due row: 36 tall with an empty placeholder cell (`padding-left: 10px; height: 16px`). Tuesday has no deadline, so nothing is drawn. Proposal: when there are deadlines, lay chips out in a row from the left, hugging their text, gap 4, with `padding-left: 5px` so chips align with the blocks below (flag 16).
- Blocks center their text vertically (`justify-content: center`, no block padding) instead of top-aligning (flag 4).

### Month view (`T4-1`)

```
Artboard       flex column, padding 28 top / 40 inline / 32 bottom, gap 24
├ Toolbar        same as week, View select reads "Month" (86 wide)
└ Month grid     flex 1, min-height 0, flex column, border-top 1px --color-ink
  ├ Weekday header  height 40, bottom 1px --color-rule, align center
  │                 7 cells flex 1, padding-left 10
  └ 5 week rows     each flex 1 (148.6 at 900), bottom 1px --color-rule
    └ 7 cells       flex 1, flex column, padding 6 block / 4 inline, gap 3
                    border-left 1px --color-rule on cells 2 to 7
      ├ Date line     padding 0 6 2 (left/right 6, bottom 2), 18 tall
      └ Items         chips 20 tall, then optional "+N more" (16 tall)
```

- No outer left or right border. The grid fills the viewport; it does not scroll.
- Grid top is at y 84 (28 + 32 + 24), 16px lower than week and day (flag 10).
- Lanes: weekday labels, date numbers and the `+N more` text share a left edge 10px inside each cell. Chip text sits at 11.
- Months that need six rows: rows shrink to about 124. That still fits the date plus four chips. Render five or six rows as the month requires.
- Cells do not clip in the design. Proposal: `overflow: hidden` on the cell and `min-width: 0` on chips, with single-line ellipsis.

## 3. Components

Type is size/line-height, weight, tracking, transform. Colors are Cue tokens. "Custom" means a plain element styled with tokens, wrapped in the shadcn primitive named where there is behavior.

| Component | Structure | Type | Colors | Radius | Border | shadcn |
| --- | --- | --- | --- | --- | --- | --- |
| Period label | `h1`, one line | 20/24, 420, -0.02em, none | text `--color-ink` | none | none | custom |
| View select | trigger: label + 12px chevron (`M3 4.5l3 3 3-3`, stroke 1.5), gap 8. Padding 8 block, 15 left, 11 right. 32 tall. | 13/16, 420, 0, none | text and chevron `--color-ink`, bg `--color-control` | 6 (`--radius-sm`) | none | Select (items Day, Week, Month) |
| Today button | label only, padding 8/15, 66×32 | 13/16, 420 | `--color-ink` on `--color-control` | 6 | none | Button (secondary) |
| Previous / Next | 32×32 circles, gap 2. 16px chevrons `M10 3L5 8l5 5` and `M6 3l5 5-5 5`, stroke 1.5, round caps and joins. | n/a | stroke `--color-ink`, bg none | 999 (`--radius-full`) | none | Button (ghost, icon size) + Tooltip |
| Day header cell (week, day) | weekday + date, baseline aligned, gap 6, centered | weekday 13/16, 420, 0.08em, uppercase. Date 13/16, 420. | weekday `--color-graphite`, today `--color-ink`. Date `--color-ink`, past day `--color-graphite`. | none | row bottom 1px `--color-rule` | custom (`columnheader`) |
| Today date badge | date in a box, padding 0 6, 16 tall (28 wide for `27`) | 13/16, 420 | text `--color-page` on `--color-ink` | 4 | none | custom (or Badge with a `today` variant) |
| Due row | 36 tall, gutter 52, cells flex 1 with padding 0 4 0 5 | n/a | none | none | bottom 1px `--color-rule` | custom |
| Deadline chip (week, day) | one line, padding 3/7, 24 tall, fills its cell | 13/16, 500 | `--color-ink` on `--color-page` | 4 | 1px `--color-border` | custom button, Popover trigger |
| Hour label | absolute text in the 52px gutter | 13/16, 420 | `--color-graphite` | none | none | custom |
| Hour line | absolute 1px bar | n/a | bg `--color-rule` | none | none | custom (decorative, `aria-hidden`) |
| Day column | flex 1, relative, 1200 tall | n/a | none | none | left 1px `--color-rule` | custom (`list` of events) |
| Lecture block | absolute, column: title, meta. Padding 3 top and bottom, 7 left, 8 right. Top-aligned in week. | title 13/16, 500. Meta 13/16, 420. | `--color-ink` on `--color-page` | 4 | 1px `--color-border` | custom button, Popover trigger |
| Study block, two lines | absolute, column: title, time, optional note. Padding 4/8. | title 13/16, 500. Time 13/16, 420. Note 13/16, 420, 4px top padding. | text `--color-ink` on `--color-fill`. Note `--color-graphite`. | 4 | none | custom button, Popover trigger |
| Study block, one line | 28 tall, title only, padding 4/8 | 13/16, 500 | `--color-ink` on `--color-fill` | 4 | none | custom button |
| Month weekday header | 40 tall, cells padding-left 10, left-aligned | 13/16, 420, 0.08em, uppercase | `--color-graphite`, today's weekday `--color-ink` | none | bottom 1px `--color-rule`, grid top 1px `--color-ink` | custom (`columnheader`) |
| Month cell | column, padding 6/4, gap 3. Date line padding 0 6 2. | date 13/16, 420 | date `--color-ink`. Outside month `#B9B9B3` (no token, flag 7). | none | left 1px `--color-rule` (cells 2 to 7), row bottom 1px `--color-rule` | custom (`gridcell`) |
| Month today badge | wrapper padding 0 2 2, badge padding 0 6 | 13/16, 420 | `#FFFFFF` (use `--color-page`) on `--color-ink` | 4 | none | custom |
| Month study chip | one line, padding 2/7, 20 tall, full cell width | 12/16, 500 | `--color-ink` on `--color-fill` | 4 | none | custom button |
| Month deadline or test chip | one line, padding 1/6, 20 tall | 12/16, 500 | `--color-ink` on `--color-page` | 4 | 1px `#D6D6D0` (use `--color-border`) | custom button |
| Month note | plain text, padding 0 6 | 12/16, 420 | `--color-graphite` | none | none | custom |
| `+N more` | plain text, padding 0 6, 16 tall | 12/16, 420 | `--color-graphite` | none | none | Button (ghost, text only) + Popover |

Proposed components (not drawn) are specified in section 5: now line, event popovers, Add schedule button and dialog, empty state, hours ScrollArea.

Tokens used: `--color-page`, `--color-ink`, `--color-graphite`, `--color-rule`, `--color-fill`, `--color-border`, `--color-control`. `--color-wash` is unused in the design and is the proposed hover color. Course colors (`--color-course-*`), `--color-highlight` and `--color-ballpoint` are unused. Keep the calendar grayscale.

## 4. States

"Not color only" says whether something besides color tells the state apart.

| State | Where | How it is drawn | Not color only |
| --- | --- | --- | --- |
| Lecture | week, day | Outlined block: page bg, 1px `--color-border`. Title ends in `Lecture`. | Yes: outline vs fill, and the word |
| Study block | week, day, month | Filled block: `--color-fill`, no border | Yes: fill vs outline |
| Deadline | week/day all-day row, month | Outlined chip, same treatment as a lecture. Text contains `due`. | Yes: placement in the all-day row, and the word |
| Test | month | Same outlined chip. Text `test 1 at 6pm`. | Yes: the word |
| No class (holiday) | month | Plain graphite text, no chip | Yes: no chip, and the words |
| Current day | all views | Week, day: weekday label turns ink, date sits in an ink badge. Month: date badge, and the weekday column header turns ink. | Yes: the badge shape |
| Past day | week only | Date number turns graphite (`Mon 26`). Month does not dim past days. | No (flag 6) |
| Outside month | month | Date in `#B9B9B3`. First date of each month adds its month name (`Sep 28`, `Oct 1`, `Nov 1`). | Partly: only the first date has the month name |
| Current block ("now") | week, day, month | ` · now` appended to the time line or month chip | Yes: text |
| Short block | week, day | 28px, title only | n/a (a size variant) |
| Block with a note | week | Third line in graphite | n/a |
| Month overflow | month | Two items, then `+N more` in graphite | Yes: text |
| Now line | not drawn | Proposal: 1px `--color-ink` line across today's column at `top = nowMinutes * 50 / 60`, with a 7px ink dot centered on the column's left rule. Above blocks (`z-index: 2`), `pointer-events: none`. Updates every minute. In day view it spans the one column. Month has no line; it keeps the ` · now` text. | Yes: a line and a dot |
| Hover | not drawn | Proposal: lecture and deadline chips bg `--color-wash`. Study blocks and chips bg `--color-control`. Select and Today bg `--color-border`. Arrow buttons bg `--color-wash`. These match `app/globals.css`. 120ms `background-color`, `var(--ease)`. `cursor: pointer`. | Hover is a hint only |
| Focus visible | not drawn | Global rule: 2px solid `--color-ink` outline, offset 2. On blocks use offset 1 so it stays inside the 4px gap. | Yes: outline |
| Selected (popover open) | not drawn | Proposal: lecture border becomes 1px `--color-ink`. Study block gets `box-shadow: inset 0 0 0 1px var(--color-ink)`. `aria-expanded="true"`. | Yes: an ink edge |
| Done | not drawn | Proposal: study block or chip text turns `--color-graphite`, bg `--color-wash`, a 12px check icon before the title, and ` · done` after the time. | Yes: icon and word |
| Missed | not drawn | Proposal: study block bg `--color-page`, 1px dashed `--color-border`, title graphite, ` · missed` after the time. Its popover leads with `Reschedule`. | Yes: dashed edge and word |
| Proposed (after import, before accept) | not drawn | Proposal: fill block with 1px dashed `--color-graphite` and ` · proposed`. Used only in the import preview. | Yes: dashed edge and word |
| Live lecture | not drawn | Proposal: lecture meta gets ` · now`. A 24×24 mic button shows at the block's top right without hover. | Yes: word and icon |
| Recording | not drawn | Proposal: ` · recording` replaces ` · now`. An 8px `--color-ink` dot before the title, the same dot as the Lecture notes `Recording` label. Pulse opacity 1 to 0.4 over 1.2s; static under reduced motion. | Yes: word and dot |
| Notes saved | not drawn | Proposal: a 12px file icon in graphite at the lecture block's top right, Tooltip `Notes saved`. Popover shows `Open notes` and, when present, `2 exam hints` linking into the notes. | Yes: icon |
| Empty (no schedule yet) | not drawn | See section 5, upload. The grid, lines and labels still render. | Yes: text |
| Empty day or week | drawn (Sun 25, Sat columns) | Nothing. No placeholder text. | n/a |
| Loading | not drawn | Data comes from IndexedDB and is near instant. Render the grid at once and fade blocks in over 160ms. No skeletons. During import, the dialog shows progress (section 5). | n/a |

## 5. Interactions

### Controls

- **View select.** Switches Day, Week, Month. Keep the focused date. Week shows the week containing it. Month shows its month. Put the view and date in the URL (`/calendar?view=week&date=2026-10-27`) so reload and back work.
- **Today.** Jumps to the period containing today and, in day or week, scrolls to the default position. Always enabled.
- **Previous / Next.** Move one period. Tooltip and `aria-label` name the unit: `Previous week`, `Next day`, `Next month`.
- **Period label.** Proposal: when a week spans two months, read `Oct – Nov 2026` (spaced en dash). Otherwise `October 2026` as drawn.
- **Week day header.** Click opens Day view for that date. **Month date number.** Same.
- **`+N more`.** Opens a Popover listing every item for that day, in the same order. A `View day` link at the bottom opens Day view.

### Event blocks and chips (proposal)

Every block and chip is a `button` that opens a Popover anchored to it: side right, align start, offset 8, flips left near the edge. Width 280, padding 16, radius 10 (`--radius-md`), bg `--color-page`, 1px `--color-border`, no shadow. Title 13/16, 500. Meta 13/20, 420, graphite. Actions are Buttons in a row, gap 8, at the bottom.

- **Study block.** Course chip (12/16, 500, `--color-fill`, radius 4, padding 3/7, as on Today), title, `Tue 27 Oct · 10:30–11:15am`, the plan line if any (`Past paper, timed`). Actions: `Start session` (primary: `--color-ink` bg, `--color-page` text) opens the Study session screen for this block. `Reschedule` (secondary) and `Mark done` (ghost).
- **Deadline chip.** `CSC148 A2`, `Due Wed 28 Oct, 11:59pm`. Lists the work blocks planned for it (`A2 final push · 6–8pm`). Action: `Plan more time`.
- **Lecture block.** See "Open the note taker" below.

Accessible names spell the block out: `CSC148 Lecture, Wednesday 28 October, 10 to 11am, BA 1160`.

### Not drawn: upload a schedule (proposal)

Entry points:

1. Toolbar. An `Add schedule` button is the first item in the Controls group, gap 12. Button (secondary): `--color-control` bg, 13/16 420 ink, padding 8 block, 13 left, 15 right, gap 8, 32 tall, leading 16px upload icon at stroke 1.5. It matches the Today button.
2. Empty state. With no events at all, the hours body shows a centered block over the empty grid, at the 8am position: title `Add your schedule` (20/24, 420, -0.02em), body `Upload a course timetable, a syllabus or an .ics file. Cue plans study time around it.` (13/20, graphite, max 40ch), then `Upload schedule` (primary) and `Use sample semester` (secondary), gap 8, 16 above. Month shows the same block centered in the grid.

Dialog (shadcn Dialog), width 560, padding 24, radius 10, title 20/24, description 13/20 graphite:

- Dropzone like `.dropzone` in `app/globals.css`: 1px dashed `--color-border`, radius 6, min height 200, centered text `Drop a timetable PDF, screenshot or .ics file`, then a `Choose file` button. While dragging: bg `--color-wash`, border `--color-graphite`. Accepts `.ics`, `.pdf`, `.png`, `.jpg`.
- Below a Separator: `Or subscribe by link`, an Input (32 tall, 1px `--color-border`, radius 6, padding 8/12) and `Add`.
- Reading: the dropzone is replaced by `Reading your schedule…` and an indeterminate Progress (2px, `--color-ink` on `--color-rule`). Nemotron vision parses images and PDFs.
- Preview: one row per course with a Checkbox, `CSC148 · Mon, Wed, Fri 10–11am · BA 1160`. Deadlines found in a syllabus are listed under their course. Footer: `Cancel` (secondary), `Add 4 courses` (primary).
- After commit: the dialog closes, the scheduler runs, and a Sonner toast says `Added 4 courses. Cue planned 14 study blocks.` with `Undo`. New blocks fade in over 160ms.
- Error: an inline line under the dropzone, warning icon plus `Couldn't read that file. Try a PDF or an .ics file.` in ink.

### Not drawn: open the note taker from a lecture (proposal)

- The lecture Popover shows the course chip, `CSC148 Lecture`, `Wed 28 Oct · 10–11am · BA 1160`, and the topic when known (`Lecture 9 · Recursion`).
- Primary action `Take notes`, with a 16px mic icon. It routes to Lecture notes for this lecture (`/notes/new?lecture={id}`). It opens the recorder ready to start and does not record until the student presses Start. The microphone permission prompt appears there, not in the calendar.
- After the lecture, when notes exist, the primary action reads `Open notes`. Before or during it reads `Take notes`.
- Shortcut on the block: a 24×24 ghost icon button with a 14px mic sits 4px inside the top-right corner. It shows on hover and focus, and always during a live lecture. `aria-label="Take notes for CSC148 Lecture"`. On touch it is hidden; the Popover covers it.
- In the month view lectures are not shown, so the note taker is reached from week, day, Today or the Lecture notes screen.

### Overlap handling (proposal; the design has no overlaps)

- Cue's scheduler never places study blocks over lectures or other fixed events. Overlaps come from imported calendars.
- Group a day's timed events into clusters that overlap in time. Touching events (one ends as the next starts) do not overlap.
- Assign lanes greedily by start time, fixed events first. With `n` lanes, each block is `width = (columnWidth - 1 - 8 - (n - 1) * 2) / n` and `left = 4 + i * (width + 2)`.
- Week: at most 3 lanes. A fourth overlapping event becomes a 28px `+N` chip in the third lane that opens a Popover. Day: at most 4 lanes.
- All text lines in blocks are single-line with ellipsis. The full text lives in the Popover and the accessible name.
- All-day row with several items: stack chips with gap 4. The row grows to `12 + n * 24 + (n - 1) * 4` for the busiest day of the week, up to two chips. A third or later item becomes `+N more` (13/16, graphite) under the second chip.
- Month order inside a cell: deadlines and tests first, then study blocks by start time, then notes. Show up to 3 items. With more than 3, show 2 and `+N more` (flag 12).

### Keyboard (proposal)

- `T` today. `D`, `W`, `M` switch views. `J` / `K` next and previous period. Ignore these while focus is in a text field or when a modifier is held. Show them in the control Tooltips (`Today · T`).
- Week and day: Tab enters the grid at the current block, or else the first block of the visible range, with a roving tabindex. `↑` / `↓` move to the previous or next block in the same day. `←` / `→` move to the nearest block by start time in the adjacent day, skipping empty days. `Home` / `End` go to the first or last block of the day. `Enter` or `Space` opens the Popover. `Esc` closes it and returns focus to the block.
- Month: the grid is `role="grid"`. Arrow keys move between dates, `Enter` opens Day view, and Tab moves into the focused cell's chips.
- Mark today's header with `aria-current="date"`. Give the hours scroll area `tabindex="0"` and `aria-label="Hours"` so it can be scrolled by keyboard.
- Initial scroll to 8am and view changes never animate under `prefers-reduced-motion: reduce`.

### Responsive (proposal)

The sidebar follows `docs/design/today.md`: docked at 1024 and up, a 56px icon rail from 768 to 1023, an off-canvas Sheet below 768.

| Width | Calendar changes |
| --- | --- |
| 1280 and up | As drawn inside the 1208 main column. Padding 40 inline. Week columns about 154. |
| 1024 to 1279 | Week columns get `min-width: 120px`. When 7 don't fit, the day header, due row and hours body scroll horizontally together, with the 52px gutter sticky on the left. Open with today as the first visible column. |
| 768 to 1023 | Main padding 40 inline (24 below 900). Same horizontal scroll rule. `Add schedule` collapses to a 32×32 icon button with a Tooltip. |
| below 768 | Default view is Day. Popovers become a bottom Drawer. |

At 375:

- Toolbar becomes two rows, gap 8, padding 16 top and 20 inline (Today's 375 spec uses 20). Row 1: SidebarTrigger (32), period label shortened to `Oct 2026` (20/24), then the arrows on the right. Row 2: View select (flex 1), Today, `Add schedule` icon button.
- Day: gutter 44 (labels like `10pm` are about 34 wide). Column 291. Same 50px hour and scroll behavior; the hours body fills to the bottom of the viewport.
- Week: renders as an agenda, not a grid. One section per day, header `TUE 27` in the caps style with the today badge, then deadline chips, then one row per event (time lane 64px, 13/16 graphite; title 13/16 500; lectures keep the outline and study blocks the fill). Empty days show `Nothing planned` in graphite.
- Month: 7 columns about 48 wide, cells 52 tall. Date 13/16, centered. Below the date, up to 3 marks 6px wide, gap 3: a filled `--color-graphite` dot for study, a 1px `--color-ink` ring for a deadline or test. Shape carries the type. Tapping a date selects it (ink badge) and lists its items below the grid as agenda rows.
- Touch targets: blocks shorter than 44px get an invisible hit area that grows up to 8px above and below, stopping at neighbors. Toolbar buttons are 40 tall at this width.

## 6. Inconsistencies and flags

1. **No sidebar.** All five artboards are 1440 with no sidebar. Today has one. Per `today.md` section 7, render Calendar inside the shell. Week columns shrink from about 187 to about 154. Record this for the screenshot judge.
2. **Blocks placed off their times.** `Review · Trees` (Mon) and `Review · Lec 9` (Wed) say `11:15am–12pm` but sit at top 550, which is 11:00. Correct is 562.5. Place blocks by their real times.
3. **Heights are not proportional below one hour.** 45 minutes is drawn 40 (formula 33.5). 30 minutes is drawn 28 (formula 21). 90 minutes is 72 (formula 71). Section 2 gives the rule that reproduces these.
4. **Block text alignment differs.** Week blocks top-align with padding (3/7/8 lecture, 4/8 study). Day blocks center vertically with no block padding, so `Work block · PS4` floats in the middle of 96px. Use the week treatment in both views; it also leaves room for the note line.
5. **End-of-week review is built differently.** The container has `padding: 4px 0` and `overflow: clip`. Its two lines carry `padding-left: 8px` and no right padding, so long text would run to the edge. Build it like every other study block.
6. **Past days.** Week dims the past date number (`26` in graphite) but not its weekday label. Month does not dim past dates at all. Pick one. Suggestion: no dimming in either; the today badge already marks the present.
7. **Outside-month color has no token and fails contrast.** `#B9B9B3` on white is about 2.0:1. Use `--color-graphite` (about 5.3:1) or add a named token and accept it as incidental text.
8. **Raw hex in the month artboard.** `#FFFFFF` (artboard bg and today badge text), `#D6D6D0` (deadline chip border), `#B9B9B3` (outside-month dates), `#00000000` (a transparent border). Map to `--color-page`, `--color-border`, flag 7, and nothing. `scripts/check-tokens.mjs` will reject the hex.
9. **12px text.** Month chips, notes and `+N more` use 12/16. Week and day use only 13 and 20. Paper defines `--text-xs: 12px` but `app/globals.css` does not. Keep 12 for month fidelity and add the token, or move month to 13 and accept tighter cells.
10. **Grid tops differ.** Week and day: gap 8 under the toolbar, no top rule, grid at y 68. Month: gap 24, a 1px `--color-ink` top rule, grid at y 84. Switching views moves the grid 16px. Either keep it (month reads as a separate sheet) or give all three the same top.
11. **Weekday header alignment.** Week centers weekday and date in each column. Month left-aligns weekday labels at 10px. Both work for their grids; note it so nobody "fixes" one to match the other.
12. **Month overflow rule.** Tue 27 has 3 items and shows 2 plus `+1 more`. Thu 29 has 3 items and shows all 3. Wed 28 has 4 and shows 2 plus `+2 more`. Use: up to 3 shown; above 3, show 2 plus `+N more`. Tuesday then shows all 3.
13. **Chip padding drift.** `Review · Recursion · now` uses padding 2/6; other study chips use 2/7. `End-of-week review` chips use a transparent 1px border with padding 1/6. All render about the same; normalize to 2/7 with no border.
14. **Month hides lectures.** Week and day show them; month shows none. This looks deliberate (fewer chips). Confirm, and keep it consistent with the month mobile dots.
15. **Viewport hours body is 24px short.** It is drawn at 700 where 724 fits in 900. Let it fill (`flex: 1`). Keep `scrollTop = 360`.
16. **Day-view due row inset.** Its empty cell uses `padding-left: 10px`. Week chips start 5px into the cell, matching blocks 4px inside the column plus the 1px rule. Use 5.
17. **Radius 4 has no token.** Blocks, chips and today badges use 4px. Tokens are 6, 10 and 999. Add `--radius-xs: 4px` (also flagged on Today).
18. **Weight and tracking tokens.** Weight 420 is not a Paper token (Paper has 400 and 500); the repo maps `--weight-regular: 420`. The period label uses -0.02em; Paper's `--tracking-tight` is -0.03em and unused. Use the repo's `--tracking-display`.
19. **Lectures and deadlines share one style.** Both are outlined 4px boxes with a 1px `--color-border` edge. Placement separates them in week and day. If lectures ever join the month view they will be indistinguishable from deadlines there.
20. **Period label for split weeks.** The week of Oct 26 to Nov 1 reads `October 2026`. See the proposal in section 5.
21. **No now line is drawn.** Only the ` · now` text marks the present. Section 4 proposes a line.
22. **Sample clock disagrees with Today.** Calendar labels `Review · Recursion` as `now`. Today's card calls the same block `Next up`. Choose one clock for the sample semester. This spec uses 10:40am.
23. **Sample data gaps.** `Midterm prep · 3 of 6` is on Nov 1, but parts 1 and 2 appear nowhere in October. Oct 30 says `PSY100 quiz due 12pm` while earlier quizzes are numbered (`quiz 1`, `quiz 2`); it should read `quiz 3`. `Review · Elasticity` appears on both Oct 21 and Oct 28. Study blocks never print their course; the course only lives in Paper layer names. Store the course on every block; the Popover shows it.
24. **Three ways to say "today".** Week and day use a badge plus an ink weekday. Month uses a badge plus an ink weekday column header, and its badge wrapper has 2px inline padding instead of 6, so the number sits 2px right of the date lane. Small; reproduce for fidelity or align the number to the lane.
