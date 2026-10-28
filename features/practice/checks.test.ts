import { describe, expect, it } from "vitest";
import { checkGenerated, keyAgrees, sameStem } from "./checks";
import { generatedQuestion } from "./schema";

const written = (over: Record<string, unknown> = {}) =>
  generatedQuestion.parse({
    prompt: "Which traversal visits the root of every subtree after both of its children?",
    options: [
      { label: "A", text: "Preorder" },
      { label: "B", text: "Inorder" },
      { label: "C", text: "Postorder" },
      { label: "D", text: "Level order" },
    ],
    answer: "C",
    explanation: "Postorder finishes both subtrees first.",
    steps: [{ label: "Postorder", text: "left, right, root" }],
    conclusion: "So the answer is postorder.",
    whyNot: { A: "Root first", B: "Root in the middle", D: "Visits by depth" },
    sources: ["S1"],
    ...over,
  });

describe("checkGenerated", () => {
  it("keeps a well-formed question and keeps only notes for wrong options", () => {
    const verdict = checkGenerated(written({ whyNot: { a: "Root first", B: "Root in the middle", D: "Visits by depth", C: "Correct" } }), []);
    expect(verdict).toEqual({
      ok: true,
      question: {
        prompt: "Which traversal visits the root of every subtree after both of its children?",
        options: [
          { label: "A", text: "Preorder" },
          { label: "B", text: "Inorder" },
          { label: "C", text: "Postorder" },
          { label: "D", text: "Level order" },
        ],
        answer: "C",
        explanation: "Postorder finishes both subtrees first.",
        steps: [{ label: "Postorder", text: "left, right, root" }],
        conclusion: "So the answer is postorder.",
        whyNot: { A: "Root first", B: "Root in the middle", D: "Visits by depth" },
        sources: ["S1"],
      },
    });
  });

  it("drops a key that names no option", () => {
    expect(checkGenerated(written({ answer: "E" }), [])).toEqual({ ok: false, reason: "answerNotAnOption" });
  });

  it("drops options that mean the same thing once case, quotes and punctuation go", () => {
    const options = [
      { label: "A", text: "O(n)" },
      { label: "B", text: "`O(n)`" },
      { label: "C", text: "O(n²)" },
      { label: "D", text: "O(1)" },
    ];
    expect(checkGenerated(written({ options, answer: "A", whyNot: { B: "x", C: "y", D: "z" } }), [])).toEqual({ ok: false, reason: "optionsRepeat" });
  });

  it("drops labels other than A to D in order", () => {
    const options = [
      { label: "A", text: "Preorder" },
      { label: "C", text: "Inorder" },
      { label: "B", text: "Postorder" },
      { label: "D", text: "Level order" },
    ];
    expect(checkGenerated(written({ options }), [])).toEqual({ ok: false, reason: "labels" });
  });

  it("accepts printed label styles like (a) and B.", () => {
    const options = [
      { label: "(a)", text: "Preorder" },
      { label: "B.", text: "Inorder" },
      { label: "c)", text: "Postorder" },
      { label: "D", text: "Level order" },
    ];
    expect(checkGenerated(written({ options }), []).ok).toBe(true);
  });

  it("drops a question with a wrong option that has no note", () => {
    expect(checkGenerated(written({ whyNot: { A: "Root first", B: "Root in the middle" } }), [])).toEqual({ ok: false, reason: "whyNotMissing" });
  });

  it("drops a stem the set already has, even reworded only in case and punctuation", () => {
    const existing = ["which traversal visits the ROOT of every subtree, after both of its children"];
    expect(checkGenerated(written(), existing)).toEqual({ ok: false, reason: "duplicateStem" });
  });
});

describe("sameStem", () => {
  it("treats one changed word in a short stem as a different question", () => {
    expect(sameStem("Preorder visits the root…", "Postorder visits the root…")).toBe(false);
  });

  it("treats a long stem with one extra word as the same question", () => {
    const a = "A function calls itself twice on an input of size n − 1 and does constant work otherwise. What is its running time?";
    const b = "A function calls itself twice on an input of size n − 1 and does only constant work otherwise. What is its running time?";
    expect(sameStem(a, b)).toBe(true);
  });

  it("tells apart stems that share their code but ask different things", () => {
    const code = "\n\n```python\ndef f(n):\n    return f(n - 1) + 1\n```";
    expect(sameStem(`What does f(3) return?${code}`, `What is the running time of f?${code}`)).toBe(false);
  });
});

describe("keyAgrees", () => {
  it("compares labels however they are printed", () => {
    expect(keyAgrees("C", "c)")).toBe(true);
    expect(keyAgrees("C", "B")).toBe(false);
  });
});
