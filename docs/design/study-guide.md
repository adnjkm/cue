# Study guide: implementation spec

Source: Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens", artboard "06 Study guide" (`27L-0`), 1440 × 1079. The artboard height is `fit-content`, so 1079 is the content height, not a viewport.

All px values come from `get_jsx`. Token names refer to the Paper token set (`contentHash cb3d59f1`). Anything marked **Proposal** is not in the design.

---

## 1. Purpose and content

### Purpose

The study guide turns everything Cue knows about one course (lectures, slides, textbook, problem sets) into a single generated textbook. A student picks a course, moves through chapters and sections in a contents list, and reads one section at a time. Each section mixes prose, a formula, a figure, and a "common mistake" callout that flags exam hints. Every claim carries a footnote that cites where it came from: a lecture timestamp, a slide range, a textbook page or figure, or a problem set question. From any section the student can export the guide as a PDF or jump into a quiz on that section.

### Every piece of content on the artboard

Toolbar
- Title: `ECO101 · Study guide` (middle dot U+00B7, spaces on both sides).
- Course select value: `ECO101`. Other courses that appear elsewhere in the file: `CSC148`, `MAT137`.
- Buttons: `Export PDF`, `Quiz me on this section`.

Contents nav
- Label: `Contents` (rendered uppercase by CSS, so store it as "Contents").
- Chapters, in order: `Thinking like an economist`, `Gains from trade`, `Supply and demand`, `Elasticity` (current, expanded), `Government policy`.
- Sections under `Elasticity`: `What elasticity measures`, `Price elasticity of demand` (current), `Elasticity and total revenue`, `Elasticity of supply`.

Section `Price elasticity of demand`
- Intro prose: `Price elasticity of demand measures how strongly buyers react to a price change. If a small price rise makes people buy a lot less, demand is elastic. If they keep buying about the same amount, demand is inelastic.¹`
- Formula: `Elasticity` `=` numerator `% change in quantity demanded` over denominator `% change in price`.
- Formula note: `Above 1 is elastic, below 1 is inelastic. Use the midpoint method so the answer is the same whether price rises or falls.²`
- Figure, left panel: chart (elastic curve), title `Elastic demand`, description `Quantity falls a lot. Restaurant meals, a specific brand of cereal.`
- Figure, right panel: chart (inelastic curve), title `Inelastic demand`, description `Quantity barely moves. Gasoline, insulin, your phone bill.`
- Figure caption: `The same price rise, from P1 to P2, on two demand curves.³`
- Callout label: `Common mistake · will be on the midterm`
- Callout body: `Slope is not elasticity. A straight-line demand curve has the same slope everywhere, but its elasticity changes along the line: elastic near the top, where prices are high, and inelastic near the bottom.⁴`
- Callout quote: `“Half of you will look at a steep line and write ‘inelastic’. Read the percentages, not the picture.” Prof. Okafor` (curly quotes, attribution follows the closing quote after one space, no dash).

Footnotes
1. `Lecture 7 at 4:15. Textbook ch. 5, p. 92.`
2. `Lecture 7 slides 6–8. Used in Problem Set 4, Q1.`
3. `Lecture 7 at 18:40, redrawn from the whiteboard sketch. Textbook Figure 5-1.`
4. `Lecture 7 at 31:10. Tested in Problem Set 4, Q2.`

### Sample data shape for builders

Footnote markers in the design always sit at the end of a block. Model them as refs on the block, not as characters in the string.

```ts
const section = {
  courseCode: "ECO101",
  chapter: { id: "elasticity", title: "Elasticity", textbookChapter: 5 },
  id: "price-elasticity-of-demand",
  title: "Price elasticity of demand",
  blocks: [
    { kind: "prose", text: "Price elasticity of demand measures …", refs: [1] },
    {
      kind: "formula",
      lhs: "Elasticity",
      numerator: "% change in quantity demanded",
      denominator: "% change in price",
      note: "Above 1 is elastic, below 1 is inelastic. …",
      noteRefs: [2],
    },
    {
      kind: "figure",
      panels: [elasticPanel, inelasticPanel], // see 3.3
      caption: "The same price rise, from P1 to P2, on two demand curves.",
      refs: [3],
    },
    {
      kind: "callout",
      label: "Common mistake",
      examHint: "will be on the midterm",
      text: "Slope is not elasticity. …",
      refs: [4],
      quote: { text: "Half of you will look at a steep line …", attribution: "Prof. Okafor" },
    },
  ],
  footnotes: [
    { n: 1, sources: [{ kind: "lecture", lecture: 7, at: "4:15" }, { kind: "textbook", chapter: 5, page: 92 }] },
    { n: 2, sources: [{ kind: "slides", lecture: 7, from: 6, to: 8 }, { kind: "problemSet", set: 4, question: 1, use: "used" }] },
    { n: 3, sources: [{ kind: "lecture", lecture: 7, at: "18:40", note: "redrawn from the whiteboard sketch" }, { kind: "textbookFigure", figure: "5-1" }] },
    { n: 4, sources: [{ kind: "lecture", lecture: 7, at: "31:10" }, { kind: "problemSet", set: 4, question: 2, use: "tested" }] },
  ],
};
```

