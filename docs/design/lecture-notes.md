# Lecture notes (live note taker)

Source: Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens", artboard `22E-0` "05 Lecture notes", 1440×900. Every number below comes from `get_jsx` unless it is marked **Proposal**. Units are px.

Token names are the Cue names (`--color-*`). In the app they live in `app/globals.css`. Values are given once here for reference only:

| Token | Paper value | Used here for |
| --- | --- | --- |
| `--color-page` | #FFFFFF | screen ground, text on the primary button, send arrow |
| `--color-ink` | #141414 | body text, title, recording dot, progress fill, primary button, send button, emphasized card border |
| `--color-graphite` | #6A6A66 | timestamps, section labels, time readout, placeholder, scope note, live partial text, card meta, chevrons |
| `--color-fill` | #EFEFEB | flagged line background |
| `--color-border` | #D6D6D0 | composer border, default card border |
| `--color-control` | #E6E6E3 | Pause button, progress track |
| `--color-wash` | #F6F6F3 | not drawn here. **Proposal**: hover ground |

## 1. Purpose and content

Lecture notes is the live note taker. A student opens it when a lecture starts, usually from the lecture block on Today or the Calendar. Cue records the room, transcribes it line by line with timestamps, and flags lines where the professor hints at what will be on a test. While it listens it links related coursework (tests, problem sets, textbook sections, past papers, slides) to the moment in the lecture that mentioned it. The student can ask a question about the last 5 minutes without stopping the recording. "End and save notes" stops the recording and turns the session into saved notes (section 5b).

### Content on the artboard

Toolbar

- Title: `MAT137 · Integration by parts` (course code, middle dot, lecture topic).
- Status: `Recording` with an 8px dot.
- Lecture progress: bar at 76% and `38:12 of 50:00` (elapsed of scheduled length; 2292 of 3000 seconds).
- Buttons: `Pause`, `End and save notes`.

Live transcript (section label `Live transcript`, oldest at top, newest at bottom)

| Time | Text | State |
| --- | --- | --- |
| 29:30 | Okay, let's actually do one. The integral of x e to the x, dx. | final |
| 30:02 | Which one is u? Think LIATE. x is algebraic, e to the x is exponential, so algebraic comes first. | final |
| 30:41 | So u equals x, which means du is just dx. And dv is e to the x dx, so v is e to the x. | final |
| 31:58 | Plug into the formula: x e to the x, minus the integral of e to the x dx. | final |
| 33:20 | If you pick u the other way around, the integral gets worse, not better. That's the number one mistake I see, so there will be one of these on Term Test 2. | flagged, label `Flagged · on Term Test 2` |
| 35:47 | So the answer is x e to the x minus e to the x, plus C. Always check by differentiating. | final |
| 37:10 | Now, what happens if we need to do this twice? Take x squared e to the x. | final |
| Live | …the same trick comes back, we just apply it a second time to the | partial (still being spoken) |

Composer: placeholder `Ask about what was just said…`, scope note `Uses the last 5 minutes`, round send button with an up arrow.

Related coursework (section label `Related coursework`, newest link at top)

| Time | Title | Meta | Target kind |
| --- | --- | --- | --- |
| 33:20 | Term Test 2 | Nov 13 · Prof. Chen says this will be on it | assessment (emphasized, layer name says "newest") |
| 31:58 | Problem Set 5, Q3–Q6 | Due Thursday · same technique | assignment |
| 30:02 | Integration by parts | Textbook · §7.1, LIATE on p. 482 | textbook section |
| 17:05 | 2024 Term Test 2, Q4 | Practice · same choice of u and dv | practice question |
| 6:40 | Deriving the formula | Lecture 9 slides · 4–9 | slides |

The link times match transcript lines: 33:20 is the flagged line, 31:58 is "Plug into the formula", 30:02 is the LIATE line. 17:05 and 6:40 are earlier than the visible transcript, so sample data needs lines there too.

### Sample data for the builder

Keep the drawn rows verbatim. Add earlier lines so the transcript scrolls and the 6:40 and 17:05 links resolve. The extra lines below are invented for sample data.

