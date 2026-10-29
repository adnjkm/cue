# Today: implementation spec

Source: Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens", artboard `1-0` "01 Today", 1440×900. Every px value below comes from `get_jsx` and `get_computed_styles` (token hash `cb3d59f1`), read on 2026-10-27. Paper was only read. Anything marked **Proposal** is not in the design.

Today is the only artboard drawn with the app sidebar. Section 3.1 specifies the sidebar in full. Section 7 proposes how it lives next to the full-width screens.

## 1. Purpose and content

Today is the home screen. It answers one question when a student opens Cue: what do I do now? A sentence says how many study sessions are on today and which one to start with. A second sentence says why Cue ordered the day this way. The next session sits in a card with its materials and a Start button. Below it, a short timeline lists every block on today's calendar: lectures, plus the study blocks Cue scheduled around them. The sidebar leads to every other feature.

### Content shown (verbatim)

Sidebar:
- Wordmark `cue`, then the mascot (a smiling sphere). Layer name: "Mascot (animated in the app: cue-mascot-wave.svg)".
- Nav, in order: `Today` (active), `Calendar`, `Study sessions`, `Lecture notes`, `Practice`, `Study guides`.

Header:
- Headline: `Three sessions today. Start with recursion.`
- Subline: `Your CSC148 midterm is in 10 days, so Cue moved this morning's review up. Everything you need is already pulled from yesterday's lecture.` It wraps to two lines at its 560px max width.

Next-up card:
- Course chip `CSC148`.
- Meta line `Next up · 10:30–11:15am · Review 1 day after lecture`.
- Title `Recursion & tree traversal`.
- Material chips `Lecture 8 slides`, `Lecture 8 transcript`, `Lab 6 handout`, then the borderless link `+ 12 practice Qs`.
- Button `Start session` with a right arrow.

Timeline:
- Section label `Today` (drawn uppercase by CSS) and summary `4 blocks · 3h 15m of study`.

| Time | Course | Title | Trailing | Row state |
| --- | --- | --- | --- | --- |
| `9am` | `MAT137` | `Lecture — Integration by parts` | 6px dot + `Transcript ready` | past lecture |
| `10:30am` | `CSC148` | `Review — Recursion & tree traversal` | `After-lecture · 45m` | next up, emphasised |
| `2pm` | `PSY100` | `Mid-week review — Memory & learning` | `Mid-week · 30m` | upcoming |
| `7pm` | `ECO101` | `Work block — Problem Set 4` | `Due Thu · 2h` | upcoming |

*Superseded 2026-10-29: the app places mid-week reviews on Wednesday, not on Paper's Tuesday and Thursday, so Tue 27 has no `Mid-week review` row. The sample day reads `Two sessions today. Start with recursion.` and `3 blocks · 2h 45m of study`.*

### Facts the content implies

- The clock reads between 10:00 and 10:30 on Tuesday 27 October 2026. The 9am lecture is over and has a transcript. The 10:30 review is next. Use 10:12am (America/Toronto, UTC-4) as the sample "now".
- `4 blocks` counts the lecture. `3h 15m of study` counts only the three Cue-scheduled blocks (45m + 30m + 2h). `Three sessions` in the headline counts the same three. So: blocks = every calendar item today; sessions = Cue-scheduled items; study time = sum of their durations.
- Row title pattern: `{kind label} — {topic}`. Kind labels seen: `Lecture`, `Review`, `Mid-week review`, `Work block`.
- Trailing text for study blocks: `{reason} · {duration}`. Reasons seen: `After-lecture` (spaced review the day after a lecture), `Mid-week` (weekly review), `Due Thu` (work block before a deadline). Lectures show transcript status instead.
- Card meta pattern: `Next up · {start}–{end} · {reason sentence}`. The card title is the topic alone, without the kind label.
- Time format: `9am`, `10:30am`, `2pm`. Lowercase, no space, minutes only when not on the hour. Ranges share one suffix: `10:30–11:15am` (en dash). Durations: `45m`, `2h`, `3h 15m`.
- The headline and subline read as generated text. Headline pattern: `{count in words} sessions today. Start with {next topic, short, lowercase}.` Subline: why the order changed, then where the materials came from.
- "Yesterday's lecture" is CSC148 Lecture 8 on Monday 26 October. The midterm "in 10 days" falls on Friday 6 November 2026.
- The week calendar artboard (`9F-0`) agrees with this day: MAT137 lecture Tue 9 to 10am in MP 102; Review · Recursion Tue 10:30 to 11:15am; Mid-week · PSY Tue 2pm; Work block · PS4 Tue 7 to 9pm; ECO101 PS4 due Thu 5pm; CSC148 lecture Mon 10 to 11am in BA 1160.
- Other artboards name instructors: Prof. Liu (CSC148), Prof. Chen (MAT137), Prof. Okafor (ECO101). Reuse them so screens agree.

