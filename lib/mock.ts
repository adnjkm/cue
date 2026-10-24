// Deterministic stand-ins for the three routes, used only when LLM_API_KEY is empty outside production.
import type { AskRequest, ParsedQuestion, ParseRequest, ParseResult, Solution, SolveRequest } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUESTIONS: (ParsedQuestion & { page: number })[] = [
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
    prompt:
      "Given only a reference to the head node, what is the cost of inserting a new node at the front of a singly linked list of n nodes?",
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
    prompt:
      "Starting from an empty stack, we run `push(1)`, `push(2)`, `pop()`, `push(3)`, `push(4)`, `pop()`. Which value is now on top?",
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

const KEY = { page: 2, entries: [
  { number: "1", answer: "B" },
  { number: "2", answer: "B" },
  { number: "3", answer: "A" },
  { number: "5", answer: "B" },
] };

export async function parseChunk(req: ParseRequest): Promise<ParseResult> {
  await sleep(1800);
  const pages = new Set(req.pages.map((p) => p.page));
  return {
    title: pages.has(1) ? "2024 Midterm" : undefined,
    course: pages.has(1) ? "CSC148" : undefined,
    questions: QUESTIONS.filter((q) => pages.has(q.page)).map(({ page: _page, ...q }) => q),
    answerKey: pages.has(KEY.page) ? KEY.entries : [],
  };
}

const SOLUTIONS: Record<string, Solution> = {
  "1": {
    answer: "B",
    explanation: "Each call multiplies n by the result for n − 2, so f(4) = 4 · f(2) = 4 · 2 · f(0). The base case returns 1 for any n ≤ 1, so f(0) = 1 and the product is 8.",
    steps: ["Expand f(4) into 4 · f(2).", "Expand f(2) into 2 · f(0).", "Hit the base case: f(0) returns 1.", "Multiply back up: 4 · 2 · 1 = 8."],
    whyNot: { A: "24 is 4!, which steps down by 1, not by 2.", C: "Stops after the first call and forgets the 2.", D: "Adds instead of multiplying somewhere along the way." },
  },
  "2": {
    answer: "B",
    explanation: "Every comparison halves the remaining range, so after k steps n / 2ᵏ items remain. The search ends when that reaches 1, which takes log₂ n steps.",
    steps: ["Write the remaining size after k steps as n / 2ᵏ.", "Set n / 2ᵏ = 1 and solve for k.", "k = log₂ n, so the cost is O(log n)."],
    whyNot: { A: "Only the best case, when the middle element matches first.", C: "That is linear search, which checks every item.", D: "That is the cost of sorting first, not of the search." },
  },
  "3": {
    answer: "A",
    explanation: "Inserting at the front only touches the head: make the new node point at the old head, then move head to the new node. No traversal is needed, so the cost does not depend on n.",
    steps: ["Create the new node.", "Point its next at the current head.", "Reassign head to the new node."],
    whyNot: { B: "Nothing is being halved here.", C: "That is inserting at the end without a tail reference.", D: "No nested traversal happens." },
  },
  "4": {
    answer: "C",
    explanation: "Trace the stack after each operation: [1], [1, 2], [1], [1, 3], [1, 3, 4], [1, 3]. The last pop removes 4, leaving 3 on top.",
    steps: ["Write the stack after every call.", "Remember pop removes the most recent push.", "Read the top after the final pop: 3."],
    whyNot: { A: "1 is at the bottom, not the top.", B: "2 was popped by the first pop().", D: "4 was removed by the last pop()." },
  },
  "5": {
    answer: "B",
    explanation: "Preorder visits a node, then its whole left subtree, then its right subtree. Starting at 8 you go left to 3, then left again to 1, so 1 is third.",
    steps: ["Visit the root, 8.", "Go to the left child, 3.", "Go to 3's left child, 1. That is the third visit."],
    whyNot: { A: "3 is the second value visited.", C: "6 comes after 1, as the fourth visit.", D: "10 is the right subtree, visited after all of 3's subtree." },
  },
};

export async function solve(req: SolveRequest): Promise<Solution> {
  await sleep(1200);
  const known = SOLUTIONS[req.question.number];
  if (known) return known;
  const labels = req.question.options.map((o) => o.label);
  const answer = req.question.answer ?? labels[0];
  return {
    answer,
    explanation: `Option ${answer} is the only choice consistent with the definitions in the question.`,
    steps: ["Restate what the question asks.", "Check each option against it.", `Keep ${answer}.`],
    whyNot: Object.fromEntries(labels.filter((l) => l !== answer).map((l) => [l, "Does not satisfy the condition in the stem."])),
  };
}

export function askStream(req: AskRequest): ReadableStream<Uint8Array> {
  const last = req.messages[req.messages.length - 1]?.content ?? "";
  const reply = req.choice && req.question.answer
    ? `You picked ${req.choice}; the answer is ${req.question.answer}. ${req.solution?.steps[0] ?? "Trace the smallest case by hand."} Doing that step on paper for "${last.slice(0, 40)}" shows where the two choices split.`
    : `Hint: start from the definition the question relies on and trace one small case by hand before looking at the options.`;
  const words = reply.split(/(?<= )/);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const w of words) {
        controller.enqueue(encoder.encode(w));
        await sleep(35);
      }
      controller.close();
    },
  });
}