The footnote strings are rendered from `sources` as `Lecture 7 at 4:15. Textbook ch. 5, p. 92.` Keep the exact phrasing: `Lecture N at m:ss`, `Lecture N slides a–b` (en dash), `Textbook ch. N, p. N`, `Textbook Figure N-N`, `Used in Problem Set N, QN`, `Tested in Problem Set N, QN`. Sources join with `. ` and the line ends with `.`.

---

## 2. Layout skeleton

### Frame

| Region | Value |
| --- | --- |
| Artboard | width 1440, height fit-content (1079), bg `--color-page`, `overflow: clip` |
| Root text defaults | `font-family: var(--font-sans)`, 12px / 16px, antialiased, `overflow-wrap: anywhere`. Every visible text overrides the size to 13 or 20 except chart labels. |
| Main | flex column, `gap: 24px`, `padding: 28px 40px 48px` (top, inline, bottom). Content width 1360. |
| Toolbar | flex row, height 32, `align-items: center`, `justify-content: space-between`, `flex-shrink: 0`. y 28 to 60. |
| Toolbar left | flex row, `gap: 16px`, holds the title only. |
| Toolbar right | flex row, `gap: 12px`, holds Select (95 × 32), Export (99 × 32), Quiz (170 × 32). |
| Body | flex row, `gap: 48px`, `flex: 1 1 0%`, `min-height: 0`. y 84 to 1031 (947 tall). |
| Contents column | width 240, `flex-shrink: 0`, flex column, `gap: 12px`. x 40 to 280. Stretches to body height. |
| Chapter column | `flex: 1 1 0%`, `min-width: 0`, flex column, `gap: 24px`. x 328 to 1400, width 1072. |

### Chapter column, top to bottom

| Block | y range | Height | Notes |
| --- | --- | --- | --- |
| Section heading | 84 to 112 | 28 | one line |
| Intro prose | 136 to 180 | 44 | two lines at 22 line height, `max-width: 760px` |
| Formula block | 204 to 317 | 113 | full column width |
| Figure block | 341 to 728 | 387 | full column width |
| Common-mistake callout | 752 to 892 | 140 | full column width, text inside capped at 760 |
| Footnotes | 916 to 1031 | 115 | top rule, full column width |

Gaps between blocks are all 24. The section heading center (y 98) lines up with the `Contents` label center (y 98).

Every block in the design is wrapped in an extra flex row with `gap: 48px` and a single child. Nothing sits in the second slot. Do not reproduce these wrappers (see section 6).

### Measure

Running text (intro, formula note, callout body and quote) is capped at 760px. Boxes (formula, figure, callout) span the full 1072. The figure caption and footnotes have no cap.

### Scroll behavior

The design is a single tall page with no visible scroll container. At a 1440 × 900 viewport the page overflows by 179px.

**Proposal:** use document scroll for the page. Make the contents column `position: sticky; top: 28px; align-self: start` with `max-height: calc(100dvh - 56px)` and `overflow-y: auto` (shadcn ScrollArea) so a long contents list scrolls on its own. The toolbar scrolls away. Document scroll keeps browser find, print and anchor links working.

---

## 3. Components

### Typography styles used