### Sample data sketch

Field names are illustrative. The data model owns the real ones.

```ts
const now = "2026-10-27T10:12:00-04:00";
const today = [
  { course: "MAT137", kind: "lecture", topic: "Integration by parts",
    start: "09:00", end: "10:00", location: "MP 102", transcript: "ready" },
  { course: "CSC148", kind: "review", reason: "after-lecture", topic: "Recursion & tree traversal",
    start: "10:30", end: "11:15", source: "CSC148 Lecture 8 (Mon 26 Oct)",
    materials: ["Lecture 8 slides", "Lecture 8 transcript", "Lab 6 handout"], practiceCount: 12 },
  { course: "PSY100", kind: "weekly-review", reason: "mid-week", topic: "Memory & learning",
    start: "14:00", end: "14:30" },
  { course: "ECO101", kind: "work-block", reason: "deadline", topic: "Problem Set 4",
    start: "19:00", end: "21:00", due: "2026-10-29T17:00:00-04:00" },
];
const brief = {
  headline: "Three sessions today. Start with recursion.",
  subline: "Your CSC148 midterm is in 10 days, so Cue moved this morning's review up. Everything you need is already pulled from yesterday's lecture.",
};
```

## 2. Layout skeleton

```
Root 1440 × 900, bg --color-page, flex row, overflow clip
┌ Sidebar 232 ──┬ Main 1208 ─────────────────────────────────────────────┐
│ pad 28 top    │ pad 61 top, 56 right, 48 bottom, 80 left               │
│ 20 inline     │ flex column, gap 40, content width 1072 (x 312..1384)  │
│ 24 bottom     │                                                        │
│ border-right  │  Header        1072 × 128 (fixed height, 98 used)      │
│ 1px rule      │  gap 40                                                │
│               │  Next-up card  1072 × 152                              │
│ wordmark 26   │  gap 40                                                │
│ gap 36        │  Timeline      1072 × 235 (header 31 + 4 rows × 51)    │
│ nav 6 × 34    │                                                        │
│ gap 2         │  empty from y 656 to 900                               │
└───────────────┴────────────────────────────────────────────────────────┘
```

### Containers

| Region | Measured |
| --- | --- |
| Root | 1440×900, `display: flex` (row), bg `--color-page`, `overflow: clip`. |
| Sidebar | width 232, `flex-shrink: 0`, height 100%. Flex column, `justify-content: space-between` (only one child, so it has no effect yet). Padding 28 top, 20 inline, 24 bottom. `border-right: 1px solid --color-rule`. Inner width 191 (232 minus 40 padding minus 1 border). |
| Sidebar top group | Flex column, gap 36: wordmark row, then nav. 191×276. |
| Main | width 1208, `flex-shrink: 0`. Flex column, gap 40. Padding 61 top, 56 right, 48 bottom, 80 left. Content width 1072. |
| Header | Flex column, gap 14, fixed height 128. Headline `max-width: 700`, subline `max-width: 560`. Content is 98 tall (40 + 14 + 44), so 30px sits empty below the subline. |
| Next-up card | 1072×152. 1px `--color-border`, radius `--radius-md` (10), `overflow: clip`, flex. One inner row: `flex: 1`, `align-items: end`, `justify-content: space-between`, gap 32, padding 24 block, 28 inline. |
| Card left column | Flex column, gap 14. Width 490 (driven by the chip row). Rows: meta (22), title (24), materials (28). |
| Timeline | Flex column, no gap. Header row then 4 rows. |
| Timeline header | Flex, `align-items: baseline`, `justify-content: space-between`. Padding-bottom 12. `border-bottom: 1px solid --color-ink`. Height 31. |
| Timeline row | Flex, `align-items: center`. Padding 14 block, 0 inline. `border-bottom: 1px solid --color-rule`. Height 51 (the 22px course chip is the tallest cell). |