| Time | Text (invented) |
| --- | --- |
| 0:45 | Morning. Today is integration by parts, which is really just the product rule run backwards. |
| 6:40 | Start from the derivative of u times v. Integrate both sides and you get the formula on slide 6. |
| 12:15 | The skill here is choosing u. Pick the part that gets simpler when you differentiate it. |
| 17:05 | This is the exact setup from last year's Term Test 2. Same choice of u and dv. |
| 24:30 | If you are not sure, write both choices down and see which integral you can actually do. |

Suggested shape (names are a proposal; `docs/architecture.md` owns the real types):

```ts
type LectureRecording = {
  id: string;
  courseCode: "MAT137";
  title: "Integration by parts";
  professor: "Prof. Chen";
  scheduledSec: 3000;          // 50:00
  elapsedSec: 2292;            // 38:12
  status: "starting" | "recording" | "paused" | "saving" | "saved" | "error";
};
type TranscriptLine = { id: string; atSec: number; text: string; final: boolean; flag?: { assessment: string } };
type RelatedLink = { id: string; atSec: number; lineId: string; title: string; meta: string; kind: "assessment" | "assignment" | "textbook" | "practice" | "slides"; href: string };
```

## 2. Layout skeleton

This is a focus screen. It has no app sidebar, the same as Study session (`55-0`). Today (`1-0`) shows the sidebar; this screen does not.

