import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask, listTask } from "@/lib/ai/define";
import { passagesBlock, passagesSchema, STYLE } from "@/lib/ai/passages";
import type { Option, Passage } from "@/lib/domain";
import { MOCK_KEY, MOCK_QUESTIONS, mockCheck, mockGenerate, mockSolve } from "./mocks";
import { generatedQuestion, normalizeLabel, paperChunkRead, solveOutput } from "./schema";
import type { GenerateInput, PaperChunkRead } from "./types";
import { plural } from "@/lib/plural";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PARSE_SYSTEM = `You convert scanned or digital exam pages into structured multiple-choice practice questions.

You receive up to three page images, each preceded by "Page N" and the page's extracted text layer (which may be empty for scans). Use the image as the source of truth and the text layer to get exact spelling, code and symbols.

Each question:
- "number": the question number as printed ("3", "4b").
- "topic": a 1 to 4 word topic label in sentence case, e.g. "Recursion & trees", "Big-O & efficiency", "Linked lists". Reuse the same label for related questions.
- "prompt": the full question stem. Plain text with Markdown. Put all code in fenced code blocks (\`\`\`python ... \`\`\`) with a language tag, preserving indentation exactly. Leave a blank line between the stem text and each code fence, and never put stem text inside a fence. Write math with Unicode (x², ≤, Θ(n log n)), not LaTeX. Do not include the options in the prompt.
- "options": every choice in order, [{ "label": "A", "text": "..." }]. Use the printed labels. If choices are unlabeled, label them A, B, C... in order. Do not include the label inside "text".
- "answer": the correct option label ONLY if the document itself marks it (answer key, circled or highlighted choice, "Answer: C"). Never guess. Otherwise null.
- "marks": the marks printed for the question, or null.
- "figure": if the question depends on a diagram, graph, table, or image you cannot faithfully reproduce as text, give { "page": N, "box": [x0, y0, x1, y1] } with the figure's bounding box as fractions of the page width and height (0 to 1, origin top-left). Otherwise null.

Include only multiple-choice questions (two or more options). Skip free-response, cover pages and instructions.
If a page is an answer key listing answers, put those in "answerKey" instead of "questions".
If a question is cut off at the end of the last page, include what is visible.
Return "title" (like "2024 Midterm") and "course" (like "CSC148") when the pages show them, else null.`;

const SOLVE_SYSTEM = `You are Cue, a patient teaching assistant writing the worked solution to one multiple-choice exam question.
Think it through carefully, then reply with JSON:
- "answer": the correct option label.
- "explanation": one or two sentences on the idea that decides the question.
- "steps": 2 to 5 steps, each { "label": a short meaningful label like "B's subtree", "text": what to do or what you get }.
- "conclusion": one sentence stating the answer, like "So the order is D, E, B, C, A."
- "whyNot": for each wrong option label, one short phrase naming the specific mistake that leads to it ("That's inorder").
- "resources": the passage markers (like "S2") that teach this idea, most useful first. Use only markers you were given.
If an official answer is given, explain that answer. ${STYLE}`;

