import { ids, type Attempt, type CourseId, type EpochMs, type MaterialId, type Option, type PracticeSet, type Question, type SetId, type Solution, type TreeNode } from "@/lib/domain";
import type { SampleFragment } from "./context";
import { SAMPLE } from "./ids";

const ABCD = (texts: [string, string, string, string]): Option[] => texts.map((text, i) => ({ label: "ABCD"[i], text }));

type Q = { n: string; topic: string; prompt: string; options: Option[]; key: string; marks?: number; tree?: TreeNode };

const RT = "Recursion & trees";
const BO = "Big-O & efficiency";
const LL = "Linked lists";

/** CSC148 2024 Midterm: 15 questions in Paper's three topics, numbered as printed. */
const MIDTERM: Q[] = [
  { n: "1", topic: RT, marks: 2, key: "C", prompt: "A tree has a root and three subtrees of sizes 2, 4 and 1. What does `len(t)` return?", options: ABCD(["7", "3", "8", "4"]) },
  { n: "2", topic: RT, marks: 2, key: "A", prompt: "Which check must come first in a recursive `Tree` method?", options: ABCD(["`self.is_empty()`", "`len(self._subtrees) == 0`", "`self._root == 0`", "`self._subtrees is None`"]) },
  {
    n: "3",
    topic: RT,
    marks: 2,
    key: "B",
    prompt: "What does `f(5)` return?\n\n```python\ndef f(n: int) -> int:\n    if n <= 1:\n        return n\n    return f(n - 1) + f(n - 2)\n```",
    options: ABCD(["8", "5", "3", "13"]),
  },
  { n: "4", topic: RT, marks: 2, key: "D", prompt: "A leaf is a tree whose…", options: ABCD(["root is None", "parent is the root", "height is 0 or 1", "list of subtrees is empty"]) },
  { n: "5", topic: BO, marks: 2, key: "B", prompt: "What is the worst-case running time of binary search on a sorted list of n items?", options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n log n)"]) },
  {
    n: "6",
    topic: BO,
    marks: 2,
    key: "C",
    prompt: "What is the running time of this function in terms of n?\n\n```python\ndef pairs(lst: list) -> int:\n    total = 0\n    for i in range(len(lst)):\n        for j in range(i, len(lst)):\n            total += 1\n    return total\n```",
    options: ABCD(["O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"]),
  },
  {
    n: "7",
    topic: RT,
    marks: 2,
    key: "B",
    prompt: "A postorder traversal visits every node in the tree on the right. In what order are the values printed?",
    options: ABCD(["A, B, D, E, C", "D, E, B, C, A", "D, B, E, A, C", "C, E, D, B, A"]),
    tree: { v: "A", l: { v: "B", l: { v: "D" }, r: { v: "E" } }, r: { v: "C" } },
  },
  { n: "8", topic: RT, marks: 2, key: "A", prompt: "Which traversal of a binary search tree lists its values in sorted order?", options: ABCD(["Inorder", "Preorder", "Postorder", "Level order"]) },
  { n: "9", topic: BO, marks: 1, key: "A", prompt: "Appending to the end of a Python list is, on average…", options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n²)"]) },
  {
    n: "10",
    topic: BO,
    marks: 2,
    key: "C",
    prompt: "Inserting at index 0 of a Python list of n items takes O(n) time. Why?",
    options: ABCD(["Python lists are linked lists", "The list must be sorted again", "Every existing item shifts one place to the right in memory", "The list is copied to a new array every time"]),
  },
  { n: "11", topic: BO, marks: 2, key: "D", prompt: "An algorithm halves its input and then does a linear scan of what remains, recursively. What is its running time?", options: ABCD(["O(log n)", "O(n log n)", "O(n²)", "O(n)"]) },
  { n: "12", topic: LL, marks: 2, key: "A", prompt: "Given only a reference to the first node, what is the cost of inserting at the front of a linked list of n nodes?", options: ABCD(["O(1)", "O(log n)", "O(n)", "O(n²)"]) },
  { n: "13", topic: LL, marks: 2, key: "C", prompt: "Which attribute does a `_Node` in a singly linked list need besides its item?", options: ABCD(["prev", "size", "next", "head"]) },
  { n: "14", topic: LL, marks: 2, key: "B", prompt: "What happens if you set `self._first = self._first.next` on an empty linked list?", options: ABCD(["Nothing", "An AttributeError", "The list becomes circular", "The size becomes −1"]) },
  { n: "15", topic: LL, marks: 2, key: "D", prompt: "Which operation is faster on a linked list than on a Python list?", options: ABCD(["Indexing", "Appending at the end", "Binary search", "Inserting at the front"]) },
];