| Style | Size / line height | Weight | Tracking | Transform | Color |
| --- | --- | --- | --- | --- | --- |
| Page title | 20 / 24 | 420 | -0.02em | none | `--color-ink` |
| Section heading | 20 / 28 | 420 | -0.02em | none | `--color-ink` |
| Formula term (`Elasticity`, `=`) | 20 / 28 | 420 | 0 | none | `--color-ink` |
| Control label | 13 / 16 | 420 | 0 | none | `--color-ink`, or `--color-page` on primary |
| Contents label | 13 / 16 | 420 | `--tracking-caps` (0.08em) | uppercase | `--color-graphite` |
| Nav item | 13 / 20 | 420 (current 500) | 0 | none | `--color-graphite` (current `--color-ink`) |
| Body prose | 13 / 22 | 420 | 0 | none | `--color-ink` |
| Fraction terms | 13 / 18 | 420 | 0 | none | `--color-ink` |
| Note / meta | 13 / 20 | 420 | 0 | none | `--color-graphite` |
| Panel title | 13 / 20 | 500 | 0 | none | `--color-ink` |
| Figure caption | 13 / 20 | 420 | 0 | none | `--color-ink` |
| Callout label | 13 / 16 | 500 | 0 | none | `--color-ink` |
| Callout quote | 13 / 22 | 420 | 0 | none | `--color-graphite` |
| Footnote number and text | 13 / 20 | 420 | 0 | none | `--color-graphite` |
| Chart label (SVG) | 12, no line height | default (400) | 0 | none | `--color-ink` or `--color-graphite` |

### Component table

| Name | Structure | Typography | Colors | Radius | Border | shadcn mapping |
| --- | --- | --- | --- | --- | --- | --- |
| Page title | single text, `h1` | Page title | ink | none | none | custom |
| Course select (trigger) | row, `gap: 8px`, `padding: 8px 11px 8px 15px`; label + 12 × 12 chevron | Control label | bg `--color-control`, text and chevron stroke `--color-ink` | `--radius-sm` (6) | none | Select (Base UI). Restyle the trigger; it is a filled control, not an outlined input. |
| Chevron | SVG 12 × 12, viewBox `0 0 12 12`, path `M3 4.5l3 3 3-3`, stroke 1.5, round caps and joins, no fill | n/a | stroke `--color-ink` | n/a | n/a | part of Select trigger |
| Export PDF | text only, `padding: 8px 15px`, 32 tall | Control label | bg `--color-control`, text `--color-ink` | `--radius-sm` | none | Button, `variant="secondary"` |
| Quiz me on this section | text only, `padding: 8px 15px`, 32 tall | Control label | bg `--color-ink`, text `--color-page` | `--radius-sm` | none | Button, `variant="default"` |
| Contents nav | see 3.1 | Contents label, Nav item | graphite, ink | none | none | custom `nav` with links; Collapsible per chapter; ScrollArea when sticky |
| Section heading | single text, `h2` | Section heading | ink | none | none | custom |
| Intro prose | paragraph, `max-width: 760px` | Body prose | ink | none | none | custom |
| Formula block | see 3.2 | Formula term, Fraction terms, Note | bg `--color-fill`, ink, graphite | 6 (literal, equals `--radius-sm`) | none | custom (`FormulaBlock`) |
| Figure block | see 3.3 | Panel title, Note, Figure caption, Chart label | border `--color-border`, rule `--color-rule`, ink, graphite, guide gray | 6 | 1px `--color-border` | Card, restyled (no shadow, padding 20/24), plus custom `DemandCurveChart` |
| Common-mistake callout | see 3.4 | Callout label, Body prose, Callout quote | border `--color-ink`, ink, graphite | 6 | 1px `--color-ink` | Alert, restyled (AlertTitle + AlertDescription) |
| Footnotes | see 3.5 | Footnote | graphite, top rule `--color-rule` | none | top 1px `--color-rule` | custom ordered list |
| Footnote marker | Unicode superscript digit at end of a block | inherits block text | inherits | none | none | custom `sup > a`; **Proposal:** Tooltip with the source text |

### 3.1 Contents nav

```
Contents column           width 240, column, gap 12
├─ Label wrapper          padding-block 6 → 28 tall
│   └─ "CONTENTS"         13/16, 420, 0.08em, uppercase, graphite
└─ Chapter list           column, gap 0
    ├─ Chapter row        flex, gap 12, padding-block 6 → 32 tall
    │   └─ title          13/20, 420, graphite
    ├─ … (3 more rows; "Elasticity" is 500, ink)
    ├─ Section list       column, padding-bottom 4 → 132 tall (4 × 32 + 4)
    │   └─ Section row    flex, align center, padding-block 6, padding-left 16 → 32 tall
    │       └─ title      13/20, 420 graphite; current is 500 ink
    └─ Chapter row        "Government policy"
```

