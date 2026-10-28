import "server-only";
import type { Option } from "@/lib/domain";
import type { GenerateInput, GeneratedQuestion, PaperChunkRead, SolveOutput } from "./types";

type SolveQuestion = { prompt: string; options: readonly Option[]; answer?: string };

/** Deterministic stand-ins matched to scripts/fixtures/practice/sample-quiz.pdf, so the walkthrough runs with no key. */
export const MOCK_QUESTIONS: (PaperChunkRead["questions"][number] & { page: number })[] = [
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

export const MOCK_KEY = {
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

export function mockSolve(question: SolveQuestion, passageIds: readonly string[]): SolveOutput {
  const fixture = MOCK_QUESTIONS.find((m) => m.prompt === question.prompt);
  const known = fixture ? MOCK_SOLUTIONS[fixture.number] : undefined;
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

type Written = Omit<GeneratedQuestion, "sources">;
const ABCD = (texts: [string, string, string, string]) => texts.map((text, i) => ({ label: "ABCD"[i], text }));

/** Written questions per course and topic. Stems differ from every sample paper's, so checkGenerated keeps them. */
const TREES: Written[] = [
  {
    prompt: "A recursive function on a binary tree returns 0 for an empty tree and 1 + f(left) + f(right) otherwise. What does it compute?",
    options: ABCD(["The height of the tree", "The number of nodes", "The number of leaves", "The sum of the values"]),
    answer: "B",
    explanation: "Every node that is not empty adds exactly 1, and an empty tree adds nothing.",
    steps: [
      { label: "Base case", text: "an empty tree adds 0" },
      { label: "Recursive case", text: "each node adds 1 to both subtrees' counts" },
    ],
    conclusion: "So it counts the nodes.",
    whyNot: { A: "Height takes a max, not a sum", C: "Leaves would need a leaf check", D: "It never reads a value" },
  },
  {
    prompt: "Which traversal visits the root of every subtree after both of its children?",
    options: ABCD(["Preorder", "Inorder", "Postorder", "Level order"]),
    answer: "C",
    explanation: "Postorder finishes the left and right subtrees before it visits their root.",
    steps: [{ label: "Postorder", text: "left subtree, right subtree, then the root" }],
    conclusion: "So the answer is postorder.",
    whyNot: { A: "Preorder visits the root first", B: "Inorder visits the root between the subtrees", D: "Level order visits by depth" },
  },
  {
    prompt: "What is the worst-case running time of searching an unbalanced binary search tree with n nodes?",
    options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n log n)"]),
    answer: "C",
    explanation: "An unbalanced tree can be a single chain, so a search may walk every node.",
    steps: [
      { label: "Worst shape", text: "a chain of n nodes" },
      { label: "Search", text: "one comparison per node on the path" },
    ],
    conclusion: "So the worst case is O(n).",
    whyNot: { A: "Only when the root matches", B: "Only for a balanced tree", D: "Searching never sorts" },
  },
  {
    prompt: "A preorder traversal of a binary tree prints A, B, D, E, C. Which node is the root?",
    options: ABCD(["A", "B", "D", "C"]),
    answer: "A",
    explanation: "Preorder prints a node before either of its subtrees, so the root comes first.",
    steps: [{ label: "Preorder", text: "the first value printed is the root" }],
    conclusion: "So A is the root.",
    whyNot: { B: "That's the root's left child", C: "That's a leaf", D: "That's the last value printed" },
  },
  {
    prompt: "To free every node of a tree so that no node is freed before its children, which traversal do you use?",
    options: ABCD(["Postorder", "Preorder", "Inorder", "Reverse preorder"]),
    answer: "A",
    explanation: "Postorder reaches a node only after both of its subtrees are done.",
    steps: [{ label: "Children first", text: "postorder frees the subtrees before their parent" }],
    conclusion: "So you use postorder.",
    whyNot: { B: "Frees the parent first", C: "Frees the parent between its subtrees", D: "Still visits some parents early" },
  },
];

const BIG_O: Written[] = [
  {
    prompt: "What is the running time of this function in terms of n = len(lst)?\n\n```python\ndef total(lst: list) -> int:\n    s = 0\n    for x in lst:\n        s += x\n    return s\n```",
    options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n²)"]),
    answer: "C",
    explanation: "The loop body runs once per item and does constant work.",
    steps: [
      { label: "Loop", text: "n iterations" },
      { label: "Body", text: "one addition each" },
    ],
    conclusion: "So it runs in O(n).",
    whyNot: { A: "It visits every item", B: "Nothing halves the input", D: "There is only one loop" },
  },
  {
    prompt: "A loop starts with i = 1 and doubles i until i reaches n. How many times does it run?",
    options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n log n)"]),
    answer: "B",
    explanation: "After k doublings i is 2ᵏ, so the loop stops once 2ᵏ reaches n.",
    steps: [
      { label: "After k steps", text: "i = 2ᵏ" },
      { label: "Solve", text: "2ᵏ = n gives k = log₂ n" },
    ],
    conclusion: "So it runs O(log n) times.",
    whyNot: { A: "The count grows with n", C: "That's adding 1 each time", D: "There is no inner loop" },
  },
  {
    prompt: "Which is the tightest big-O bound for 3n² + 100n + 7?",
    options: ABCD(["O(n)", "O(n²)", "O(n³)", "O(100n)"]),
    answer: "B",
    explanation: "For large n the n² term dominates, and constant factors drop out.",
    steps: [
      { label: "Dominant term", text: "3n²" },
      { label: "Drop constants", text: "n²" },
    ],
    conclusion: "So the bound is O(n²).",
    whyNot: { A: "Ignores the n² term", C: "True but not tight", D: "Same as O(n), and too small" },
  },
  {
    prompt: "On average, how long does looking up a key in a Python dict with n entries take?",
    options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n²)"]),
    answer: "A",
    explanation: "A dict hashes the key and jumps to its slot, so the cost does not grow with n on average.",
    steps: [{ label: "Hashing", text: "one hash, then one slot to check" }],
    conclusion: "So a lookup is O(1) on average.",
    whyNot: { B: "That's a balanced search tree", C: "That's scanning a list", D: "No nested work happens" },
  },
  {
    prompt: "A function calls itself twice on an input of size n − 1 and does constant work otherwise. What is its running time?",
    options: ABCD(["O(n)", "O(n²)", "O(2ⁿ)", "O(n log n)"]),
    answer: "C",
    explanation: "Each level of recursion doubles the number of calls, for n levels.",
    steps: [
      { label: "Calls per level", text: "1, 2, 4, …, 2ⁿ⁻¹" },
      { label: "Total", text: "about 2ⁿ calls" },
    ],
    conclusion: "So it runs in O(2ⁿ).",
    whyNot: { A: "That's one call per level", B: "That's a loop inside a loop", D: "That's halving, not shrinking by one" },
  },
];