const GENERATE_SYSTEM = `You are Cue, writing new multiple-choice practice questions for a university course.

Write exactly the number of questions asked, about the focus you are given. Ground every question in the passages: test an idea they teach, never a fact they do not contain. When example questions are given, match their style, length, notation and difficulty, but never copy or lightly reword one. Questions marked MISSED are ones the student got wrong: test the same idea from a new angle.

Each question has exactly four options labelled A, B, C and D, and exactly one correct answer. Make each wrong option a mistake students really make (the inorder walk when asked for postorder, a slope read as elasticity), clearly wrong once the idea is understood. Before you keep a question, test every wrong option against the stem exactly as written; if a second option could also be defended (level order also visits the root first), rewrite the stem or that option. Options must differ in meaning. Never use "all of the above" or "none of the above". Spread the correct label across A to D.

Vary the set. Ask students to apply the idea to a concrete case (a small tree, a few lines of code, a worked number) at least as often as you ask about the idea itself, and never give two questions the same four options.

Reply with JSON { "items": [ ... ] }, one object per question:
- "prompt": the question stem, without the options. Markdown, with code in fenced blocks that carry a language tag.
- "options": [{ "label": "A", "text": "..." }, { "label": "B", ... }, { "label": "C", ... }, { "label": "D", ... }].
- "answer": the label of the correct option.
- "explanation": one or two sentences on the idea that decides the question.
- "steps": 1 to 4 steps that work it out, each { "label": a short meaningful label like "B's subtree", "text": what to do or what you get }.
- "conclusion": one sentence that states the answer, like "So the order is D, E, B, C, A."
- "whyNot": an object with one short phrase for each wrong label, naming the mistake that leads to it, like { "A": "That's preorder" }.
- "sources": the passage markers ("S1") the question was written from.
${STYLE}`;

const CHECK_SYSTEM = `You check a multiple-choice practice question before a student sees it. Forget which option looks intended. Take each option in turn and decide, on its own, whether it is a correct answer to the question exactly as written, reading the stem literally. Reply with JSON { "options": [{ "label": "A", "why": one short sentence testing this option against the stem, "correct": true or false }, ...] } with one entry per option, in order. More than one option may be correct, or none.`;

const questionInput = z.object({
  number: z.string(),
  topic: z.string(),
  prompt: z.string().min(1).max(8000),
  options: z.array(z.object({ label: z.string(), text: z.string() })).min(2).max(8),
  answer: z.string().optional(),
});

const optionsText = (options: readonly Option[]) => options.map((o) => `${o.label}. ${o.text}`).join("\n");

const optionsSchema = z.array(z.object({ label: z.string(), text: z.string() })).min(2).max(8);

function exampleQuestions(style: GenerateInput["style"]): string[] {
  if (style.length === 0) return [];
  return ["Example questions:", ...style.map((q, i) => `Q${i + 1}${q.missed ? " (MISSED)" : ""}. ${q.prompt}\n${optionsText(q.options)}`), ""];
}

const TRAVERSAL_PASSAGE: Passage = {
  id: "S1",
  ref: { kind: "page", materialId: "mat_sample_csc148_l08_slides" as never, doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 }, page: 17, title: "Postorder traversal" },
  label: "Lecture 8 slides · Slide 17",
  text: "Postorder traversal: visit the left subtree, then the right subtree, then the root. Deleting a tree uses postorder so that children are deleted before their parent. Preorder visits the root first; inorder visits it between the subtrees.",
};