- Positions: label 84 to 112, list starts at 124. Rows: 124, 156, 188, 220 (Elasticity), section list 252 to 384, Government policy 384 to 416.
- Chapter rows have `gap: 12px` but a single child. That gap suggests a planned leading slot (number or status mark). Nothing is drawn there.
- Only the current chapter shows its sections. No chevrons, no hover fill, no left rule.
- Text never wraps at 240 in the sample. Long titles should wrap, not truncate. Row padding stays 6 so wrapped rows grow by 20 per line.
- Semantics: `nav aria-label="Contents"`, nested `ol`. Current section link gets `aria-current="page"`; current chapter link gets `aria-current="true"` or is marked by containing the current page.

### 3.2 Formula block

```
Box          bg --color-fill, radius 6, padding 20 24, column, gap 8   → 1072 × 113
├─ Row       flex, align-items center, gap 16                         → 45 tall
│   ├─ "Elasticity"   20/28, 420, ink
│   ├─ "="            20/28, 420, ink
│   └─ Fraction       column, align-items center, gap 4               → 18 + 4 + 1 + 4 + 18 = 45
│       ├─ numerator   13/18, 420, ink
│       ├─ bar         height 1, align-self stretch, bg --color-ink   (width = widest term)
│       └─ denominator 13/18, 420, ink, centered under the bar
└─ Note      13/20, 420, graphite, max-width 760
```

- The fraction bar lands at y 22 to 23 inside the 45px row, so it sits on the vertical center of `Elasticity` and `=`. Keep `align-items: center` and the 4/1/4 stack to get this for free.
- The bar is a div with a 1px ink background, not a text underline.
- Data: `{ lhs, numerator, denominator, note, noteRefs }`. A builder should not reach for a math renderer here. The terms are words.
- Accessibility: give the row `role="math"` or `role="img"` with `aria-label="Elasticity equals percent change in quantity demanded divided by percent change in price"`, and hide the visual parts from the accessibility tree.
- **Proposal:** for courses with real notation (MAT137), add an optional `tex` field rendered by KaTeX inside the same box. Out of scope for the ECO101 sample.

### 3.3 Figure block and the demand chart

```
Card         border 1px --color-border, radius 6, padding 20 24, column, gap 16  → 1072 × 387
├─ Panels    flex row, gap 48                                                    → 1022 × 296
│   ├─ Panel  flex 1 1 0%, column, gap 8     (each panel is 487 wide)
│   │   ├─ SVG chart       440 × 240, flex-shrink 0, left aligned (47px empty to its right)
│   │   ├─ Panel title     13/20, 500, ink
│   │   └─ Description     13/20, 420, graphite
│   └─ Panel  (same)
└─ Caption   border-top 1px --color-rule, padding-top 12; text 13/20, 420, ink
```

- Vertical math: 1 + 20 + 296 + 16 + 33 + 20 + 1 = 387. Panel: 240 + 8 + 20 + 8 + 20 = 296.
- Absolute positions: left SVG at x 353, y 362. Left plot origin lands at (403, 566).
- Semantics: `figure` with the caption in `figcaption`. Each panel title is not a heading; use a `p` or `h3` at the builder's choice, but keep the visual style.

#### SVG geometry (both panels share it)

ViewBox `0 0 440 240`, rendered at 440 × 240. Plot area in viewBox units:

| Constant | Value |
| --- | --- |
| Origin | (50, 204) |
| Plot left / right | x 50 / x 420 (370 wide) |
| Plot top / bottom | y 12 / y 204 (192 tall) |

Paint order and exact markup, as drawn:

| # | Element | Markup | Stroke / fill |
| --- | --- | --- | --- |
| 1 | Axes | `M50 12V204H420` | stroke ink, width 1, no caps, fill none |
| 2 | P2 guide | `M50 {yP2}H{xQ2}V204` | stroke `#9A9A95` (no token), width 1, `stroke-dasharray="3 3"` |
| 3 | P1 guide | `M50 {yP1}H{xQ1}V204` | same as P2 guide |
| 4 | Demand curve | `M{x0} {y0}L{x1} {y1}` | stroke ink, width 2, `stroke-linecap="round"` |
| 5 | Price-change bar | `M50 {yP2}V{yP1}` | stroke ink, width 4, butt caps (sits on the y axis, spans x 48 to 52) |
| 6 | Quantity-change bar | `M{xQ2} 204H{xQ1}` | stroke ink, width 4, butt caps (sits on the x axis) |
| 7 | Points | `circle r=3.5` at (xQ2, yP2) and (xQ1, yP1) | fill ink |
| 8 | Axis name `P` | `x=40 y=16 text-anchor=end` | fill graphite |
| 9 | Axis name `Q` | `x=420 y=226 text-anchor=end` | fill graphite |
| 10 | `P2`, `P1` | `x=40 y={yP+4} text-anchor=end` | fill ink |
| 11 | `Q2`, `Q1` | `x={xQ} y=222 text-anchor=middle` | fill ink |
| 12 | Curve label `D` | start anchored near the curve's lower end | fill ink |

All text: `font-family` Timeless Sans, `font-size` 12. In code use `var(--font-sans)` and `currentColor` or token vars, never the hex literals in the export.

Drawn values:

| | Curve from → to | P2 / P1 (y) | Q2 / Q1 (x) | D label |
| --- | --- | --- | --- | --- |
| Elastic | (67, 84) → (400, 132) | 96 / 120 | 150 / 317 | (404, 150) |
| Inelastic | (183, 24) → (250, 198) | 96 / 120 | 210.7 / 220 | (258, 194) |

The points lie on the curves to within 0.3px, so Q values are computed from the line, not placed by hand.

#### Data model that reproduces the drawing

Map data to the viewBox with `x = 50 + q / qMax * 370` and `y = 204 - p / pMax * 192`. With `qMax = 37` (10px per unit) and `pMax = 8` (24px per unit) the design comes back exactly:

```ts
type DemandPanel = {
  title: string;
  description: string;
  domain: { qMax: number; pMax: number };
  curve: { from: { q: number; p: number }; to: { q: number; p: number }; label: string };
  p1: number; // starting price
  p2: number; // new price
};

const elasticPanel: DemandPanel = {
  title: "Elastic demand",
  description: "Quantity falls a lot. Restaurant meals, a specific brand of cereal.",
  domain: { qMax: 37, pMax: 8 },
  curve: { from: { q: 1.7, p: 5 }, to: { q: 35, p: 3 }, label: "D" },
  p1: 3.5,
  p2: 4.5,
};

const inelasticPanel: DemandPanel = {
  title: "Inelastic demand",
  description: "Quantity barely moves. Gasoline, insulin, your phone bill.",
  domain: { qMax: 37, pMax: 8 },
  curve: { from: { q: 13.3, p: 7.5 }, to: { q: 20, p: 0.25 }, label: "D" },
  p1: 3.5,
  p2: 4.5,
};
```

Derived values (good unit-test fixtures):

| | Q2 | Q1 | x(Q2) | x(Q1) | Midpoint elasticity |
| --- | --- | --- | --- | --- | --- |
| Elastic | 10.03 | 26.68 | 150.25 | 316.75 | about 3.6 (elastic) |
| Inelastic | 16.07 | 17.00 | 210.72 | 219.97 | about 0.22 (inelastic) |

`Q(p) = from.q + (from.p - p) * (to.q - from.q) / (from.p - to.p)`.

#### Label rules the component must encode

- **Q label collision.** In the inelastic panel Q2 and Q1 are 9.3px apart. The design merges them into one label `Q2 Q1` at x 215 (the rounded midpoint). Rule: if `|x(Q1) - x(Q2)| < 24`, draw one label with both names, ordered by x, at the midpoint.
- **P label collision.** P2 and P1 are 24px apart in both panels, so no merge is drawn. Apply the same 24px rule vertically for other data, joining as `P1 P2` on one line.
- **Curve label `D`.** The two panels use different hand-placed offsets from the curve's lower end: (+4, +18) on the shallow curve, (+8, -4) on the steep one. **Proposal:** if the curve's visual slope `|dy/dx| > 1`, place at end + (8, -4); otherwise at end + (4, 18). That reproduces both panels.
- Highlight bars always run between the two prices and the two quantities, whichever is larger.
- **Proposal:** at widths below 440, do not scale the whole viewBox down (12px labels would shrink to about 8px at 311 wide). Measure the container with ResizeObserver, keep labels at 12px, and recompute `plotRight = width - 20`, keeping the left margin 50 and the vertical geometry fixed.
- Accessibility: `role="img"` with an `aria-label` built from data, for example "Elastic demand curve. Price rises from P1 to P2. Quantity falls from Q1 to Q2, a large drop."