### Measured boxes at 1440×900

| Element | x | y | w × h |
| --- | --- | --- | --- |
| Wordmark row | 20 | 28 | 191 × 26 (padding 0 8; text `cue` 33×24 at x 28, mascot 26×26 at x 69) |
| Nav item 1 to 6 | 20 | 90, 126, 162, 198, 234, 270 | 191 × 34 each |
| Nav icon / label | icon x 30, label x 58 | | icon 16 × 16 |
| Headline | 312 | 61 | 700 × 40 |
| Subline | 312 | 115 | 560 × 44 |
| Next-up card | 312 | 229 | 1072 × 152 |
| Card course chip | 341 | 254 | 61 × 22 |
| Card meta text | 412 | 256 | 305 × 18 |
| Card title | 341 | 290 | 490 × 24 |
| Card materials row | 341 | 328 | 490 × 28 |
| Start session button | 1227 | 324 | 128 × 32 |
| Timeline header | 312 | 421 | 1072 × 31 |
| Rows 1 to 4 | 312 | 452, 503, 554, 605 | 1072 × 51 each |

Timeline lanes (fixed widths, `flex-shrink: 0`, so columns line up across rows):

| Lane | x range | Width |
| --- | --- | --- |
| Time | 312 to 408 | 96 |
| Course chip slot | 408 to 492 | 84 (chip hugs its text inside it, left aligned) |
| Title | 492 to 1204 | `flex: 1 1 0%` (712 at this width) |
| Trailing | 1204 to 1384 | 180, right aligned |

### Alignment notes

- The card's bottom edge aligns its two columns (`align-items: end`). The Start button (32 tall) and the material chips (28 tall) share a bottom line at y 356. They are not centre aligned.
- In the materials row the bordered chips have 26px of content (3 + 18 + 3 + 2 border). The borderless `+ 12 practice Qs` is 28 tall (5 + 18 + 5). The row stretches all four to 28, and each chip centres its text.
- Wordmark text starts at x 28. Nav icons start at x 30. See flag 15.

### Scroll behavior

The artboard clips at 900 and content ends at y 656, so nothing scrolls at 1440×900.

**Proposal:** the sidebar is `position: sticky; top: 0; height: 100dvh` and never scrolls with the page. Its content is 304px tall, so it needs no scroll area of its own. The main column scrolls with the document. A long day makes the timeline grow; do not put it in an inner ScrollArea.

## 3. Components

Type is written as size/line-height, weight, tracking, transform. Font is `--font-sans` (Timeless Sans) everywhere.

| Component | Structure | Type | Colors | Radius, border | shadcn |
| --- | --- | --- | --- | --- | --- |
| App sidebar | `nav` column: wordmark row, nav list. See 3.1. | | bg `--color-page` | right 1px `--color-rule` | Sidebar |
| Headline | `h1`, max-width 700 | 32/40, 420, -0.02em, none | `--color-ink` | | custom |
| Subline | `p`, max-width 560 | 15/22, 420, 0, none | `--color-graphite` | | custom |
| Next-up card | `section`, one inner flex row, padding 24/28, gap 32 | | bg `--color-page` | `--radius-md` (10), 1px `--color-border`, no shadow | Card (strip shadow and default padding) |
| Course chip | text in a box, padding 3 block, 7 inline. 22 tall. | 12/16, 500, 0, none | text `--color-ink`, bg `--color-fill` | 4px, no border | Badge (secondary variant, overridden) |
| Card meta line | text after the chip, gap 10 | 13/18, 420, 0, none | `--color-graphite` | | custom |
| Card title | `h2` | 20/24, 420, -0.01em, none | `--color-ink` | | custom |
| Material chip | link, padding 3 block, 8 inline, gap 6 (reserved for an icon, none drawn), stretched to 28 tall | 13/18, 420, 0, none | text `--color-ink`, bg none | 4px, 1px `--color-border` | Button (outline variant, custom `chip` size) |
| More-practice link | `+ 12 practice Qs`, padding 5 block, 10 inline, 28 tall | 13/18, 420, 0, none | `--color-graphite` | none | Button (ghost variant, `chip` size) |
| Start session button | label + 12px arrow, gap 8, padding 8 block, 15 inline. 128×32. | 13/16, 500, 0, none | bg `--color-ink`, label and arrow `#FFFFFF` (use `--color-page`, flag 6) | `--radius-sm` (6), none | Button (default variant) |
| Arrow icon | 12×12, 24 viewBox, stroke 2.5, round caps and joins | | stroke as label | | lucide `ArrowRight` |
| Timeline section label | `h2` text "Today" | 13/18, 420, `--tracking-caps` (0.08em), uppercase | `--color-graphite` | | custom |
| Timeline summary | right side of the header | 13/18, 420, 0, none | `--color-graphite` | | custom |
| Timeline header rule | border under the header | | `--color-ink` | bottom 1px | none (border, not Separator) |
| Timeline row | `li` holding one link; four lanes (96 / 84 / flex / 180) | | | bottom 1px `--color-rule` | custom |
| Row time | lane 1 | 13/18, 420 (current row: 500), 0, none | `--color-graphite` (current row: `--color-ink`) | | custom (`time` element) |
| Row course chip | same as Course chip, inside the 84px lane | 12/16, 500 | ink on `--color-fill` | 4px | Badge |
| Row title | lane 3 | 15/20, 420 (current row: 500), 0, none | `--color-ink` | | custom |
| Row trailing meta | lane 4, `text-align: right` | 13/18, 420, 0, none | `--color-graphite` | | custom |
| Status dot | 6×6 circle, gap 6 before its label, group right aligned | | bg `--color-graphite` | `--radius-full` | custom |

