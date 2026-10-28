import { describe, expect, it } from "vitest";
import { fenceBareCode, generatedQuestion, paperChunkRead, solveOutput } from "./schema";

describe("paperChunkRead", () => {
  it("normalizes labels, keeps a printed answer only when it names an option, and defaults the topic", () => {
    const chunk = paperChunkRead.parse({
      title: " 2024 Midterm ",
      course: null,
      questions: [
        { number: 3, topic: null, prompt: "What is 2 + 2?", options: [{ label: "(a)", text: "3" }, { label: "b.", text: "4" }], answer: "b)", marks: 2, figure: null },
        { number: "4", topic: "Trees", prompt: "Pick one", options: [{ label: "A", text: "x" }, { label: "B", text: "y" }], answer: "E", marks: null, figure: null },
      ],
      answerKey: [{ number: 7, answer: "c." }],
    });
    expect(chunk).toEqual({
      title: "2024 Midterm",
      questions: [
        { number: "3", topic: "General", prompt: "What is 2 + 2?", options: [{ label: "A", text: "3" }, { label: "B", text: "4" }], answer: "B", marks: 2 },
        { number: "4", topic: "Trees", prompt: "Pick one", options: [{ label: "A", text: "x" }, { label: "B", text: "y" }] },
      ],
      answerKey: [{ number: "7", answer: "C" }],
    });
  });

  it("drops a question whose labels repeat, since a choice could not be told apart", () => {
    const chunk = paperChunkRead.parse({ questions: [{ number: "1", prompt: "?", options: [{ label: "A", text: "x" }, { label: "a", text: "y" }] }], answerKey: [] });
    expect(chunk.questions).toEqual([]);
  });

  it("clamps a figure box to the page and drops one too thin to show", () => {
    const base = { number: "5", prompt: "The tree below", options: [{ label: "A", text: "1" }, { label: "B", text: "2" }] };
    const chunk = paperChunkRead.parse({
      questions: [
        { ...base, figure: { page: 1, box: [-0.1, 0.7, 0.45, 1.2] } },
        { ...base, number: "6", figure: { page: 1, box: [0.2, 0.5, 0.21, 0.9] } },
      ],
      answerKey: [],
    });
    expect(chunk.questions[0].figure).toEqual({ page: 1, box: [0, 0.7, 0.45, 1] });
    expect(chunk.questions[1]).not.toHaveProperty("figure");
  });

  it("rejects a question with fewer than two options", () => {
    expect(paperChunkRead.safeParse({ questions: [{ number: "1", prompt: "?", options: [{ label: "A", text: "x" }] }], answerKey: [] }).success).toBe(false);
  });
});

describe("fenceBareCode", () => {
  it("fences code that Super VL transcribed without fences, leaving the stem outside", () => {
    expect(fenceBareCode("What does f(4) return?\ndef f(n):\n    return n * 2")).toBe("What does f(4) return?\n\n```\ndef f(n):\n    return n * 2\n```");
  });

  it("leaves fenced and code-free prompts alone", () => {
    expect(fenceBareCode("Which is faster?")).toBe("Which is faster?");
    expect(fenceBareCode("x\n\n```python\ndef f(): pass\n```")).toBe("x\n\n```python\ndef f(): pass\n```");
  });
});

describe("solveOutput", () => {
  it("normalizes the answer label and turns an empty conclusion into none", () => {
    const out = solveOutput.parse({ answer: " b) ", explanation: "Because.", steps: [{ label: "Root", text: "A" }], conclusion: "  ", whyNot: { A: "That’s preorder" }, resources: ["S1"] });
    expect(out).toEqual({ answer: "B", explanation: "Because.", steps: [{ label: "Root", text: "A" }], conclusion: undefined, whyNot: { A: "That’s preorder" }, resources: ["S1"] });
  });

  it("rejects a step without a label, so the solution never shows a blank label slot", () => {
    expect(solveOutput.safeParse({ answer: "B", explanation: "x", steps: [{ label: "", text: "A" }], whyNot: {}, resources: [] }).success).toBe(false);
  });
});

describe("generatedQuestion", () => {
  it("requires exactly four options and a worked solution", () => {
    const base = {
      prompt: "Which?",
      options: ["w", "x", "y", "z"].map((text, i) => ({ label: "ABCD"[i], text })),
      answer: "a",
      explanation: "Because.",
      steps: [{ label: "Idea", text: "x" }],
      conclusion: "So A.",
      whyNot: { B: "b", C: "c", D: "d" },
      sources: [],
    };
    expect(generatedQuestion.parse(base).answer).toBe("A");
    expect(generatedQuestion.safeParse({ ...base, options: base.options.slice(0, 3) }).success).toBe(false);
    expect(generatedQuestion.safeParse({ ...base, steps: [] }).success).toBe(false);
    expect(generatedQuestion.safeParse({ ...base, conclusion: undefined }).success).toBe(false);
  });
});
