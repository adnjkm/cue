import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask, listTask } from "@/lib/ai/define";
import { passagesBlock, passagesSchema, STYLE } from "@/lib/ai/passages";
import type { CourseId, LectureId, MaterialId, Passage, SourceRef } from "@/lib/domain";
import { guideBlockDraft, guideOutline, type GuideBlockDraft, type GuideOutline } from "./schema";

const OUTLINE_SYSTEM = `You are Cue, planning a study guide for one university course. The guide reads like a short textbook written from the student's own course material, one section per page.

You receive the course code, the materials the student added (title, kind and the headings found inside) and the lectures with their topics.

Return the chapters in teaching order. A chapter is one big idea of the course. Its sections are the ideas a student must understand, in the order they build on each other.
- 3 to 8 chapters, each with 2 to 6 sections. Fewer when the material is thin: never pad.
- Titles in sentence case, 2 to 6 words, in the words a student would use: "Price elasticity of demand", "Recursion on trees". No numbers, no "Chapter 3", no "Introduction to", no colons.
- Every section must be teachable from the listed material. Do not add topics the material does not cover.
- Section titles are unique across the whole guide.
- "textbookChapter": the textbook's chapter number when a textbook heading or section mark (like §5.2) shows which chapter this chapter follows, otherwise null. Keep it apart from the guide's own order.`;

const SECTION_SYSTEM = `You are Cue, writing one section of a study guide from a student's own course material. Write like a clear textbook: short declarative sentences, concrete examples from the material, no filler, no "In this section", no headings.

You receive the course, the chapter and section titles, passages from the course material marked [S1], [S2] and so on, exam hints the professor gave in lectures, and answers the student saved while studying.

Return 2 to 8 blocks in reading order. Each block is one of:
- "prose": one paragraph of 2 to 4 sentences. The first block is prose that says what the idea is and why it matters.
- "formula": only for a quantity defined as a ratio. "lhs" names the quantity, "numerator" and "denominator" are written in words ("% change in price"), not symbols. "note" is one or two sentences on how to read or use it.
- "figure": only when a picture teaches what words cannot. 1 or 2 "panels", each with a "title", a one-sentence "description" with everyday examples, and a "chart", plus one "caption" for the whole figure. Charts:
  - "levels": a straight line with two horizontal levels on it, like a demand curve and a price change. "curve" runs between two points inside "domain"; both "levels" lie between the curve's two y values. Use axes { "x": "Q", "y": "P" } and levelNames ["P1", "P2"] for price and quantity.
  - "series": up to 3 labelled lines through points, for growth or change over x.
  - "bars": 2 to 8 labelled values to compare.
- "callout": the one mistake students make most often on this idea, at most one per section, with "label" "Common mistake". When an exam hint fits this section, set "examHint" to where it will be tested, phrased like "will be on the midterm", and "quote" the professor's words exactly as given with the speaker as "attribution". Otherwise both are null.
- "code": only when the passages show code. Copy the code a passage shows, or trim it to the part this section needs. Never invent functions, library calls or APIs the passages do not show. Under 15 lines. "lang" is the language in lower case, like "python". "text" is the code itself with its line breaks and indentation, no Markdown fences and no comments you added. "caption" is one sentence naming what the code does, like "\`Tree.__len__\` counts the root, then the size of each subtree." Explain how the code works in a prose block before or after it.

Citations: every block cites the passages it was written from in "refs" ("noteRefs" for a formula), most important first, at most 3, as { "passage": "S2", "relation": null, "note": null }. Set "relation" to "used" when the passage is a problem set or past-paper question that uses the idea, and "tested" when it tests it. Set "note" to a short phrase only when the block changes the source, like "redrawn from the whiteboard sketch". Cite only passage ids you were given, and never put markers or footnote numbers in the text.

Base every claim on the passages. When the passages do not cover something, leave it out. ${STYLE}`;

const materialKind = z.enum(["slides", "textbook", "handout", "problemSet", "pastPaper", "notes", "syllabus", "other"]);

const outlineInput = z.object({
  course: z.string().trim().min(1).max(16),
  materials: z
    .array(z.object({ title: z.string().max(120), kind: materialKind, headings: z.array(z.string().max(120)).max(40) }))
    .max(30),
  lectures: z.array(z.object({ number: z.number().int().optional(), topic: z.string().max(120).optional() })).max(60),
});
type OutlineInput = z.infer<typeof outlineInput>;

const sectionInput = z.object({
  course: z.string().trim().min(1).max(16),
  chapter: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(80),
  passages: passagesSchema,
  hints: z.array(z.object({ quote: z.string().max(400), attribution: z.string().max(60), assessment: z.string().max(40).optional() })).max(8),
  savedAnswers: z.array(z.string().max(2000)).max(4),
});
type SectionInput = z.infer<typeof sectionInput>;