```
x:0                                                                                         1440
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ pad-top 28                                                                                   │
│ 40 │ Title (20/24)                           ● Recording  ▬▬▬▬▬▬▬──  38:12 of 50:00 [Pause][End and save notes] │ 40   y 28–60, h 32
│ gap 24                                                                                       │
│ 40 │ ┌ Transcript column: flex 1 (920) ──────────────┐ gap 40 ┌ Related column: 400 ─────┐ │ 40   y 84–868, h 784
│    │ │ LIVE TRANSCRIPT (h 28, pad-x 16)              │        │ RELATED COURSEWORK (h 28)│ │
│    │ │ gap 12                                        │        │ gap 12                   │ │
│    │ │ lines: 8 rows, gap 6           y 124–474      │        │ 5 cards 62 tall, gap 8   │ │
│    │ │ gap 12                                        │        │ y 124–466                │ │
│    │ │ composer h 58                  y 486–544      │        │                          │ │
│    │ └───────────────────────────────────────────────┘        └──────────────────────────┘ │
│ pad-bottom 32                                                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Measured layout |
| --- | --- |
| Screen | 1440×900, `--color-page`, `overflow: clip`, flex column. |
| Main | flex column, `flex: 1`, `min-height: 0`, padding 28 top, 40 left and right, 32 bottom, gap 24. |
| Toolbar | height 32, `flex-shrink: 0`, row, `justify-content: space-between`, `align-items: center`. |
| Toolbar left | title only (wrapper has gap 8 with one child, room for a later breadcrumb). |
| Toolbar right ("Controls") | row, gap 12, centered. Children in order: status (gap 6 inside), progress group (gap 12 inside: 160×4 track, then time text at `width: max-content`), Pause, End and save notes. Total width 588. |
| Body | row, `flex: 1`, `min-height: 0`, gap 40. Height 784 at 900. |
| Transcript column | flex column, `flex: 1 1 0`, `min-width: 0`, gap 12, `height: fit-content` in Paper. Width 920 at 1440. |
| Transcript header | height 28, padding 0 16, row, space-between, centered. Label aligns with the timestamp lane (x 56). |
| Lines | flex column, gap 6. A normal row is 32 tall (padding 6 16, 20 line-height). Row pitch 38. |
| Row lanes | timestamp lane 44 wide at x 56, gap 16, text lane from x 116, 828 wide. 16 + 44 + 16 + 828 + 16 = 920. |
| Composer wrapper | flex column, `flex: 1`, `justify-content: end`. Composer is 58 tall. |
| Related column | flex column, width 400, `flex-shrink: 0`, gap 12. Stretches to 784. |
| Related header | height 28, no horizontal padding. Label at x 1000. |
| Links | flex column, gap 8. Each card 400×62. |
| Card lanes | 1 border + 16 padding + 44 time + 16 gap + 274 text + 16 gap + 16 chevron + 16 padding + 1 border = 400. Time lane at x 1017, title lane at x 1077. |

### Scroll behavior

Paper draws no scroll. Body and both columns set `min-height: 0`, so they are ready to scroll inside the viewport.

**Proposal** (at 1024 and wider):

- The page does not scroll. The screen is `100dvh`.
- The transcript column gets `max-height: 100%`. Lines get `flex: 0 1 auto; min-height: 0; overflow-y: auto` inside a ScrollArea. The composer gets `flex-shrink: 0`. With a short transcript the composer sits 12 below the last line, exactly as drawn. Once the lines fill the column they scroll and the composer stays pinned at the bottom of the body.
- The lines stick to the bottom while the reader is within 48 of the bottom. If the reader scrolls up, auto-scroll stops and a "Jump to live" button appears (section 4).
- The related list scrolls on its own inside the 400 column. Its header stays put.

## 3. Components

Typography is written as size/line-height/weight/tracking/transform. Font is `--font-sans` (Timeless Sans) everywhere. "tnum" means `font-feature-settings: "tnum"`.

| Component | Structure | Typography | Colors | Radius / border | shadcn mapping |
| --- | --- | --- | --- | --- | --- |
| Screen title | single text node in the toolbar | 20/24/420/-0.02em/none | text `--color-ink` | none | custom `h1` |
| Recording status | 8×8 dot, gap 6, label | label 13/16/500/0/none | dot and label `--color-ink` | dot radius 999 | custom, wrapped in `role="status"` |
| Lecture progress | track 160×4 with fill at `round(76%, 1px)` (122), gap 12, time text | time 13/16/420/0/none, tnum, `width: max-content` | track `--color-control`, fill `--color-ink`, time `--color-graphite` | track and fill radius 999, track `overflow: clip` | Progress (Base UI `Progress.Root/Track/Indicator`, value = elapsed seconds, max = scheduled seconds). Time text is a sibling, not Progress.Value |
| Pause button | text button, padding 8 15, height 32 | 13/16/420/0/none | bg `--color-control`, text `--color-ink` | `--radius-sm` (6), no border | Button variant `secondary`, size default (override to 32 high, padding 8 15) |
| End and save notes | text button, padding 8 15, height 32 | 13/16/420/0/none | bg `--color-ink`, text `--color-page` | `--radius-sm` (6), no border | Button variant `default` (primary) |
| Section label | text in a 28-high row | 13/16/420/`--tracking-caps` (0.08em)/uppercase | `--color-graphite` | none | custom `h2` (shared with Study session headers) |
| Transcript line, final | row: timestamp (44 wide, `flex-shrink: 0`) + text (`flex: 1`), gap 16, padding 6 16 | time 13/20/420/0/none tnum; text 13/20/420/0/none | time `--color-graphite`, text `--color-ink` | none | custom `li` inside ScrollArea |
| Transcript line, flagged | same row, padding 12 16; text column is flex column gap 4: quote, then label `Flagged · on Term Test 2` | quote 13/20/420; label 13/16/500 | bg `--color-fill`; time `--color-graphite`; quote and label `--color-ink` | radius 6 (literal, equals `--radius-sm`), no border | custom (same component as final line, `flagged` variant) |
| Live line | same row as final, padding 6 16 | time slot shows `Live` at 13/20/500, no tnum; text 13/20/420 | `Live` `--color-ink`; partial text `--color-graphite` | none | custom |
| Ask composer | row, space-between, centered, gap 12; padding 12 top and bottom, 16 left, 12 right; height 58 | placeholder 13/20/420 | border `--color-border`; placeholder `--color-graphite`; ground `--color-page` | radius 6 (literal), 1 solid border | InputGroup with InputGroupTextarea (1 row, auto-grow), InputGroupAddon align end. Fallback: Textarea + Button in a custom wrapper |
| Scope note | text before the send button, gap 12 | 13/16/420 | `--color-graphite` | none | InputGroupText |
| Send button | 32×32 circle, 14×14 up arrow centered (`M8 13V3M3.5 7.5L8 3l4.5 4.5`, stroke 1.5, round caps and joins) | none | bg `--color-ink`, arrow stroke `--color-page` | radius 999 | Button size `icon-sm` (32), rounded-full; icon lucide `ArrowUp` at 14, strokeWidth 1.5 |
| Related link card | row, centered, gap 16, padding 12 16: time (44 wide) + text column (title, meta, no gap) + chevron 16×16 | time 13/20/420 tnum; title 13/20/500; meta 13/16/420 | border `--color-border`; time `--color-graphite`; title `--color-ink`; meta `--color-graphite`; chevron stroke `--color-graphite` | radius 6 (literal), 1 solid border | Item (variant `outline`, rendered as a link with Base UI `render`), with ItemContent/ItemTitle/ItemDescription/ItemActions. Fallback: custom `a`. Not Card: Card's padding and shadow do not match |
| Related link card, emphasized | same as above | time 13/20/**500** tnum | border **`--color-ink`**; time **`--color-ink`** | same | same component, `emphasized` variant |
| Chevron | 16×16 SVG, path `M6 3l5 5-5 5`, stroke 1.5, round caps and joins | none | stroke `--color-graphite` | none | lucide `ChevronRight` at 16, strokeWidth 1.5 |

Components the screen will also need (not drawn, built from the parts above): ScrollArea for both lists, Tooltip on the send button ("Ask"), and Tooltip on the progress bar showing scheduled start and end times.

## 4. States

"Drawn" means visible on the artboard. Everything else is **Proposal**, drawn with the same tokens.

| State | Drawn? | How it is drawn | Carried by more than color? |
| --- | --- | --- | --- |
| Recording | yes | 8px ink dot, `Recording` at weight 500, progress fill grows. **Proposal**: dot opacity pulses 1 to 0.35 over 1.6s ease-in-out, off under `prefers-reduced-motion`. | Yes. The word "Recording" and the dot shape. There is no red. |
| Paused | no | Dot becomes a hollow 8px ring (1.5 ink border, no fill). Label `Paused`. Pause button reads `Resume`. Progress fill and time stop. The live line is replaced by a graphite row `Paused at 38:12` in the text lane, time lane empty. | Yes. Label text, ring vs filled dot, button label. |
| Starting | no | Before the first audio arrives: label `Starting…` with the hollow ring, Pause disabled (opacity 0.4, the existing disabled rule). Transcript shows only the live line with `Listening…` in graphite. | Yes, text. |
| Microphone blocked | no | Status label `Not recording` with hollow ring. In the lines region one row on `--color-fill`, radius 6, padding 12 16: ink line "Cue can't hear your microphone." then graphite line "Allow microphone access for this site, then try again." and a secondary Button `Try again`. End and save notes stays enabled so anything already captured is kept. | Yes, text. |
| Saving | no | After End: End button shows `Saving…` and is disabled; Pause is disabled; status label `Saving`. Then route to the saved notes view. | Yes, text. |
| Final line | yes | Graphite tnum time, ink text. | n/a |
| Live (partial) line | yes | `Live` in ink weight 500 in the time lane, partial text in graphite, leading `…`, no trailing punctuation. When it finalizes it takes a real timestamp and its text turns ink (150ms color transition). A new live line appends below. | Yes. The word "Live" replaces the timestamp, and the leading ellipsis. |
| Listening with no speech | no | Live line text `Listening…` in graphite. | Yes, text. |
| Flagged exam hint | yes | `--color-fill` ground, radius 6, padding grows from 6 to 12 vertical, ink label `Flagged · on Term Test 2` at weight 500 under the quote. | Yes. Background shape, extra padding, and the word "Flagged". |
| Line hover | no | `--color-wash` ground, radius 6. Reveals a text action at the right end of the row: `Flag` (13/16/500 ink). On a flagged row the action reads `Unflag`. | Yes, text action. |
| Manually flagged | no | Same as flagged, label `Flagged by you`. | Yes, text. |
| Transcript scrolled up | no | A secondary Button `Jump to live` (13/16/420, padding 6 12, `--radius-sm`, `--color-control`) floats centered 8 above the composer. | Yes, text. |
| Empty transcript | no | Only the live line (`Listening…`). | Yes, text. |
| Related link default | yes | 1px `--color-border` outline, graphite time, ink title at 500. | n/a |
| Related link emphasized ("newest") | yes | Border `--color-ink`, time `--color-ink` at weight 500. | Partly. Border is color only; the time also gains weight 500. See flag 7 in section 6. |
| Related link hover | no | Ground `--color-wash`; chevron moves 2 right over 120ms with the existing `--ease`. | Movement, not color only. |
| Related link pressed | no | `transform: scale(0.98)`, 100ms. | yes |
| Related link arriving | no | New card inserts at top: opacity 0 to 1 and translateY -4 to 0, 200ms, `--ease`. The emphasis moves to it. Off under reduced motion. | n/a |
| Related empty | no | One graphite line under the header, 13/20: "Links to tests, problem sets and readings appear here when the lecture mentions them." | Text. |
| Composer focus | no | Border `--color-ink` (the same 1px). Plus the global `:focus-visible` outline on keyboard focus (2px ink, offset 2). | Outline ring on keyboard focus. |
| Send disabled | no | Empty input: send button at opacity 0.4, `cursor: default`. | Opacity. |
| Asking | no | Send button shows a 14px spinner in `--color-page`; input stays editable; answer block appears above the composer (section 5). | Spinner shape. |
| Answer shown | no | Answer block above the composer, using the Study session chat parts: question bubble on `--color-fill`, radius 6, padding 10 14, max-width 280, right aligned; answer paragraphs 13/20/420 ink, gap 12; source chips 13/16/420 with 1px `--color-border`, radius 4, padding 3 5 3 7, 12px chevron. Chips cite transcript times, for example `Transcript 33:20`. | Text and position. |
| Budget cap reached | no | `lib/llm.ts` returns HTTP 402 with kind `budget` once the $30 cap in `lib/spend.ts` is hit. Under the composer, one row 13/20: ink "The $30 spending cap is reached." then graphite "Cue stops calling Nemotron at the cap. Recording continues; transcription and questions resume when the cap is raised." Send button disabled. Reuse the copy in `components/Intake.tsx`. If transcription itself runs on Token Factory, the live line reads `Transcription stopped at the spending cap` and audio keeps recording locally so it can be transcribed later. | Yes, text. |
| Rate limited / upstream error on Ask | no | Same row pattern as budget, with the matching `ERROR_COPY` entry. | Yes, text. |
| Offline | no | Status label `Recording offline`; lines keep arriving only if transcription runs on device. Otherwise the live line reads `Waiting for connection…`. | Yes, text. |

## 5. Interactions, keyboard, responsive

### Controls

| Control | What it does |
| --- | --- |
| Pause / Resume | Stops or restarts audio capture. The elapsed clock stops while paused. |
| End and save notes | Stops capture, finalizes the last partial line, runs the summary, saves, and opens the saved notes view. **Proposal**: no confirm dialog. Nothing is discarded, and the saved view offers `Continue recording`, which appends to the same notes. |
| Progress bar | Display only. **Proposal**: Tooltip with the scheduled slot, for example "9:00–9:50am". |
| Transcript row | **Proposal**: hover or focus reveals `Flag`. Clicking a timestamp copies a link to that moment. |
| Flagged row label | **Proposal**: `on Term Test 2` scrolls the related list to the Term Test 2 card and highlights it once. |
| Composer | Types a question scoped to the last 5 minutes of transcript. Enter sends, Shift+Enter adds a line. Uses the quick model role for latency. The answer appears above the composer and is saved with the notes under "Your questions". Esc dismisses the answer block. |
| Send | Same as Enter. Disabled while the input is empty or the budget cap is reached. |
| Related card | Opens the target: an assessment on the Calendar, an assignment or past question in Practice, a textbook section in the Study guide, slides in a Study session viewer. **Proposal**: opens in place and keeps recording; the toolbar status stays visible from any screen (see flag 9). |

### Keyboard (Proposal)

Only when focus is not in a text field. Declare each with `aria-keyshortcuts`.

| Key | Action |
| --- | --- |
| `/` | Focus the composer. |
| `Esc` | Leave the composer, or close the answer block. |
| `P` | Pause or resume. |
| `F` | Flag the latest final line, or the focused line. |
| `J` | Jump to live. |
| `↑` / `↓` | Move between transcript rows when the list has focus (roving tabindex; the list is one tab stop). |

Accessibility notes:

- Transcript list: `ol` with `role="log"` and `aria-live="off"`. A live region that reads every line would flood a screen reader. A separate visually hidden `role="status"` announces only flags and state changes: "Exam hint flagged at 33:20, on Term Test 2", "Paused", "Recording".
- Each timestamp is a `time` element, for example `<time datetime="PT33M20S">33:20</time>`.
- Progress: `aria-label="Lecture time"`, `aria-valuetext="38 minutes 12 seconds of 50 minutes"`.
- Composer: visually hidden label "Ask about the last 5 minutes"; the scope note is linked with `aria-describedby`. Send button `aria-label="Ask"`.
- Contrast: graphite on page is about 5.4:1. Graphite timestamp on the flagged `--color-fill` ground is about 4.7:1. Both pass AA for 13px text, the second only just. Do not lighten graphite.
- Keep the screen awake while recording (Screen Wake Lock API) and warn on page unload while recording.

### Responsive (Proposal)

| Width | Behavior |
| --- | --- |
| 1280 and up | As drawn. Transcript column flexes; related column stays 400. |
| 1024 to 1279 | Related column 320, body gap 32, main padding 32 left and right. Toolbar unchanged. |
| 768 to 1023 | One column. Under the toolbar, Tabs `Transcript` and `Related 5`, styled like the Study session material tabs: gap 4, each tab padding 6 12, `--radius-sm`, active tab `--color-control` with ink text at 500, inactive graphite at 420. The progress bar hides; the time text stays. Composer pins to the bottom of the transcript tab. A new related link shows a 6px ink dot on the `Related` tab, and the status region announces it. |
| 375 | Main padding 16 left and right, 16 top, 16 bottom plus `env(safe-area-inset-bottom)`. Toolbar wraps to two rows with gap 8. Row 1: title, 20/24, one line, truncated with an ellipsis (full title in `title`). Row 2: status, time as `38:12` only, then `Pause` and `End and save` (shortened label), buttons pushed right. Transcript rows: padding 6 12, gap 12, timestamp lane stays 44, so the text lane is 263 wide. The scope note moves into the placeholder: `Ask about the last 5 minutes…`. The composer is fixed to the bottom. All hit targets are at least 32 tall with 44 of padding area where possible. |

### 5b. Saved notes view (Proposal, not drawn)

Reached from "End and save notes", and from the `Transcript ready` status on the Today row for the lecture. Same focus frame, same measurements: main padding 28 40 32, gap 24, 32-high toolbar, body row with gap 40, flexible left column and 400 right column.

```
MAT137 · Integration by parts                     ✓ Saved · 50:00 · Mon 9:00–9:50am  [Continue recording] [Review now]