### 3.4 Common-mistake callout

```
Box        border 1px --color-ink, radius 6, padding 20 24, column, gap 8   → 1072 × 140
├─ Label   13/16, 500, ink: "Common mistake · will be on the midterm"
├─ Body    13/22, 420, ink, max-width 760 (two lines, 44)
└─ Quote   13/22, 420, graphite, max-width 760 (one line, 22)
```

- Height math: 2 + 40 + 16 + 8 + 44 + 8 + 22 = 140.
- The ink border is the only visual difference from the figure card (which uses `--color-border`). It marks the block as an exam hint. The label text says the same thing in words, so the state is not carried by color alone.
- The label is two data fields joined with ` · `: `label` ("Common mistake") and an optional `examHint` ("will be on the midterm"). Without an exam hint, show only `Common mistake`. **Proposal:** without an exam hint, the border drops to `--color-border`.
- The quote is optional. Render it as `blockquote` with the attribution as plain text after the closing quote.
- Semantics: `aside` or `role="note"`, with the label as its accessible name. Do not use `role="alert"`; it is static content.

### 3.5 Footnotes

```
List       border-top 1px --color-rule, padding-top 16, column, gap 6, align-self stretch → 115 tall
└─ Row     flex, gap 8
    ├─ number   width 16, flex-shrink 0, 13/20, 420, graphite
    └─ text     13/20, 420, graphite
```

- Height math: 1 + 16 + 4 × 20 + 3 × 6 = 115.
- Numbers are plain digits with no period. The 16px slot keeps all text in one lane up to footnote 9. **Proposal:** widen to 20 if a section can exceed 9 footnotes.
- Markers in the body are Unicode superscripts (`¹ ² ³ ⁴`) appended to the last word with no space. Build them as `<sup><a href="#fn-1" id="fnref-1">1</a></sup>` instead (see section 6).
- Semantics: `ol` inside a `section aria-label="Sources"`; each `li` has `id="fn-n"`.

---

## 4. States

| State | Where | How it is drawn | Carried by more than color? |
| --- | --- | --- | --- |
| Current chapter | Contents | `Elasticity` in ink, weight 500; its sections are shown beneath it | Yes: weight and disclosure of children |
| Current section | Contents | `Price elasticity of demand` in ink, weight 500, indented 16 | Yes: weight |
| Default nav item | Contents | graphite, weight 420 | n/a |
| Expanded chapter | Contents | child section list visible, padding-bottom 4 | Yes: presence of children. No chevron is drawn. |
| Collapsed chapter (inferred) | Contents | title only | Same as above |
| Selected course | Toolbar | `ECO101` shown in the Select trigger and in the page title | Yes: text |
| Primary vs secondary action | Toolbar | Quiz is ink fill with page text; Select and Export are control fill with ink text | Fill contrast only. Acceptable since labels differ. |
| Exam hint ("flagged") | Callout | ink 1px border plus label text `will be on the midterm` | Yes: label text |
| Price and quantity change | Chart | 4px ink bars on both axes, dots at both points, dashed guides | Yes: thickness and shape, all grayscale |
| Elastic vs inelastic | Chart | curve slope plus panel title and description | Yes: text |

Not drawn. **Proposals**, using only Cue tokens:

| State | Proposal |
| --- | --- |
| Nav hover | Text goes to `--color-ink`. Keep weight 420 so nothing shifts. No background. |
| Nav focus-visible | 2px outline `--color-ink`, offset 2, radius `--radius-sm`. |
| Button hover | Secondary: bg `color-mix(in oklch, var(--color-control), var(--color-ink) 6%)`. Primary: bg `color-mix(in oklch, var(--color-ink) 88%, var(--color-page))`. |
| Button pressed | `transform: scale(0.97)`, 120ms ease-out. |
| Button focus-visible | 2px outline `--color-ink`, offset 2. |
| Select open | Popup list of courses (`CSC148`, `ECO101`, `MAT137`), 13/20 items, check mark on the current course, popup bg `--color-page`, border `--color-border`, radius `--radius-sm`. |
| Export in progress | Button label becomes `Exporting…` and the button is disabled. Restore on finish. |
| Generating (loading) | Each block shows a `--color-wash` placeholder with the block's real box size (heading 28, prose 44, formula 113, figure 387, callout 140). Above them a 13/20 graphite line: `Writing this section from Lecture 7, slides and textbook ch. 5.` Blocks replace placeholders as they arrive. |
| Empty course | Chapter column shows 13/22 ink text `No material for ECO101 yet. Add a lecture, slides or a textbook chapter and Cue will write the guide.` with a secondary Button `Add material`. Contents list hidden. Quiz and Export disabled. |
| Stale section | 13/20 graphite line under the heading: `Lecture 8 added. Rewrite this section?` with a secondary Button `Rewrite`. |
| Generation error | Callout-style box with `--color-border`, label `Couldn't write this section`, body with the reason, secondary Button `Try again`. |
| Footnote target | When reached by link, the footnote row text goes to `--color-ink` for 1.5s, then back to graphite. |

---

## 5. Interactions

### Controls

| Control | Action |
| --- | --- |
| Course Select | Switches the guide to another course. Opens that course's last-read section, or its first section. Updates the page title. |
| Export PDF | Exports the guide for the selected course. **Proposal:** whole guide, built from a print stylesheet (hide toolbar and nav, keep figures, footnotes per section). |
| Quiz me on this section | Opens Practice with new questions generated from the current section. The callout and footnoted problem sets (Problem Set 4, Q1 and Q2) seed the questions. |
| Chapter link | Goes to the chapter's first section and expands that chapter. Other chapters collapse. |
| Section link | Goes to that section. The design shows one section per page, so routing is per section. **Proposal:** `/guide/[course]/[chapter]/[section]`. |
| Footnote marker | Jumps to the footnote and moves focus to it. **Proposal:** hover or focus shows a Tooltip with the footnote text. |
| Footnote source | **Proposal:** each source is a link. `Lecture 7 at 4:15` opens Lecture notes at that timestamp. `Lecture 7 slides 6–8` opens the slide viewer at slide 6. `Problem Set 4, Q1` opens Practice on that question. Textbook refs open the textbook page if one is stored, otherwise stay plain text. |

### Keyboard (proposal)

- Tab order: course Select, Export PDF, Quiz me, contents links in reading order, then footnote markers in the body, then footnote source links.
- Select follows Base UI defaults: Enter or Space opens, arrows move, typeahead on course codes, Escape closes.
- `[` and `]` go to the previous and next section. Ignore them when focus is in a text field. Add a way to turn single-key shortcuts off (WCAG 2.1.4).
- Footnote rows get a back link (`↩`, `aria-label="Back to text"`) so keyboard users can return.

### Responsive (proposal)

| Width | Behavior |
| --- | --- |
| ≥ 1024 | As drawn. If the page sits in the app shell with the 232px sidebar, the chapter column is about 840 wide. The chart must then be fluid (see 3.3 and section 6). |
| 768 to 1023 | Contents column is hidden. A secondary Button `Contents` appears first in the toolbar's right group and opens a left Sheet with the same nav. Chapter column is full width. Figure panels stay side by side while each panel is at least 320 wide (container query on the figure card); below that they stack with `gap: 24px`. |
| 375 | Page gutter 16. Toolbar becomes two rows: title (wraps, no truncation), then `Contents`, course Select and a DropdownMenu (`…`) holding Export PDF. `Quiz me on this section` moves to a full-width sticky bottom bar, 44 tall, with `padding-bottom: env(safe-area-inset-bottom)`. Block padding drops from 20/24 to 16/16. Formula row gets `flex-wrap: wrap; row-gap: 8px` so the fraction can drop under `Elasticity =`. Figure panels stack; charts use the measured-width layout from 3.3 at 311 wide. Footnotes unchanged. |

---

## 6. Inconsistencies and flags