function outlineUser({ course, materials, lectures }: OutlineInput): string {
  return [
    `Course: ${course}`,
    "",
    "Materials:",
    ...(materials.length ? materials.map((m) => `- ${m.title} (${m.kind})${m.headings.length ? `: ${m.headings.join("; ")}` : ""}`) : ["(none)"]),
    "",
    "Lectures:",
    ...(lectures.length ? lectures.map((l) => `- ${l.number === undefined ? "Lecture" : `Lecture ${l.number}`}${l.topic ? `: ${l.topic}` : ""}`) : ["(none)"]),
  ].join("\n");
}

function sectionUser({ course, chapter, section, passages, hints, savedAnswers }: SectionInput): string {
  return [
    `Course: ${course}`,
    `Chapter: ${chapter}`,
    `Section: ${section}`,
    "",
    "Exam hints from lectures:",
    ...(hints.length ? hints.map((h) => `- “${h.quote}” ${h.attribution}${h.assessment ? `, about the ${h.assessment}` : ""}`) : ["(none)"]),
    "",
    "Answers the student saved:",
    ...(savedAnswers.length ? savedAnswers.map((a) => `- ${a}`) : ["(none)"]),
    "",
    "Passages:",
    passagesBlock(passages),
  ].join("\n");
}

/** The sample's outlines, so "Write this guide" plans the drawn chapters with no key. */
const SAMPLE_OUTLINES: Record<string, GuideOutline["chapters"]> = {
  ECO101: [
    { title: "Thinking like an economist", textbookChapter: 2, sections: ["Scarcity and trade-offs", "Models and assumptions"] },
    { title: "Gains from trade", textbookChapter: 3, sections: ["Comparative advantage", "Specialization"] },
    { title: "Supply and demand", textbookChapter: 4, sections: ["Demand", "Supply", "Equilibrium"] },
    { title: "Elasticity", textbookChapter: 5, sections: ["What elasticity measures", "Price elasticity of demand", "Elasticity and total revenue", "Elasticity of supply"] },
    { title: "Government policy", textbookChapter: 6, sections: ["Price ceilings and floors", "Taxes"] },
  ],
  CSC148: [
    { title: "Trees", textbookChapter: 5, sections: ["Trees and their parts", "Recursion on trees"] },
    { title: "Tree traversals", textbookChapter: 5, sections: ["Preorder traversal", "Postorder traversal", "Inorder and level order"] },
    { title: "Binary search trees", sections: ["Searching a binary search tree", "Height and running time"] },
  ],
  MAT137: [{ title: "Integration techniques", textbookChapter: 7, sections: ["Integration by parts", "Choosing u with LIATE", "Repeated integration by parts"] }],
};

function mockOutline({ course, materials, lectures }: OutlineInput): GuideOutline {
  const known = SAMPLE_OUTLINES[course.toUpperCase()];
  if (known) return { chapters: known };
  const chapters = [
    ...lectures.filter((l) => l.topic).map((l) => ({ title: l.topic!, sections: [l.topic!] })),
    ...materials.filter((m) => m.headings.length).map((m) => ({ title: m.title, sections: m.headings.slice(0, 4) })),
  ];
  return guideOutline.parse({ chapters: chapters.length ? chapters.slice(0, 8) : [{ title: "Getting started", sections: ["Course overview"] }] });
}

const sentences = (text: string) =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^(?:…|\.\.\.)\s*/, "").trim())
    .filter((s) => s.length > 30 && /[.!?]$/.test(s));

/** The first passage whose text says all the given words, so the mock cites what it actually received. */
function find(passages: readonly Passage[], ...words: string[]): Passage["id"][] {
  const hit = passages.find((p) => words.every((w) => p.text.toLowerCase().includes(w)));
  return hit ? [hit.id] : [];
}
const cite = (ids: readonly string[], extra: { relation?: "used" | "tested"; note?: string } = {}) => ids.map((passage) => ({ passage, ...extra }));

