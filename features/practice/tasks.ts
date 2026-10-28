import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask, listTask } from "@/lib/ai/define";
import { passagesBlock, passagesSchema, STYLE } from "@/lib/ai/passages";
import type { GenerationScope, Option } from "@/lib/domain";
import { generatedQuestion, paperChunkRead, solveOutput } from "./schema";
import type { PaperChunkRead, SolveOutput } from "./types";

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
Write questions in the style of the example questions, grounded in the passages. Each question has exactly four options labelled A to D and exactly one correct answer.
For each question give the answer label, a short "whyNot" phrase for every wrong option, 2 to 4 labelled solution steps, and the passage markers ("S1") it was written from. ${STYLE}`;

const CHECK_SYSTEM = `Answer the multiple-choice question. Reply with JSON { "answer": the option label }.`;

const questionInput = z.object({
  number: z.string(),
  topic: z.string(),
  prompt: z.string().min(1).max(8000),
  options: z.array(z.object({ label: z.string(), text: z.string() })).min(2).max(8),
  answer: z.string().optional(),
});

const optionsText = (options: readonly Option[]) => options.map((o) => `${o.label}. ${o.text}`).join("\n");

const generationScope = z.custom<GenerationScope>((v) => typeof v === "object" && v !== null && typeof (v as { kind?: unknown }).kind === "string");

/** Deterministic stand-ins matched to scripts/fixtures/practice/sample-quiz.pdf, so the walkthrough runs with no key. */
const MOCK_QUESTIONS: (PaperChunkRead["questions"][number] & { page: number })[] = [
  {
    page: 1,
    number: "1",
    topic: "Recursion",
    prompt: "What does `f(4)` return?\n\n```python\ndef f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 2)\n```",
    options: [
      { label: "A", text: "24" },
      { label: "B", text: "8" },
      { label: "C", text: "4" },
      { label: "D", text: "6" },
    ],
  },
  {
    page: 1,
    number: "2",
    topic: "Big-O",
    prompt: "What is the worst-case running time of binary search on a sorted list of n items?",
    options: [
      { label: "A", text: "O(1)" },
      { label: "B", text: "O(log n)" },
      { label: "C", text: "O(n)" },
      { label: "D", text: "O(n log n)" },
    ],
  },
  {
    page: 1,
    number: "3",
    topic: "Big-O",
    prompt: "Given only a reference to the head node, what is the cost of inserting a new node at the front of a singly linked list of n nodes?",
    options: [
      { label: "A", text: "O(1)" },
      { label: "B", text: "O(log n)" },
      { label: "C", text: "O(n)" },
      { label: "D", text: "O(n²)" },
    ],
  },
  {
    page: 1,
    number: "4",
    topic: "Stacks",
    prompt: "Starting from an empty stack, we run `push(1)`, `push(2)`, `pop()`, `push(3)`, `push(4)`, `pop()`. Which value is now on top?",
    options: [
      { label: "A", text: "1" },
      { label: "B", text: "2" },
      { label: "C", text: "3" },
      { label: "D", text: "4" },
    ],
  },
  {
    page: 1,
    number: "5",
    topic: "Trees",
    prompt: "The binary tree below is traversed in preorder. What is the third value visited?",
    options: [
      { label: "A", text: "3" },
      { label: "B", text: "1" },
      { label: "C", text: "6" },
      { label: "D", text: "10" },
    ],
    figure: { page: 1, box: [0.13, 0.748, 0.436, 0.895] },
  },
];

const MOCK_KEY = {
  page: 2,
  entries: [
    { number: "1", answer: "B" },
    { number: "2", answer: "B" },
    { number: "3", answer: "A" },
    { number: "5", answer: "B" },
  ],
};

const MOCK_SOLUTIONS: Record<string, SolveOutput> = {
  "1": {
    answer: "B",
    explanation: "Each call multiplies n by the result for n − 2, and the base case returns 1 for any n ≤ 1.",
    steps: [
      { label: "Expand", text: "f(4) = 4 · f(2) = 4 · 2 · f(0)" },
      { label: "Base case", text: "f(0) returns 1" },
      { label: "Multiply", text: "4 · 2 · 1 = 8" },
    ],
    conclusion: "So f(4) returns 8.",
    whyNot: { A: "That's 4!, stepping down by 1", C: "Stops after the first call", D: "Adds instead of multiplying" },
    resources: [],
  },
  "2": {
    answer: "B",
    explanation: "Every comparison halves the remaining range, so the search ends after log₂ n steps.",
    steps: [
      { label: "After k steps", text: "n / 2ᵏ items remain" },
      { label: "Solve", text: "n / 2ᵏ = 1 gives k = log₂ n" },
    ],
    conclusion: "So the worst case is O(log n).",
    whyNot: { A: "That's the best case", C: "That's linear search", D: "That's the cost of sorting first" },
    resources: [],
  },
  "3": {
    answer: "A",
    explanation: "Inserting at the front only touches the head, so the cost does not depend on n.",
    steps: [
      { label: "New node", text: "point its next at the current head" },
      { label: "Head", text: "move head to the new node" },
    ],
    conclusion: "So the cost is O(1).",
    whyNot: { B: "Nothing is being halved", C: "That's inserting at the end without a tail", D: "No nested traversal happens" },
    resources: [],
  },
  "4": {
    answer: "C",
    explanation: "Trace the stack after each call: [1], [1, 2], [1], [1, 3], [1, 3, 4], [1, 3].",
    steps: [
      { label: "First pop", text: "removes 2" },
      { label: "Last pop", text: "removes 4, leaving 3 on top" },
    ],
    conclusion: "So 3 is on top.",
    whyNot: { A: "1 is at the bottom", B: "2 was popped first", D: "4 was popped last" },
    resources: [],
  },
  "5": {
    answer: "B",
    explanation: "Preorder visits a node, then its whole left subtree, then its right subtree.",
    steps: [
      { label: "Root", text: "8" },
      { label: "Left child", text: "3" },
      { label: "Its left child", text: "1, the third visit" },
    ],
    conclusion: "So 1 is the third value visited.",
    whyNot: { A: "3 is the second visit", C: "6 is the fourth visit", D: "10 is in the right subtree" },
    resources: [],
  },
};

function mockSolve(question: z.infer<typeof questionInput>, passageIds: readonly string[]): SolveOutput {
  const known = MOCK_SOLUTIONS[question.number];
  if (known && question.options.some((o) => o.label === known.answer)) {
    return { ...known, resources: passageIds.slice(0, 3) };
  }
  const labels = question.options.map((o) => o.label);
  const answer = question.answer ?? labels[0];
  return {
    answer,
    explanation: `Option ${answer} is the only choice consistent with the definitions in the question.`,
    steps: [
      { label: "Restate", text: "what the question asks" },
      { label: "Check", text: "each option against it" },
    ],
    conclusion: `So the answer is ${answer}.`,
    whyNot: Object.fromEntries(labels.filter((l) => l !== answer).map((l) => [l, "Doesn't satisfy the stem"])),
    resources: passageIds.slice(0, 3),
  };
}

const MOCK_GENERATED: Omit<z.output<typeof generatedQuestion>, "sources" | "topic">[] = [
  {
    prompt: "A recursive function on a binary tree returns 0 for an empty tree and 1 + f(left) + f(right) otherwise. What does it compute?",
    options: [
      { label: "A", text: "The height of the tree" },
      { label: "B", text: "The number of nodes" },
      { label: "C", text: "The number of leaves" },
      { label: "D", text: "The sum of the values" },
    ],
    answer: "B",
    whyNot: { A: "Height takes a max, not a sum", C: "Leaves would need a leaf check", D: "It never reads a value" },
    steps: [
      { label: "Base case", text: "an empty tree adds 0" },
      { label: "Recursive case", text: "each node adds 1" },
    ],
  },
  {
    prompt: "Which traversal visits the root of every subtree after both of its children?",
    options: [
      { label: "A", text: "Preorder" },
      { label: "B", text: "Inorder" },
      { label: "C", text: "Postorder" },
      { label: "D", text: "Level order" },
    ],
    answer: "C",
    whyNot: { A: "Root first", B: "Root between the subtrees", D: "Visits by depth" },
    steps: [{ label: "Definition", text: "postorder finishes both subtrees first" }],
  },
  {
    prompt: "What is the worst-case running time of searching an unbalanced binary search tree with n nodes?",
    options: [
      { label: "A", text: "O(1)" },
      { label: "B", text: "O(log n)" },
      { label: "C", text: "O(n)" },
      { label: "D", text: "O(n log n)" },
    ],
    answer: "C",
    whyNot: { A: "Only when the root matches", B: "Only for a balanced tree", D: "Searching never sorts" },
    steps: [{ label: "Worst shape", text: "a chain of n nodes" }],
  },
  {
    prompt: "A preorder traversal of a tree prints A, B, D, E, C. Which node is the root?",
    options: [
      { label: "A", text: "A" },
      { label: "B", text: "B" },
      { label: "C", text: "D" },
      { label: "D", text: "C" },
    ],
    answer: "A",
    whyNot: { B: "That's the left child", C: "That's a leaf", D: "That's visited last" },
    steps: [{ label: "Preorder", text: "visits the root first" }],
  },
  {
    prompt: "Deleting every node of a tree safely, so no node is freed before its children, uses which traversal?",
    options: [
      { label: "A", text: "Postorder" },
      { label: "B", text: "Preorder" },
      { label: "C", text: "Inorder" },
      { label: "D", text: "Reverse preorder" },
    ],
    answer: "A",
    whyNot: { B: "Frees the parent first", C: "Frees the parent mid-way", D: "Not the same as postorder" },
    steps: [{ label: "Children first", text: "postorder deletes subtrees before the parent" }],
  },
];

export const practiceTasks = defineTasks("practice", {
  parse: jsonTask({
    profile: "vision",
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
        ...(on.has(1) ? { title: "2024 Midterm", course: "CSC148" } : {}),
        questions: MOCK_QUESTIONS.filter((q) => on.has(q.page)).map(({ page: _page, ...q }) => q),
        answerKey: on.has(MOCK_KEY.page) ? MOCK_KEY.entries : [],
      };
    },
  }),
  solve: jsonTask({
    profile: "reason",
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
      question: { number: "1", topic: "Arithmetic", prompt: "What is 2 + 2?", options: ["3", "4", "5", "22"].map((text, i) => ({ label: "ABCD"[i], text })) },
      passages: [],
    },
    mock: async ({ question, passages }) => {
      await sleep(1200);
      return mockSolve(question, passages.map((p) => p.id));
    },
  }),
  generate: listTask({
    profile: "reason",
    maxTokens: 8000,
    temperature: 0.8,
    maxItems: 10,
    input: z.object({
      scope: generationScope,
      style: z.array(z.object({ prompt: z.string().max(8000), options: z.array(z.object({ label: z.string(), text: z.string() })) })).max(6),
      passages: passagesSchema,
      count: z.number().int().min(1).max(10),
      note: z.string().max(500).optional(),
    }),
    item: generatedQuestion,
    prompt: ({ style, passages, count, note }) => ({
      system: GENERATE_SYSTEM,
      user: [
        `Write ${count} questions.${note ? ` The student asked: ${note}` : ""}`,
        "",
        "Example questions from the paper:",
        ...style.map((q, i) => `${i + 1}. ${q.prompt}\n${optionsText(q.options)}`),
        "",
        "Passages:",
        passagesBlock(passages),
      ].join("\n"),
    }),
    example: {
      scope: { kind: "topic", courseId: "CSC148" as never, topic: "Recursion & trees", missedOnly: false, count: 3 },
      style: [],
      passages: [],
      count: 3,
    },
    mock: ({ count, passages, scope }) =>
      MOCK_GENERATED.slice(0, count).map((q) => ({
        ...q,
        topic: scope.kind === "topic" && scope.topic !== "missedMost" ? scope.topic : "Recursion & trees",
        sources: passages.slice(0, 2).map((p) => p.id),
      })),
  }),
  check: jsonTask({
    profile: "chat",
    maxTokens: 500,
    temperature: 0,
    input: z.object({ prompt: z.string().min(1).max(8000), options: z.array(z.object({ label: z.string(), text: z.string() })).min(2).max(8) }),
    output: z.object({ answer: z.string().trim().min(1).transform((a) => a.replace(/[^A-Za-z0-9]/g, "").toUpperCase()) }),
    prompt: ({ prompt, options }) => ({ system: CHECK_SYSTEM, user: `${prompt}\n\n${optionsText(options)}` }),
    example: { prompt: "What is 2 + 2?", options: ["3", "4", "5", "22"].map((text, i) => ({ label: "ABCD"[i], text })) },
    mock: ({ prompt }) => ({ answer: MOCK_GENERATED.find((q) => q.prompt === prompt)?.answer ?? "A" }),
  }),
});