shadcn overrides worth stating up front:
- **Button** default `h-9` and `text-sm` do not match. Primary here is 32 tall, 13px, padding 15 inline, radius 6. Add a `chip` size: 28 tall, 13/18, padding 8 inline (outline) or 10 inline (ghost), radius 4.
- **Badge** defaults to a pill and `text-xs` with its own padding. Here it is radius 4, padding 3/7, 12/16 at 500, bg `--color-fill`, text `--color-ink`.
- **Card** defaults add a shadow, `rounded-xl` and `py-6 gap-6`. Remove the shadow. Use radius 10 and padding 24/28.

### 3.1 Sidebar in full

Container: 232 wide, full viewport height, bg `--color-page`, `border-right: 1px solid --color-rule`. Padding 28 top, 20 inline, 24 bottom. Flex column with `justify-content: space-between`. Only the top group exists, which suggests a footer slot was planned (flag 14).

Top group: flex column, gap 36.

**Wordmark row.** Flex, `align-items: center`, gap 8, padding 0 8. Two children:
- `cue` text: 20/24, weight 500, -0.02em, `--color-ink`. Box 33×24. Make it a link to Today with `aria-label="Cue, Today"`.
- Mascot SVG, 26×26, `viewBox="10 8 100 102"`, `flex-shrink: 0`, decorative (`aria-hidden`). Parts, back to front:
  - Shadow ellipse cx 60, cy 107, rx 30, ry 3, fill ink at 8% opacity.
  - Body circle cx 60, cy 58, r 48, radial gradient (cx 38%, cy 32%, r 70%): stop 0 `#FFFFFF`, stop 0.6 `#F6F6F3`, stop 1 `#D6D6D0`. These equal `--color-page`, `--color-wash`, `--color-border`.
  - Highlight ellipse cx 42, cy 34, rx 10, ry 6, `rotate(-30 42 34)`, white at 90% opacity.
  - Eyes: ellipses at (47, 54) and (73, 54), rx 4.5, ry 6.5, fill ink.
  - Smile: `M47 66 A13 13 0 0 0 73 66`, no fill, stroke ink, width 5, round caps.
  - In code, use token variables for every fill and `useId()` for the gradient id so two mascots on a page do not clash.

**Nav list.** `ul`, flex column, gap 2. Six items, each 191×34.

| Part | Measured |
| --- | --- |
| Item box | Flex, `align-items: center`, gap 12, padding 9 block, 10 inline, radius `--radius-sm` (6). |
| Icon | 16×16, 24 viewBox, stroke 2, round caps and joins, `flex-shrink: 0`. Visual stroke is 1.33px. |
| Label | 13/16, no tracking, no transform. |
| Inactive | No background. Icon stroke and label `--color-graphite`. Label weight 420. |
| Active (Today) | Background `--color-wash`. Icon stroke and label `--color-ink`. Label weight 500. |