SUMMARY                                            RELATED COURSEWORK
Integration by parts is the product rule           [33:20  Term Test 2               >]
run backwards. Choose u with LIATE...              [31:58  Problem Set 5, Q3–Q6      >]
                                                   [30:02  Integration by parts      >]
EXAM HINTS · 1                                     [17:05  2024 Term Test 2, Q4      >]
[33:20  If you pick u the other way around...  ]   [ 6:40  Deriving the formula      >]
[       on Term Test 2                          ]
                                                   
KEY POINTS
 6:40  The formula comes from integrating the product rule.
30:02  Pick u with LIATE: algebraic before exponential.
35:47  Check the answer by differentiating.

YOUR QUESTIONS · 0

FULL TRANSCRIPT · 412 LINES                    >

[ Ask about this lecture…          Uses the whole lecture  (↑) ]
```

| Part | Spec |
| --- | --- |
| Toolbar left | Same title component. |
| Toolbar right | Gap 12. Status: 12px check icon (stroke 1.5, ink) in place of the dot, gap 6, `Saved` at 13/16/500 ink. Then graphite 13/16/420 tnum `50:00 · Mon 9:00–9:50am`. Then Button secondary `Continue recording`, Button primary `Review now` (starts a Study session seeded with this lecture's flagged hints and key points). |
| Left column | One ScrollArea. Sections separated by 24. Each starts with the 28-high caps section label, padding 0 16, then 12 gap. |
| Summary | Paragraph 13/20/420 ink, padding 0 16, max width 64ch. Three to five sentences. |
| Exam hints · N | Reuse the flagged transcript row exactly (fill ground, radius 6, padding 12 16, 44 time lane, gap 16). The label drops "Flagged" and reads `on Term Test 2`. Gap 6 between hints. |
| Key points | Reuse the final transcript row (padding 6 16, gap 16, gap 6 between rows). The timestamp is a link that opens the full transcript at that line. 4 to 8 points. |
| Your questions · N | Questions asked during the lecture, each in the Study session chat layout (bubble, answer, source chips). Hidden when N is 0. |
| Full transcript · N lines | A Collapsible trigger row: section label style plus a 16px chevron that rotates 90° when open (150ms). Opens the full list using the same transcript rows, with flagged rows kept. Add an Input `Search transcript` (13/20, 1px `--color-border`, radius 6, padding 6 12) at the top of the open list. |
| Right column | The same related list. No card is emphasized; flagged-hint links sort first, then by time. |
| Composer | Same component. Placeholder `Ask about this lecture…`, scope note `Uses the whole lecture`. Answers append to "Your questions". |
| Loading | While the summary runs, the Summary section shows three graphite lines `Writing summary…` with a 1.2s opacity pulse; transcript and related links are already final and show immediately. |
| shadcn | ScrollArea, Collapsible, Button, Input, InputGroup, Item, Tooltip. |
| 375 | Toolbar row 2 keeps `Saved · 50:00` and `Review now`; `Continue recording` moves into a DropdownMenu behind a 32px `…` icon button. Related moves to the Tabs pattern above. |

## 6. Inconsistencies and flags

1. **Regular weight token.** Every text node uses a literal `fontWeight: 420`. The Paper token `--font-weight-regular` is 400. `app/globals.css` already uses `--weight-regular: 420`. Treat 420 as correct and fix the Paper token.
2. **Title tracking.** The title uses a literal `-0.02em`. Paper's only tracking token is `--tracking-tight: -0.03em`, which no screen here uses. `app/globals.css` has `--tracking-display: -0.02em`. Keep -0.02em and add it to Paper.
3. **Radius literals.** The flagged row, composer and related cards use literal `6px`; the buttons use `var(--radius-sm)`. Same value. Use `--radius-sm` everywhere in code.
4. **Two flagged-quote specs.** Here the flagged row is padding 12 16, time lane 44 with tnum, plus a weight-500 label. Study session's "Transcript moment" (`20E-0`) is padding 16 20, time lane 40 without tnum, quoted text, no label. Same concept, two sizes. Build one `TranscriptLine` component with the 44 lane and tnum.
5. **Two composers.** Here: one row, padding 12 12 12 16, no model choice, scope note on the right. Study session (`21L-0`): stacked, padding 14, a `Quick · Nano` / `Deep · Ultra` toggle, no scope note. Build one composer with an optional footer slot. During a live lecture, fix it to the quick model and say so in the scope note.
6. **Section label inset.** `Live transcript` has 16 horizontal padding so it lines up with the timestamps (x 56). `Related coursework` has none, so it sits at x 1000 while card content starts at x 1017. Study session labels have no inset either. Pick one rule; matching the content lane reads better.
7. **Meaning of the emphasized card.** The layer is named "Term Test 2 (newest)", but it is also the card tied to the flagged hint. If emphasis means "newest", it moves with every new link and the hint link loses its mark. If it means "linked to an exam hint", the name is wrong. The emphasis is also mostly color (ink border); only the timestamp weight change is not. Decide the meaning before building.
8. **Opposite orders.** Transcript runs oldest to newest, top to bottom. Related coursework runs newest to oldest. Both are defensible (newest link where the eye lands), but the two lists sit side by side with matching timestamps. Confirm it is intended.
9. **No way out.** Like Study session, the screen has no sidebar and no back control. "End and save notes" is the only exit drawn. Opening a related card leaves the screen mid-recording. Needs a decision: keep recording in the background with a status chip in the app shell, or open related targets in a side sheet.
10. **Time readout convention.** Here `38:12 of 50:00` (elapsed of total). Study session says `31:48 left` (remaining). Pick one per context and document it.
11. **Primary end action.** Here the end action is the primary ink button; in Study session `End session` is secondary. It fits here because saving is the goal, but a primary button next to Pause invites a mis-tap. The "Continue recording" recovery in 5b covers it.
12. **No primary hover token.** Paper has no hover color for ink buttons. `app/globals.css` uses a hex (`#2c2c2a`) for `.button.primary:hover`, which `scripts/check-tokens.mjs` will reject. Use `color-mix(in oklch, var(--color-ink) 88%, var(--color-page))` or add a token.
13. **Hex tokens.** Paper and the current `globals.css` define colors in hex. The plan requires OKLCH. Convert values in the foundation and keep the names.
14. **Shared style holds.** Only 13 and 20 sizes, only 420 and 500 weights, only grayscale tokens (`--color-highlight`, `--color-ballpoint` and the course colors are unused here). Recording is not red. The artboard root carries Paper's default 12/16 text, which no visible node uses; do not copy it to `body`.