const ELASTICITY: Written[] = [
  {
    prompt: "When the price of concert tickets rises 10%, the quantity demanded falls 25%. What is the price elasticity of demand?",
    options: ABCD(["0.4", "2.5", "25", "0.25"]),
    answer: "B",
    explanation: "Elasticity is the percentage change in quantity demanded divided by the percentage change in price.",
    steps: [
      { label: "Quantity", text: "25% change" },
      { label: "Price", text: "10% change" },
      { label: "Divide", text: "25 ÷ 10 = 2.5" },
    ],
    conclusion: "So the elasticity is 2.5, which is elastic.",
    whyNot: { A: "Divides price by quantity", C: "That's the quantity change alone", D: "That's 25% written as a fraction" },
  },
  {
    prompt: "Demand for insulin is inelastic. If its price rises, what happens to total revenue?",
    options: ABCD(["It rises", "It falls", "It stays the same", "It falls to zero"]),
    answer: "A",
    explanation: "With inelastic demand, quantity falls by a smaller percentage than price rises.",
    steps: [
      { label: "Price", text: "up by more" },
      { label: "Quantity", text: "down by less" },
    ],
    conclusion: "So total revenue rises.",
    whyNot: { B: "That happens when demand is elastic", C: "Only when elasticity is exactly 1", D: "Buyers of a necessity keep buying" },
  },
  {
    prompt: "Along a straight-line demand curve, where is demand most elastic?",
    options: ABCD(["Near the top, at high prices", "Near the bottom, at low prices", "Everywhere equally, since the slope is constant", "Only at the midpoint"]),
    answer: "A",
    explanation: "The same change in quantity is a large percentage where quantity is small, which is near the top of the line.",
    steps: [
      { label: "Top of the line", text: "high price, low quantity" },
      { label: "Percentages", text: "a small quantity makes each change a large percentage" },
    ],
    conclusion: "So demand is most elastic near the top.",
    whyNot: { B: "Demand is inelastic there", C: "Slope is not elasticity", D: "The midpoint is where elasticity equals 1" },
  },
  {
    prompt: "Why do economists use the midpoint method to compute price elasticity?",
    options: ABCD(["It gives the same answer whether price rises or falls", "It makes demand look more elastic", "It avoids using percentages", "It only works for straight-line curves"]),
    answer: "A",
    explanation: "Dividing by the average of the two values makes the percentage change the same in both directions.",
    steps: [{ label: "Base", text: "the average of the start and end values" }],
    conclusion: "So the answer does not depend on direction.",
    whyNot: { B: "It does not bias the result", C: "It still uses percentage changes", D: "It works on any curve" },
  },
  {
    prompt: "Which good is likely to have the most elastic demand?",
    options: ABCD(["One brand of breakfast cereal", "Gasoline", "Insulin", "Table salt"]),
    answer: "A",
    explanation: "Goods with close substitutes have elastic demand, because buyers switch when the price rises.",
    steps: [{ label: "Substitutes", text: "many other cereal brands" }],
    conclusion: "So one brand of cereal is the most elastic.",
    whyNot: { B: "Few substitutes in the short run", C: "A necessity with no substitute", D: "A tiny share of spending" },
  },
];

const BANKS = [...TREES, ...BIG_O, ...ELASTICITY];

function bankFor(input: Pick<GenerateInput, "course" | "topic" | "focus">): Written[] {
  if (input.course === "ECO101" || /elastic/i.test(input.focus)) return ELASTICITY;
  if (/big-o|efficien|running time/i.test(`${input.topic} ${input.focus}`)) return BIG_O;
  return TREES;
}

export function mockGenerate(input: GenerateInput): GeneratedQuestion[] {
  return bankFor(input)
    .slice(0, input.count)
    .map((q) => ({ ...q, sources: input.passages.slice(0, 2).map((p) => p.id) }));
}

/** The independent re-answer agrees with every banked key; anything else answers A. */
export function mockCheck(prompt: string): string {
  return BANKS.find((q) => q.prompt === prompt)?.answer ?? "A";
}