Icons and their lucide match:

| Item | Drawn | lucide-react | Match |
| --- | --- | --- | --- |
| Today | circle r 4 plus eight rays | `Sun` | exact |
| Calendar | rect 3,4 18×18 rx 2, two posts, one bar at y 10 | `Calendar` | exact |
| Study sessions | open book, two pages | `BookOpen` | close (hand-drawn variant of the older path, no centre spine line) |
| Lecture notes | mic capsule 6×12 rx 3, stand, base | `Mic` | close (older lucide path with the `M8 22h8` base) |
| Practice | tick over an open square | `SquareCheckBig` (formerly `CheckSquare`) | exact to the older path |
| Study guides | page with folded corner, two text lines (8 and 5 long) | `FileText` | close (lucide has three lines) |
| Start session arrow | shaft plus head `M13 6l6 6-6 6` | `ArrowRight` | close (head drawn 1 unit smaller) |

Render lucide at `size={16}` and `strokeWidth={2}` to match. lucide-react is not installed yet; the shadcn init adds it. The repo's `components/icons.tsx` draws 16-unit icons at stroke 1.5, which reads heavier (flag 18).

**shadcn Sidebar mapping.** `SidebarProvider` with `--sidebar-width: 232px`. `Sidebar` (`collapsible="offcanvas"` on desktop, see section 7), `SidebarHeader` for the wordmark, `SidebarContent` > `SidebarGroup` > `SidebarMenu` > `SidebarMenuItem` > `SidebarMenuButton isActive` rendered as a Next `Link` (the Base UI flavour uses the `render` prop, not `asChild`). `SidebarFooter` for the empty bottom slot. Theme variables: `--sidebar` = page, `--sidebar-foreground` = graphite, `--sidebar-accent` = wash, `--sidebar-accent-foreground` = ink, `--sidebar-border` = rule, `--sidebar-ring` = ink. Overrides: menu gap 2 (default 4), button height 34 (default 32), padding 9/10, gap 12 (default 8), text 13/16 (default 14), radius 6, active weight 500, inactive weight 420. Remove the default group padding so the container's 28/20/24 is the only padding.

## 4. States

"Measured" means drawn on an artboard. Everything else is a proposal.