/** 2023 Term Test 2: six more tree questions, so a recursion review links "+ 12 practice Qs" across both papers. */
const TT2023: Q[] = [
  { n: "1", topic: "Trees & traversal", key: "A", prompt: "Preorder visits the root…", options: ABCD(["first", "last", "between its subtrees", "never"]) },
  { n: "2", topic: "Trees & traversal", key: "C", prompt: "Postorder visits the root…", options: ABCD(["first", "between its subtrees", "last", "twice"]) },
  { n: "3", topic: "Trees & traversal", key: "B", prompt: "What is the height of a tree with only a root?", options: ABCD(["0", "1", "2", "It is undefined"]) },
  { n: "4", topic: "Trees & traversal", key: "D", prompt: "Which order would you use to delete every node of a tree?", options: ABCD(["Preorder", "Inorder", "Level order", "Postorder"]) },
  { n: "5", topic: "Trees & traversal", key: "A", prompt: "How many times does a traversal visit each node?", options: ABCD(["Once", "Twice", "Once per child", "Depends on the order"]) },
  { n: "6", topic: "Trees & traversal", key: "B", prompt: "Which traversal needs a queue rather than recursion?", options: ABCD(["Preorder", "Level order", "Postorder", "Inorder"]) },
];

const MAT_TT2: Q[] = [
  { n: "1", topic: "Integration by parts", key: "B", prompt: "Integration by parts comes from which rule?", options: ABCD(["The chain rule", "The product rule", "The quotient rule", "The power rule"]) },
  { n: "2", topic: "Integration by parts", key: "A", prompt: "By LIATE, which comes first when choosing u?", options: ABCD(["ln x", "x²", "sin x", "eˣ"]) },
  { n: "3", topic: "Integration by parts", key: "C", prompt: "∫ ln x dx equals…", options: ABCD(["1/x + C", "x ln x + C", "x ln x − x + C", "ln x − x + C"]) },
  { n: "4", topic: "Integration by parts", key: "D", prompt: "To compute ∫ x eˣ dx, which choice of u and dv works?", options: ABCD(["u = eˣ, dv = x dx", "u = x eˣ, dv = dx", "u = 1, dv = x eˣ dx", "u = x, dv = eˣ dx"]) },
];

function questions(setId: SetId, qs: readonly Q[]): Question[] {
  return qs.map((q, order) => ({
    id: ids.question(setId, Number(q.n)),
    setId,
    order,
    number: q.n,
    topic: q.topic,
    type: "multipleChoice",
    ...(q.marks ? { marks: q.marks } : {}),
    prompt: q.prompt,
    options: q.options,
    key: { source: "model", answer: q.key },
    ...(q.tree ? { figure: { kind: "tree" as const, root: q.tree } } : {}),
    origin: { kind: "paper" },
  }));
}

/** Practice's sample rows: the Paper midterm on question 7, with 8 answered and the Q7 worked solution. */
export const practiceSample: SampleFragment<"practiceSets" | "questions" | "attempts" | "solutions"> = (ctx) => {
  const mt = SAMPLE.sets.csc148Midterm2024;
  const tt = SAMPLE.sets.csc148TermTest2023;
  const mat = "set_sample_mat137_2024tt2" as SetId;
  const set = (id: SetId, courseId: CourseId, title: string, current: number, createdAt: EpochMs): PracticeSet => ({
    id,
    courseId,
    title,
    origin: { kind: "paper", materialId: `mat_sample_${id.slice(11)}` as MaterialId },
    view: { current: ids.question(id, current), topic: null },
    createdAt,
  });
  const answered: [n: number, choice: string][] = [
    [1, "C"],
    [2, "A"],
    [3, "C"],
    [4, "D"],
    [5, "B"],
    [6, "B"],
    [7, "B"],
    [9, "A"],
  ];
  const attempts: Attempt[] = answered.map(([n, choice], i) => ({ questionId: ids.question(mt, n), setId: mt, choice, at: ctx.at(1, "19:00") + i * 60_000 }) as Attempt);
  const q7: Solution = {
    questionId: ids.question(mt, 7),
    answer: "B",
    explanation: "Postorder finishes both subtrees before printing the root. Walk the tree that way:",
    steps: [
      { label: "B's subtree", text: "D, E, then B" },
      { label: "C's subtree", text: "C" },
      { label: "Root", text: "A" },
    ],
    conclusion: "So the order is D, E, B, C, A.",
    whyNot: { C: "That's inorder", D: "Reversed preorder" },
    resources: [
      { kind: "page", materialId: SAMPLE.materials.csc148L8Slides, doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 }, page: 17, title: "Postorder traversal" },
      { kind: "transcript", lectureId: SAMPLE.lectures.csc148Lecture8, courseId: SAMPLE.courses.csc148, lectureNumber: 8, atMs: (41 * 60 + 5) * 1000, quote: "Delete the children before the parent" },
      { kind: "page", materialId: SAMPLE.materials.csc148Notes, doc: { kind: "notes", title: "Course notes" }, page: 3, section: "§5.3", title: "Tree traversals" },
    ],
    provenance: { by: "model", groundedIn: { kind: "page", materialId: SAMPLE.materials.csc148L8Slides, doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 }, page: 17 } },
  };
  return {
    practiceSets: [
      set(mt, SAMPLE.courses.csc148, "2024 Midterm", 7, ctx.at(1, "18:30")),
      set(tt, SAMPLE.courses.csc148, "2023 Term Test 2", 1, ctx.at(5, "18:30", -1)),
      set(mat, SAMPLE.courses.mat137, "2024 Term Test 2", 4, ctx.at(4, "18:30", -1)),
    ],
    questions: [...questions(mt, MIDTERM), ...questions(tt, TT2023), ...questions(mat, MAT_TT2)],
    attempts,
    solutions: [q7],
  };
};
