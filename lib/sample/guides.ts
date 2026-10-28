import { ids, slugify, type ChapterId, type FootnoteSource, type GuideBlock, type GuideChapter, type GuideSection, type MaterialId, type SourceRef } from "@/lib/domain";
import type { SampleFragment } from "./context";
import { SAMPLE } from "./ids";

const ECO = SAMPLE.courses.eco101;
const at = (m: number, s: number) => (m * 60 + s) * 1000;

const OUTLINE: { title: string; textbookChapter?: number; sections: string[] }[] = [
  { title: "Thinking like an economist", textbookChapter: 2, sections: ["Scarcity and trade-offs", "Models and assumptions"] },
  { title: "Gains from trade", textbookChapter: 3, sections: ["Comparative advantage", "Specialization"] },
  { title: "Supply and demand", textbookChapter: 4, sections: ["Demand", "Supply", "Equilibrium"] },
  { title: "Elasticity", textbookChapter: 5, sections: ["What elasticity measures", "Price elasticity of demand", "Elasticity and total revenue", "Elasticity of supply"] },
  { title: "Government policy", textbookChapter: 6, sections: ["Price ceilings and floors", "Taxes"] },
];

const lecture7 = (m: number, s: number): SourceRef => ({ kind: "transcript", lectureId: SAMPLE.lectures.eco101Lecture7, courseId: ECO, lectureNumber: 7, atMs: at(m, s) });
const textbook = (extra: Partial<Extract<SourceRef, { kind: "page" }>>): SourceRef => ({ kind: "page", materialId: SAMPLE.materials.eco101Textbook, doc: { kind: "textbook", title: "Textbook" }, page: 1, ...extra });
const ps4 = (q: number): SourceRef => ({ kind: "page", materialId: SAMPLE.materials.eco101Ps4 as MaterialId, doc: { kind: "problemSet", title: "Problem Set 4", short: "PS4" }, page: q, label: `Q${q}` });

const BLOCKS: GuideBlock[] = [
  {
    kind: "prose",
    text: "Price elasticity of demand measures how strongly buyers react to a price change. If a small price rise makes people buy a lot less, demand is elastic. If they keep buying about the same amount, demand is inelastic.",
    refs: [1],
  },
  {
    kind: "formula",
    lhs: "Elasticity",
    numerator: "% change in quantity demanded",
    denominator: "% change in price",
    note: "Above 1 is elastic, below 1 is inelastic. Use the midpoint method so the answer is the same whether price rises or falls.",
    noteRefs: [2],
  },
  {
    kind: "figure",
    panels: [
      {
        title: "Elastic demand",
        description: "Quantity falls a lot. Restaurant meals, a specific brand of cereal.",
        chart: { kind: "levels", axes: { x: "Q", y: "P" }, domain: { xMax: 37, yMax: 8 }, curve: { from: { x: 1.7, y: 5 }, to: { x: 35, y: 3 }, label: "D" }, levels: [3.5, 4.5], levelNames: ["P1", "P2"] },
      },
      {
        title: "Inelastic demand",
        description: "Quantity barely moves. Gasoline, insulin, your phone bill.",
        chart: { kind: "levels", axes: { x: "Q", y: "P" }, domain: { xMax: 37, yMax: 8 }, curve: { from: { x: 13.3, y: 7.5 }, to: { x: 20, y: 0.25 }, label: "D" }, levels: [3.5, 4.5], levelNames: ["P1", "P2"] },
      },
    ],
    caption: "The same price rise, from P1 to P2, on two demand curves.",
    refs: [3],
  },
  {
    kind: "callout",
    label: "Common mistake",
    examHint: "will be on the midterm",
    text: "Slope is not elasticity. A straight-line demand curve has the same slope everywhere, but its elasticity changes along the line: elastic near the top, where prices are high, and inelastic near the bottom.",
    refs: [4],
    quote: { text: "Half of you will look at a steep line and write ‘inelastic’. Read the percentages, not the picture.", attribution: "Prof. Okafor" },
  },
];

const FOOTNOTES: { n: number; sources: FootnoteSource[] }[] = [
  { n: 1, sources: [{ ref: lecture7(4, 15) }, { ref: textbook({ section: "§5.1", label: "p. 92" }) }] },
  { n: 2, sources: [{ ref: { kind: "page", materialId: SAMPLE.materials.eco101L7Slides, doc: { kind: "slides", title: "Lecture 7 slides", lectureNumber: 7 }, page: 6, to: 8 } }, { ref: ps4(1), relation: "used" }] },
  { n: 3, sources: [{ ref: lecture7(18, 40), note: "redrawn from the whiteboard sketch" }, { ref: textbook({ page: 3, section: "§5.1", figure: "5-1" }) }] },
  { n: 4, sources: [{ ref: lecture7(31, 10) }, { ref: ps4(2), relation: "tested" }] },
];

function plainText(blocks: readonly GuideBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "prose":
          return b.text;
        case "formula":
          return `${b.lhs} = ${b.numerator} ÷ ${b.denominator}. ${b.note ?? ""}`.trim();
        case "figure":
          return [...b.panels.map((p) => `${p.title}: ${p.description}`), b.caption].join(" ");
        case "callout":
          return `${b.label}: ${b.text}${b.quote ? ` “${b.quote.text}” ${b.quote.attribution}` : ""}`;
      }
    })
    .join("\n\n");
}

/** Study guides' sample rows: the ECO101 outline with the Paper section drafted, last read. */
export const guidesSample: SampleFragment<"guides" | "guideSections"> = (ctx) => {
  const chapters: GuideChapter[] = OUTLINE.map((c) => ({
    id: `${ECO}.${slugify(c.title)}` as ChapterId,
    title: c.title,
    ...(c.textbookChapter ? { textbookChapter: c.textbookChapter } : {}),
    sections: c.sections.map((title) => ({ id: ids.section(ECO, slugify(title)), title })),
  }));
  let order = 0;
  const sections: GuideSection[] = chapters.flatMap((c) =>
    c.sections.map((s) => ({
      id: s.id,
      courseId: ECO,
      chapterId: c.id,
      order: order++,
      title: s.title,
      ...(s.id === SAMPLE.sections.priceElasticity
        ? { draft: { blocks: BLOCKS, footnotes: FOOTNOTES, plainText: plainText(BLOCKS), generatedAt: ctx.at(4, "20:00", -1), sourceStamp: ctx.now } }
        : {}),
    })),
  );
  return {
    guides: [{ courseId: ECO, chapters, outlinedAt: ctx.at(4, "20:00", -1), lastRead: { sectionId: SAMPLE.sections.priceElasticity, at: ctx.at(1, "21:00") } }],
    guideSections: sections,
  };
};