| State | Where | How it is drawn | Carried by more than color? |
| --- | --- | --- | --- |
| Active (measured) | Nav item | bg `--color-wash`, ink icon and label, label 500 | Yes: background block and weight. Add `aria-current="page"`. |
| Inactive (measured) | Nav item | no bg, graphite icon and label, 420 | Baseline |
| Hover (proposal) | Nav item | bg `--color-wash`, icon and label ink, weight stays 420. 120ms `--ease` | Background appears |
| Pressed (proposal) | Nav item | bg `--color-fill` | Background |
| Focus visible (proposal) | All controls | 2px solid `--color-ink` outline, offset 2. Already global in `app/globals.css`. | Outline |
| Live badge (proposal) | Nav item `Lecture notes` while recording | 8px ink dot plus `Recording` 13/16 500 ink at the right edge (same dot as the Lecture notes toolbar) | Yes: the word |
| Timer badge (proposal) | Nav item `Study sessions` while a session runs | `31:48` 13/16 420 graphite, tabular numbers, right edge | Yes: the time |
| Next up (measured) | One timeline row | time 500 ink, title 500 ink. Other rows: time 420 graphite, title 420 ink. | Yes: weight. Add `aria-current="time"` or visually hidden "Next". |
| Upcoming (measured) | Rows 3 and 4 | Default row | Baseline |
| Past lecture with transcript (measured) | Row 1 | 6px graphite dot + `Transcript ready` | Yes: the words |
| In progress (proposal) | Row and card | Row emphasised as next up, trailing `In progress · 31:48 left` (tabular). Card meta `In progress · 31:48 left`, button `Resume session`. | Yes: words |
| Done (proposal) | Study row | Trailing `Done · 45m`. Title stays ink so it stays readable. | Yes: the word |
| Missed (proposal) | Study row whose end passed with no session | Trailing `Missed ·` then a `Reschedule` text link (graphite, underline on hover). | Yes: the word |
| Lecture upcoming (proposal) | Lecture row | Trailing `Record notes` text link, graphite. The plan says a lecture offers the note taker. | Words |
| Lecture live (proposal) | Lecture row during its slot | Not recording: `Now · Record notes`. Recording: 8px ink dot + `Recording` 13/16 500 ink. | Words |
| Transcribing (proposal) | Lecture row after it ends | `Transcribing…` graphite, no dot | Words |
| Flagged hints (proposal) | Lecture row | `Transcript ready · 2 exam hints` | Words |
| Hover (proposal) | Timeline row | bg `--color-wash` across the full row, no layout shift | Background |
| Hover (proposal) | Material chip | bg `--color-wash`, border stays `--color-border` | Background |
| Hover (proposal) | Start session | bg `color-mix(in oklch, var(--color-ink) 88%, var(--color-page))` | Shade |
| Pressed (proposal) | Buttons and chips | `scale(0.98)`, 100ms | Motion |
| Loading (proposal) | Whole page | Local data loads fast. Show Skeleton only after 150ms: headline bar 520×32, subline bars 560×14 and 420×14, card keeps its border with three bars, four row bars. Bars `--color-fill`, radius 6. Header keeps its 128px so nothing shifts. | Shape |
| Generated text pending (proposal) | Headline, subline | Render rule-based text first (count and next topic from local data), then swap the subline when the model returns. No spinner. | n/a |
| No calendar yet (proposal) | First run | Headline `Add your schedule to plan today.` Subline `Upload a course timetable or any calendar file. Cue fits study sessions around it.` Card becomes an Empty with `Upload calendar` (primary) and `Try the sample semester` (secondary, `--color-control` bg). Timeline hidden. | Words |
| Nothing today (proposal) | Empty day | Headline `Nothing scheduled today.` Card shows the next future session (`Next up · Wed 11:15am–12pm · …`). Timeline summary `0 blocks`, one row `No lectures or study blocks today` 13/18 graphite. | Words |
| All done (proposal) | Day finished | Headline `All three sessions done.` Card shows tomorrow's first session with `Start early`. | Words |
| Model error (proposal) | Headline | Keep the rule-based text. Do not show an error on Today. | n/a |

Selected, recording and flagged states from other screens appear here only as the row and nav labels above.

## 5. Interactions, keyboard, responsive

### What each control does

Route names are a **proposal**; `docs/architecture.md` decides the real ones.

| Control | Action |
| --- | --- |
| Wordmark | Go to Today (`/`). |
| Nav items | `/`, `/calendar`, `/study`, `/lectures`, `/practice`, `/guides`. |
| Start session | Create or resume the session record for this block, then open the Study session screen (`/study/[sessionId]`). |
| Material chip | Open the same session with that source selected (Slides, Transcript, or the handout). Before the session starts, open it in a read-only preview instead. |
| `+ 12 practice Qs` | Open Practice filtered to this topic's questions. |
| Card course chip | Static label. |
| Timeline row, study block | Same as Start session for that block. Future blocks open a preview with a Start button. |
| Timeline row, lecture | Transcript ready: open its saved notes (`/lectures/[id]`). Live: open the note taker. Upcoming: open the note taker ready to record. |
| Row `Reschedule` (proposal) | Ask the scheduler for the next free slot and move the block. Show the new time inline. |

### Keyboard (proposal)

- A "Skip to content" link comes first and shows on focus.
- Tab order: skip link, wordmark, six nav links, material chips, `+ 12 practice Qs`, Start session, then each timeline row.
- Each timeline row is one link. Nothing inside a row is separately focusable. Enter opens it.
- The card is not a link as a whole, because it holds several controls.
- `Cmd/Ctrl+B` toggles the sidebar (shadcn default).
- No single-letter shortcuts on this screen; they would break typing in the global Ask box later and fail WCAG 2.1.4.
- Do not autofocus Start session on load; screen readers should land on the headline.
- Semantics: headline `h1`; card title and timeline label `h2`; the timeline is an `ol`; times use `<time dateTime>`.
- Mascot wave runs once on first load. It does not run under `prefers-reduced-motion: reduce`.

### Responsive (proposal)