1. **Hex colors inside the chart SVG.** The export uses `#141414` (equals `--color-ink`), `#6A6A66` (equals `--color-graphite`) and `#9A9A95` (no token). `scripts/check-tokens.mjs` will fail on any of them. Map the first two to tokens. Add a token for the guide gray. Suggested: `--color-guide: oklch(68.5% 0.0072 106.6)`. It sits between graphite (52.3%) and border (87.4%) and shares their hue (106.6).
2. **Chart labels are 12px.** The shared Cue scale is 13 and 20. `--text-xs` (12) exists and the Today course tag also uses 12, so 12 is not foreign to the file. Decide once. If kept, use `--text-xs`.
3. **Chart font is a literal.** SVG text uses `fontFamily="Timeless Sans"`. Use `var(--font-sans)` so fallbacks apply.
4. **Radii are literal `6px`** on the formula, figure and callout boxes. Same value as `--radius-sm`. Use the token.
5. **No app sidebar on this artboard.** Only Today (`1-0`) draws the 232px sidebar. Study session, Calendar, Practice, Lecture notes and Study guide are drawn full width at 1440. If the guide lives in the shell, the chapter column shrinks from 1072 to about 840. The figure's inner width becomes about 792, so each panel is about 372, less than the fixed 440 SVG. The SVG would overflow. The chart must be fluid.
6. **Empty 48px gap wrappers.** Every chapter-column block is wrapped in `display: flex; gap: 48px` with one child. This looks like a reserved margin column (marginalia, or a "source" rail). Build without the wrappers unless a margin column is added to the design.
7. **Empty 12px gap in chapter rows.** Chapter rows have `gap: 12px` and one child. Section rows do not. Same pattern as item 6: a leading slot that was never filled.
8. **Title and section heading look alike.** Both are 20px, 420, -0.02em, ink. Only line height differs (24 vs 28). Hierarchy comes from position alone. Also, the chapter name `Elasticity` appears only in the nav, not above the section heading.
9. **Formula term tracking.** `Elasticity` and `=` are 20px with no tracking. Every other 20px text uses -0.02em.
10. **Bottom padding.** Main has `padding-bottom: 48px`. Lecture notes uses 32. Other screens are fixed 900 tall, this one is fit-content (1079).
11. **Unicode superscripts.** Footnote markers are the glyphs `¹²³⁴` inside the text. Timeless Sans may not include them, which forces a fallback font mid-line. Use `<sup>` with real digits, 0.75em, line-height 0.
12. **Hand-placed chart labels.** The `D` label offsets differ between panels, and the inelastic panel merges `Q2 Q1` by hand. Section 3.3 turns both into rules.
13. **Chapter numbering.** The Paper layer is named "Chapter 4 sections" (Elasticity is the fourth chapter in the guide). Footnotes cite "Textbook ch. 5". The UI shows no numbers, but the data model must keep guide order and textbook chapter separately.
14. **No interaction states drawn.** Nav hover, focus, button hover and pressed, the open Select, loading and empty states are all absent. Section 4 proposes them.
15. **Consistent with the shared style.** Only weights 420 and 500 appear. Only sizes 13 and 20 appear outside the chart. All colors are grayscale tokens; `--color-highlight`, `--color-ballpoint` and the course colors are unused here. Controls match Practice and Calendar exactly (32 tall, padding 8/15, Select padding 8/11/8/15, gap 8, `--radius-sm`, `--color-control`). The toolbar title matches the other screens (20/24, 420, -0.02em).
16. **OKLCH.** The Paper tokens are hex. For reference, the ones used here in OKLCH: ink `oklch(19.1% 0 0)`, graphite `oklch(52.3% 0.0062 106.6)`, border `oklch(87.4% 0.0081 106.6)`, rule `oklch(93% 0.0067 106.5)`, fill `oklch(95.1% 0.0053 106.5)`, control `oklch(92.4% 0.004 106.5)`, page `oklch(100% 0 0)`.
17. **Contrast.** Graphite on page is about 5.4:1 and graphite on fill (formula note) is about 4.7:1. Both pass AA for 13px. The dashed guide gray on page is about 2.8:1. That is fine for decorative guides, but it should not carry meaning.
18. **Code blocks (added for programming courses).** Paper draws no code in a guide, and a CSC148 section needs it. The block reuses the study session's Code block (`study-session.md` section 4): `pre > code`, `--font-mono` 13/22 420, `--color-fill`, radius 4, padding 16 20, `white-space: pre`, scrolling sideways inside the column at 375. A caption in 13/20 ink sits under it and carries the footnote markers, like a figure. The block is a region named by its caption and takes keyboard focus, so a wide block can be scrolled with the arrow keys. On paper it fills the column and wraps long lines, because paper cannot scroll.