function mockPriceElasticity({ passages, hints }: SectionInput): GuideBlockDraft[] {
  const hint = hints.find((h) => h.quote.includes("steep line"));
  return [
    {
      kind: "prose",
      text: "Price elasticity of demand measures how strongly buyers react to a price change. If a small price rise makes people buy a lot less, demand is elastic. If they keep buying about the same amount, demand is inelastic.",
      refs: cite([...find(passages, "buyers react"), ...find(passages, "elasticity of demand measures")]),
    },
    {
      kind: "formula",
      lhs: "Elasticity",
      numerator: "% change in quantity demanded",
      denominator: "% change in price",
      note: "Above 1 is elastic, below 1 is inelastic. Use the midpoint method so the answer is the same whether price rises or falls.",
      noteRefs: [...cite([...find(passages, "the formula"), ...find(passages, "reading the number"), ...find(passages, "midpoint method", "average")]), ...cite(find(passages, "midpoint method", "q1."), { relation: "used" })],
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
      refs: [...cite(find(passages, "let me draw this"), { note: "redrawn from the whiteboard sketch" }), ...cite(find(passages, "figure 5-1"))],
    },
    {
      kind: "callout",
      label: "Common mistake",
      ...(hint ? { examHint: `will be on the ${(hint.assessment ?? "exam").toLowerCase()}` } : {}),
      text: "Slope is not elasticity. A straight-line demand curve has the same slope everywhere, but its elasticity changes along the line: elastic near the top, where prices are high, and inelastic near the bottom.",
      refs: [...cite(find(passages, "steep line")), ...cite(find(passages, "straight line", "q2."), { relation: "tested" })],
      ...(hint ? { quote: { text: hint.quote, attribution: hint.attribution } } : {}),
    },
  ];
}

/** Slide passages that show code. A slide reads heading, body, then code, so the code runs from the first def or class line to the end. */
function codeSlides(passages: readonly Passage[]) {
  return passages.flatMap((p) => {
    const lines = p.text.split("\n");
    const start = lines.findIndex((l) => /^(?:def|class) /.test(l));
    return start < 1 ? [] : [{ id: p.id, heading: lines[0].toLowerCase(), body: lines.slice(1, start).join(" ").trim(), code: lines.slice(start).join("\n") }];
  });
}

/** CSC148's first section, which "Write this guide" opens. The code is copied from the is_empty slide it received. */
function mockTreesAndParts({ passages }: SectionInput): GuideBlockDraft[] {
  const isEmpty = codeSlides(passages).find((s) => s.code.startsWith("def is_empty"));
  return [
    {
      kind: "prose",
      text: "A tree is either empty, or a root value with zero or more subtrees, and each subtree is itself a tree. A leaf is a node with no children. The `Tree` class keeps the root value in `_root` and the subtrees in the list `_subtrees`.",
      refs: cite([...find(passages, "recap: trees"), ...find(passages, "attributes _root")]),
    },
    {
      kind: "prose",
      text: "An empty tree has `_root` set to `None` and no subtrees, so one comparison tells an empty tree from a tree with a root.",
      refs: cite(find(passages, "attributes _root")),
    },
    ...(isEmpty ? [{ kind: "code" as const, lang: "python", text: isEmpty.code, caption: "`Tree.is_empty` is true exactly when the tree has no root value.", refs: cite([isEmpty.id]) }] : []),
    {
      kind: "prose",
      text: "Every recursive `Tree` method calls `is_empty` first. The empty tree is the base case that stops the recursion, and every other case combines the results of the same method on each subtree.",
      refs: cite([...(isEmpty ? [isEmpty.id] : []), ...find(passages, "most tree methods")]),
    },
    {
      kind: "callout",
      label: "Common mistake",
      text: "Forgetting the empty-tree check, or recursing on `_root` instead of the subtrees. Check the base case first.",
      refs: cite([...find(passages, "common mistakes"), ...find(passages, "base case first")]),
    },
  ];
}

function mockSection(input: SectionInput): GuideBlockDraft[] {
  if (input.section.toLowerCase() === "price elasticity of demand") return mockPriceElasticity(input);
  if (input.course.toUpperCase() === "CSC148" && input.section.toLowerCase() === "trees and their parts") return mockTreesAndParts(input);
  const { passages, hints, section } = input;
  if (passages.length === 0) {
    return [{ kind: "prose", text: `Cue found no course material about ${section.toLowerCase()} yet. Add the slides or notes that cover it, then rewrite this section.`, refs: [] }];
  }
  const blocks: GuideBlockDraft[] = [];
  for (let i = 0; i < Math.min(passages.length, 6) && blocks.length < 3; i += 2) {
    const group = passages.slice(i, i + 2);
    const text = group.flatMap((p) => sentences(p.text).slice(0, 2)).join(" ");
    if (text) blocks.push({ kind: "prose", text, refs: cite(group.map((p) => p.id)) });
  }
  const titleWords = section.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const shown = codeSlides(passages).find((s) => s.body && titleWords.some((w) => s.heading.includes(w)));
  if (shown) blocks.splice(1, 0, { kind: "code", lang: "python", text: shown.code, caption: shown.body, refs: cite([shown.id]) });
  const hint = hints[0];
  const caution = passages.flatMap((p) => sentences(p.text).filter((s) => /\b(not|never|forget|mistake|instead)\b/i.test(s)).map((s) => ({ s, id: p.id })))[0];
  if (caution) {
    blocks.push({
      kind: "callout",
      label: "Common mistake",
      ...(hint?.assessment ? { examHint: `will be on the ${hint.assessment.toLowerCase()}` } : {}),
      text: caution.s,
      refs: cite([caution.id]),
      ...(hint ? { quote: { text: hint.quote, attribution: hint.attribution } } : {}),
    });
  }
  return blocks.length ? blocks : [{ kind: "prose", text: passages[0].text.slice(0, 600), refs: cite([passages[0].id]) }];
}