| Width | Sidebar | Main padding | Changes |
| --- | --- | --- | --- |
| above 1440 | 232 | 80 left, 56 right | Content `max-width: 1072`, left aligned, so long rows stay scannable. |
| 1280 to 1440 | 232 | 64 left, 48 right | Content fluid. |
| 1024 to 1279 | 232 | 48 left, 40 right | Content fluid. Title lane shrinks; time, chip and trailing lanes stay fixed. |
| 768 to 1023 | Icon rail, 56 wide (`collapsible="icon"`) | 40 inline | Rail: padding 10 inline, items 36×34, labels in a Tooltip on the right. Wordmark collapses to the mascot. Drive `open` from a `(min-width: 1024px)` query. |
| below 768 | Off-canvas Sheet, 232 wide, from the left | 20 inline | See 375 below. |

At 375:
- Top bar 56 tall, padding 0 20, bottom 1px `--color-rule`. Left: SidebarTrigger 32×32 ghost with lucide `PanelLeft` 16. Then wordmark and mascot, gap 8.
- Main padding 24 top, 20 inline, 40 bottom. Gap 32.
- Headline 24/30, 420, -0.02em. Subline 15/22. Header height `auto`; drop the fixed 128.
- Card: padding 20. Stack the columns. Material chips wrap (`flex-wrap`, gap 8). Start session goes full width below them, 44 tall for touch, 20 above it.
- Timeline row becomes a two-line grid: columns `64px 1fr auto`. Line 1: time, course chip, trailing (right). Line 2: title in columns 2 to 3, wrapping. Padding 12 block.
- Rows and chips keep a 44px minimum touch height.

## 6. Inconsistencies and flags

1. **Type sizes off the 13/20 scale.** Today uses 32/40 (headline), 15/22 (subline), 15/20 (row titles) and 12/16 (course chips). The focus screens use 13 and 20 only. Paper tokens do define `--text-2xl` 32, `--text-base` 15 and `--text-xs` 12, but `app/globals.css` defines only `--text-sm` and `--text-lg`. Keep the sizes for fidelity and add the three tokens.
2. **Weight 420 is not a Paper token.** Paper has `--font-weight-regular: 400`. The design uses 420 throughout. The repo already maps `--weight-regular: 420` and loads the static Regular TTF for 400 to 499, so 420 renders as 400. That is fine; just do not add a 400 token that disagrees.
3. **Two line heights for 13px.** Controls and nav use 13/16. Text, chips and the section label use 13/18.
4. **Section label differs from the focus screens.** Today's `TODAY` is 13/18. `SESSION PLAN` and `SLIDE 14 OF 32` on Study session are 13/16 (the first adds 6px block padding). Pick one.
5. **Primary button differs across artboards.** Today: label weight 500, `#FFFFFF`, `ArrowRight` 12px at stroke 2.5 (24 viewBox), padding 8/15. Study session `Next step`: weight 420, `--color-page`, chevron 12px at stroke 2 (16 viewBox), padding 8, 15 left, 13 right. Lecture notes `End and save notes`: weight 420, `--color-page`. Use one Button variant. Suggest 420, `--color-page`, and 13px right padding when a trailing icon is present.
6. **Hard-coded hex.** `#FFFFFF` on the Start session label and arrow. The mascot uses `#141414`, `#FFFFFF`, `#F6F6F3`, `#D6D6D0`. `scripts/check-tokens.mjs` will reject these. Map them to ink, page, wash and border.
7. **Paper tokens are hex.** The plan requires OKLCH. Convert values in the foundation step and keep the names.
8. **Title tracking.** The card title is 20/24 at -0.01em. The wordmark, the headline and every focus-screen title use -0.02em. Paper's `--tracking-tight` (-0.03em) is unused, and the repo's `--tracking-display` (-0.02em) is not a Paper token.
9. **Radius 4 is not a token.** Chips use 4px. Tokens are 6, 10 and 999. Add `--radius-xs: 4px`. Also `--radius-md` (10) is missing from `app/globals.css`.
10. **Header spacing.** The header has a fixed 128 height with 98 of content, so the gap from subline to card is 70, not 40. Main `padding-top` is 61, an odd value. Reproduce both for the 1440×900 comparison, then consider 30 extra margin and 60 top.
11. **Gutters differ by screen.** Today's main padding is 80 left and 56 right. Every focus screen uses 40 on both sides with a 28 top. Intentional, since Today is the only screen with a sidebar, but worth knowing when components move between screens.
12. **Unused color tokens.** `--color-course-pink`, `--color-course-green`, `--color-course-orange`, `--color-highlight` and `--color-ballpoint` exist in Paper. Today uses none. All course chips are `--color-fill`. Keep chips gray as drawn; the data model can still store a course color.
13. **"Next up" against "now".** Today's card says `Next up · 10:30–11:15am`. The week calendar labels the same block `10:30–11:15am · now`. Choose one sample clock. With 10:12am, the calendar label should read "next".
14. **Empty sidebar footer.** The sidebar uses `justify-content: space-between` with one child. A bottom slot was likely planned. Proposal: `SidebarFooter` holds the model credit (`components/Credit.tsx` exists) and, if wanted, a small spend line for the $30 cap.
15. **Wordmark lane.** The `cue` text starts at x 28; nav icons start at x 30. A 2px offset. It may be optical; check after the font renders.
16. **Materials disagree with Study session.** Today lists `Lecture 8 slides`, `Lecture 8 transcript`, `Lab 6 handout`. The Study session tabs are `Slides`, `Transcript`, `Textbook §5.2`, and its chat cites `A2 handout §3`. Sample data should derive both from one material list.
17. **Naming.** Nav says `Study guides` (plural); the plan and artboard say "Study guide"; the Paper layer is "Nav / Library". Nav says `Lecture notes`; the plan also says "note taker". Also `BookOpen` marks study sessions while the study guide is "one generated textbook", so a book icon may fit guides better. Kept as drawn.
18. **Icon stroke.** Nav icons draw at 1.33px visual stroke (24 viewBox, stroke 2, at 16px). Toolbar chevrons on other artboards are 16 viewBox at stroke 1.5, and so is `components/icons.tsx`. Small, but visible side by side.
19. **No tabular numbers on times.** The focus screens set `font-feature-settings: "tnum"` on timers. Today's time lane does not. Add `tnum` so `10:30am` and `9am` align better.
20. **Two status dots.** Today's `Transcript ready` dot is 6px graphite. The Lecture notes `Recording` dot is 8px ink. They mean different things; define both and do not mix them.
21. **Missing asset.** The mascot layer name points to `cue-mascot-wave.svg`. No such file exists in the repo, and no wave is drawn. Proposal: rotate the sphere -8° to 8° twice over 600ms from the bottom centre, once per load.
22. **Only Today has the sidebar.** Calendar and Study guide are drawn at 1440 with no sidebar, yet they are main nav destinations, not focus modes. Section 7 resolves this.

