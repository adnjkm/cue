import { describe, expect, it } from "vitest";
import { guideBlockDraft, guideOutline } from "./schema";

const levels = (levels: number[]) => ({
  kind: "levels",
  axes: { x: "Q", y: "P" },
  domain: { xMax: 37, yMax: 8 },
  curve: { from: { x: 1.7, y: 5 }, to: { x: 35, y: 3 }, label: "D" },
  levels,
  levelNames: ["P1", "P2"],
});

describe("guideBlockDraft", () => {
  it("strips passage markers and superscripts the model put in the text, and drops null fields", () => {
    const block = guideBlockDraft.parse({ kind: "callout", label: "Common mistake", examHint: null, text: "Slope is not elasticity [S2]¹.", refs: [{ passage: "S2", relation: null, note: null }], quote: null });
    expect(block).toEqual({ kind: "callout", label: "Common mistake", text: "Slope is not elasticity.", refs: [{ passage: "S2" }] });
  });

  it("drops a figure whose price levels miss the curve, keeps one that hits it", () => {
    const figure = (chart: object) => ({ kind: "figure", panels: [{ title: "Elastic demand", description: "Quantity falls a lot.", chart }], caption: "A price rise.", refs: [] });
    expect(guideBlockDraft.safeParse(figure(levels([3.5, 4.5]))).success).toBe(true);
    expect(guideBlockDraft.safeParse(figure(levels([3.5, 6]))).success).toBe(false);
  });

  it("keeps a code block’s indentation and line breaks, dropping a wrapping fence and a stray marker", () => {
    const block = guideBlockDraft.parse({
      kind: "code",
      lang: "Python",
      text: "```python\n\ndef is_empty(self) -> bool:\r\n    return self._root is None  [S6]\n```",
      caption: "`Tree.is_empty` is true exactly when the tree has no root value.",
      refs: [{ passage: "S6", relation: null, note: null }],
    });
    expect(block).toEqual({ kind: "code", lang: "python", text: "def is_empty(self) -> bool:\n    return self._root is None", caption: "`Tree.is_empty` is true exactly when the tree has no root value.", refs: [{ passage: "S6" }] });
  });

  it("drops a code block with no code, no caption or a runaway length", () => {
    const code = (text: string, caption = "A method.") => guideBlockDraft.safeParse({ kind: "code", lang: null, text, caption, refs: [] }).success;
    expect(code("return 1")).toBe(true);
    expect(code("")).toBe(false);
    expect(code(" \n\t\n")).toBe(false);
    expect(code("```python\n```")).toBe(false);
    expect(code("return 1", " ")).toBe(false);
    expect(code(Array.from({ length: 26 }, (_, i) => `x = ${i}`).join("\n"))).toBe(false);
  });
});

describe("guideOutline", () => {
  it("removes numbering and repeated sections, and drops a chapter left empty", () => {
    const outline = guideOutline.parse({
      chapters: [
        { title: "Chapter 4: elasticity", textbookChapter: 5, sections: ["4.1 What elasticity measures", "Price elasticity of demand"] },
        { title: "Review", textbookChapter: null, sections: ["price elasticity of demand"] },
      ],
    });
    expect(outline).toEqual({ chapters: [{ title: "Elasticity", textbookChapter: 5, sections: ["What elasticity measures", "Price elasticity of demand"] }] });
  });
});