export const practiceTasks = defineTasks("practice", {
  parse: jsonTask({
    profile: "vision",
    multiline: true,
    maxTokens: 12_000,
    input: z.object({
      totalPages: z.number().int().min(1).max(60),
      pages: z
        .array(z.object({ page: z.number().int().min(1), image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/), text: z.string().max(20_000) }))
        .min(1)
        .max(3),
    }),
    output: paperChunkRead,
    prompt: ({ pages, totalPages }) => ({
      system: PARSE_SYSTEM,
      user: [
        { type: "text" as const, text: `This chunk contains pages ${pages.map((p) => p.page).join(", ")} of ${totalPages}.` },
        ...pages.flatMap((p) => [
          { type: "text" as const, text: `Page ${p.page}\nText layer:\n${p.text.trim() || "(none, scanned page)"}` },
          { type: "image" as const, dataUrl: p.image },
        ]),
      ],
    }),
    example: {
      totalPages: 1,
      pages: [{ page: 1, image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", text: "1. What is 2 + 2?  A) 3  B) 4  C) 5  D) 22" }],
    },
    mock: async ({ pages }): Promise<PaperChunkRead> => {
      await sleep(1800);
      const on = new Set(pages.map((p) => p.page));
      return {
        ...(on.has(1) ? { title: "Fall 2024 Midterm", course: "CSC148" } : {}),
        questions: MOCK_QUESTIONS.filter((q) => on.has(q.page)).map(({ page: _page, ...q }) => q),
        answerKey: on.has(MOCK_KEY.page) ? MOCK_KEY.entries : [],
      };
    },
  }),
  solve: jsonTask({
    profile: "reason",
    multiline: true,
    maxTokens: 8000,
    input: z.object({ question: questionInput, passages: passagesSchema }),
    output: solveOutput,
    prompt: ({ question, passages }) => ({
      system: SOLVE_SYSTEM,
      user: [
        `Question ${question.number} (${question.topic})`,
        "",
        question.prompt,
        "",
        "Options:",
        optionsText(question.options),
        ...(question.answer ? ["", `Official answer: ${question.answer}`] : []),
        "",
        "Passages:",
        passagesBlock(passages),
      ].join("\n"),
    }),
    example: {
      question: {
        number: "7",
        topic: "Recursion & trees",
        prompt: "A postorder traversal visits every node of a tree whose root A has children B (left) and C (right), where B has children D (left) and E (right). In what order are the values printed?",
        options: ["A, B, D, E, C", "D, E, B, C, A", "D, B, E, A, C", "C, E, D, B, A"].map((text, i) => ({ label: "ABCD"[i], text })),
      },
      passages: [TRAVERSAL_PASSAGE],
    },
    mock: async ({ question, passages }) => {
      await sleep(1200);
      return mockSolve(question, passages.map((p) => p.id));
    },
  }),
  generate: listTask({
    profile: "reason",
    multiline: true,
    maxTokens: 8000,
    temperature: 0.8,
    maxItems: 10,
    input: z.object({
      course: z.string().max(20).optional(),
      topic: z.string().min(1).max(200),
      focus: z.string().min(1).max(2000),
      style: z.array(z.object({ prompt: z.string().max(8000), options: optionsSchema, missed: z.literal(true).optional() })).max(6),
      passages: passagesSchema,
      count: z.number().int().min(1).max(10),
      note: z.string().max(500).optional(),
    }),
    item: generatedQuestion,
    prompt: ({ course, focus, style, passages, count, note }) => ({
      system: GENERATE_SYSTEM,
      user: [
        `Write ${plural(count, "new question")}${course ? ` for ${course}` : ""} about ${focus}.`,
        ...(note ? [`The student asked for: “${note}”`] : []),
        "",
        ...exampleQuestions(style),
        "Passages:",
        passagesBlock(passages),
      ].join("\n"),
    }),
    example: {
      course: "CSC148",
      topic: "Recursion & trees",
      focus: "the topic “Recursion & trees”, in the style of the 2024 Midterm",
      style: [{ prompt: "Which traversal of a binary search tree lists its values in sorted order?", options: ["Inorder", "Preorder", "Postorder", "Level order"].map((text, i) => ({ label: "ABCD"[i], text })) }],
      passages: [TRAVERSAL_PASSAGE],
      count: 3,
    },
    mock: (input) => mockGenerate(input),
  }),
  check: jsonTask({
    profile: "chat",
    maxTokens: 500,
    temperature: 0,
    input: z.object({ prompt: z.string().min(1).max(8000), options: optionsSchema }),
    output: z.object({ options: z.array(z.object({ label: z.string().trim().min(1).transform(normalizeLabel), why: z.string(), correct: z.boolean() })).max(8) }),
    prompt: ({ prompt, options }) => ({ system: CHECK_SYSTEM, user: `${prompt}\n\n${optionsText(options)}` }),
    example: { prompt: "Which traversal visits the root of every subtree after both of its children?", options: ["Preorder", "Inorder", "Postorder", "Level order"].map((text, i) => ({ label: "ABCD"[i], text })) },
    mock: ({ prompt, options }) => ({ options: options.map((o) => ({ label: o.label, why: "", correct: normalizeLabel(o.label) === mockCheck(prompt) })) }),
  }),
});