## 7. Sidebar next to the full-width screens (proposal)

Two tiers of screens.

**Browse screens keep the sidebar open:** Today, Calendar, Study guides, and the index pages for Study sessions, Lecture notes and Practice (none of these indexes is drawn). Clicking "Calendar" should not make the nav vanish. Calendar and Study guide render inside the 1208px main column with their own 40px gutters and 28px top. At 1440 the week grid columns shrink from about 186 to about 153. Record this as an intended difference for the screenshot judge.

**Focus screens hide the docked sidebar:** an active study session, a practice paper, and a live lecture recording. These are task modes with their own exit (`End session`, `End and save notes`). They render at the full 1440 exactly as drawn. The nav is still one keystroke away: `Cmd/Ctrl+B` opens the same nav in a left Sheet, 232 wide, over the content. An overlay does not reflow a live transcript or a timed paper. The Practice artboard has no exit control; add `Esc` to go back to the previous browse screen, with a confirm if a timed attempt is running.

How to build it:
- One `AppNav` component holds the wordmark and nav list. The docked Sidebar and the focus Sheet both render it.
- Two App Router layouts: a browse layout with `SidebarProvider` and the docked `Sidebar` plus `SidebarInset`, and a focus layout with no docked sidebar and the Sheet. Route groups fit this. Read the routing guide in `node_modules/next/dist/docs/` first, as `AGENTS.md` requires.
- Recording and session timers live above both layouts, in a provider in `app/layout.tsx`. Leaving a focus screen must not stop a recording.
- While something runs, the nav shows it in words: `Recording` next to Lecture notes, the remaining time next to Study sessions (see section 4). Today's card switches to `Resume session`.
- Leaving a focus screen returns to where the user came from, defaulting to Today.
