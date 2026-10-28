import { describe, expect, it } from "vitest";
import type { CourseId, LectureId, MaterialId, Passage, SourceRef } from "@/lib/domain";
import { footnoteText } from "@/lib/sources";
import { footnoteParts, numberFootnotes } from "./cites";
import type { GuideBlockDraft } from "./schema";

const at = (m: number, s: number) => (m * 60 + s) * 1000;
const lecture7 = (m: number, s: number): SourceRef => ({ kind: "transcript", lectureId: "lec.evt_l7" as LectureId, courseId: "ECO101" as CourseId, lectureNumber: 7, atMs: at(m, s) });
const textbook = (extra: object): SourceRef => ({ kind: "page", materialId: "mat_text" as MaterialId, doc: { kind: "textbook", title: "Textbook" }, page: 1, ...extra });
const slide = (page: number): SourceRef => ({ kind: "page", materialId: "mat_l7" as MaterialId, doc: { kind: "slides", title: "Lecture 7 slides", lectureNumber: 7 }, page, title: `Slide ${page}` });
const ps4 = (q: number): SourceRef => ({ kind: "page", materialId: "mat_ps4" as MaterialId, doc: { kind: "problemSet", title: "Problem Set 4", short: "PS4" }, page: q, label: `Q${q}` });

const refs: SourceRef[] = [
  lecture7(4, 15),
  textbook({ section: "§5.1", label: "p. 92" }),
  slide(6),
  slide(7),
  slide(8),
  ps4(1),
  lecture7(18, 40),
  textbook({ section: "§5.1", figure: "5-1" }),
  lecture7(31, 10),
  ps4(2),
];
const passages: Passage[] = refs.map((ref, i) => ({ id: `S${i + 1}` as Passage["id"], ref, label: `label ${i + 1}`, text: `text ${i + 1}` }));

const drafts: GuideBlockDraft[] = [
  { kind: "prose", text: "Price elasticity of demand measures how strongly buyers react.", refs: [{ passage: "S1" }, { passage: "S2" }] },
  { kind: "prose", text: "An aside with nothing to cite.", refs: [] },
  {
    kind: "formula",
    lhs: "Elasticity",
    numerator: "% change in quantity demanded",
    denominator: "% change in price",
    note: "Above 1 is elastic.",
    noteRefs: [{ passage: "S4" }, { passage: "S3" }, { passage: "S5" }, { passage: "S6", relation: "used" }],
  },
  { kind: "prose", text: "Cites a passage that was never sent.", refs: [{ passage: "S99" }] },
  { kind: "figure", panels: [], caption: "The same price rise.", refs: [{ passage: "S7", note: "redrawn from the whiteboard sketch" }, { passage: "S8" }, { passage: "S7", note: "redrawn from the whiteboard sketch" }] },
  { kind: "callout", label: "Common mistake", examHint: "will be on the midterm", text: "Slope is not elasticity.", refs: [{ passage: "S9" }, { passage: "S10", relation: "tested" }] },
];

describe("numberFootnotes", () => {
  const { blocks, footnotes } = numberFootnotes(drafts, passages);

  it("gives each block with a resolvable cite one footnote, numbered in reading order", () => {
    expect(blocks.map((b) => (b.kind === "formula" ? b.noteRefs : b.refs))).toEqual([[1], [], [2], [], [3], [4]]);
    expect(footnotes.map((f) => f.n)).toEqual([1, 2, 3, 4]);
  });

  it("writes the four Paper footnotes, merging slides 6 to 8 and dropping the repeated cite", () => {
    expect(footnotes.map((f) => footnoteText(f.sources))).toEqual([
      "Lecture 7 at 4:15. Textbook ch. 5, p. 92.",
      "Lecture 7 slides 6–8. Used in Problem Set 4, Q1.",
      "Lecture 7 at 18:40, redrawn from the whiteboard sketch. Textbook Figure 5-1.",
      "Lecture 7 at 31:10. Tested in Problem Set 4, Q2.",
    ]);
  });

  it("numbers a stream the same way at every prefix, so markers never renumber as blocks arrive", () => {
    for (let n = 1; n <= drafts.length; n++) {
      const partial = numberFootnotes(drafts.slice(0, n), passages);
      expect(partial.blocks).toEqual(blocks.slice(0, n));
      expect(partial.footnotes).toEqual(footnotes.slice(0, partial.footnotes.length));
    }
  });

  it("splits a footnote into one piece per source that reads the same as footnoteText", () => {
    for (const f of footnotes) expect(footnoteParts(f.sources).map((p) => p.text).join(" ")).toBe(footnoteText(f.sources));
    expect(footnoteParts(footnotes[1].sources).map((p) => p.text)).toEqual(["Lecture 7 slides 6–8.", "Used in Problem Set 4, Q1."]);
  });

  it("numbers a code block’s footnote in sequence with the blocks around it", () => {
    const code: GuideBlockDraft = { kind: "code", lang: "python", text: "def f():\n    return 1", caption: "A method.", refs: [{ passage: "S3" }] };
    const withCode = numberFootnotes([drafts[0], code, drafts[2], { ...code, refs: [] }, drafts[5]], passages);
    expect(withCode.blocks.map((b) => (b.kind === "formula" ? b.noteRefs : b.refs))).toEqual([[1], [2], [3], [], [4]]);
    expect(withCode.footnotes.map((f) => [f.n, footnoteText(f.sources)])).toEqual([
      [1, "Lecture 7 at 4:15. Textbook ch. 5, p. 92."],
      [2, "Lecture 7 slides 6."],
      [3, "Lecture 7 slides 6–8. Used in Problem Set 4, Q1."],
      [4, "Lecture 7 at 31:10. Tested in Problem Set 4, Q2."],
    ]);
  });

  it("keeps slides that are not consecutive apart", () => {
    const gap = numberFootnotes([{ kind: "prose", text: "x", refs: [{ passage: "S3" }, { passage: "S5" }] }], passages);
    expect(footnoteText(gap.footnotes[0].sources)).toBe("Lecture 7 slides 6. Lecture 7 slides 8.");
  });
});
