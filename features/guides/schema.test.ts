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