const ECO = "ECO101" as CourseId;
const L7 = "lec.evt_sample_eco101_l07" as LectureId;
const transcript = (m: number, s: number): SourceRef => ({ kind: "transcript", lectureId: L7, courseId: ECO, lectureNumber: 7, atMs: (m * 60 + s) * 1000 });
const slide = (page: number, title: string): SourceRef => ({ kind: "page", materialId: "mat_sample_eco101_l07_slides" as MaterialId, doc: { kind: "slides", title: "Lecture 7 slides", lectureNumber: 7 }, page, title });
const EXAMPLE_PASSAGES: Passage[] = [
  {
    id: "S1",
    ref: transcript(4, 15),
    label: "Lecture 7 transcript · 4:15",
    text: "Elasticity is about how strongly buyers react. If a small price rise makes people buy a lot less, demand is elastic. If they keep buying about the same amount, demand is inelastic. Gasoline is the classic inelastic good. Restaurant meals are elastic.",
  },
  {
    id: "S2",
    ref: { kind: "page", materialId: "mat_sample_eco101_text" as MaterialId, doc: { kind: "textbook", title: "Textbook" }, page: 1, label: "p. 92", section: "§5.1" },
    label: "Textbook · §5.1",
    text: "Price elasticity of demand.\n\nThe price elasticity of demand measures how much the quantity demanded responds to a change in price. Demand is elastic when the quantity responds strongly and inelastic when it responds only slightly.",
  },
  { id: "S3", ref: slide(6, "The formula"), label: "Lecture 7 slides · Slide 6", text: "The formula\nPrice elasticity of demand = % change in quantity demanded ÷ % change in price." },
  { id: "S4", ref: slide(7, "Reading the number"), label: "Lecture 7 slides · Slide 7", text: "Reading the number\nAbove 1 is elastic, below 1 is inelastic, exactly 1 is unit elastic." },
  { id: "S5", ref: slide(8, "The midpoint method"), label: "Lecture 7 slides · Slide 8", text: "The midpoint method\nDivide each change by the average of the start and end values, so rises and falls agree." },
  {
    id: "S6",
    ref: transcript(31, 10),
    label: "Lecture 7 transcript · 31:10",
    text: "Half of you will look at a steep line and write ‘inelastic’. Read the percentages, not the picture. A straight line has one slope, but its elasticity changes as you move along it. This will be on the midterm, I promise you.",
  },
];

export const guideTasks = defineTasks("guide", {
  outline: jsonTask({
    profile: "reason",
    maxTokens: 8000,
    input: outlineInput,
    output: guideOutline,
    prompt: (input) => ({ system: OUTLINE_SYSTEM, user: outlineUser(input) }),
    example: {
      course: "ECO101",
      materials: [
        { title: "Textbook", kind: "textbook", headings: ["§5.1 Price elasticity of demand", "§5.1 Computing elasticity", "§5.2 Elasticity and total revenue"] },
        { title: "Lecture 7 slides", kind: "slides", headings: ["How much do buyers react?", "Elastic or inelastic", "The formula", "The midpoint method", "Slope is not elasticity"] },
        { title: "Problem Set 4", kind: "problemSet", headings: ["Q1 midpoint elasticity of concert tickets", "Q2 elasticity along a straight demand line"] },
      ],
      lectures: [
        { number: 6, topic: "Supply and demand" },
        { number: 7, topic: "Price elasticity of demand" },
        { number: 8, topic: "Elasticity and total revenue" },
      ],
    },
    mock: mockOutline,
  }),
  section: listTask({
    profile: "chat",
    maxTokens: 6000,
    temperature: 0.5,
    maxItems: 12,
    multiline: true,
    input: sectionInput,
    item: guideBlockDraft,
    prompt: (input) => ({ system: SECTION_SYSTEM, user: sectionUser(input) }),
    example: {
      course: "ECO101",
      chapter: "Elasticity",
      section: "Price elasticity of demand",
      passages: EXAMPLE_PASSAGES,
      hints: [{ quote: "Half of you will look at a steep line and write ‘inelastic’. Read the percentages, not the picture.", attribution: "Prof. Okafor", assessment: "Midterm" }],
      savedAnswers: [],
    },
    mock: mockSection,
  }),
});
