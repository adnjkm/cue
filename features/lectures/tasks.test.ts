import { describe, expect, it } from "vitest";
import { lectureTasks } from "./tasks";

const { "lecture.clean": clean, "lecture.hints": hints, "lecture.notes": notes } = lectureTasks;

describe("lecture tasks", () => {
  it("registers clean, hints and notes under the lecture prefix", () => {
    expect(Object.keys(lectureTasks)).toEqual(["lecture.clean", "lecture.hints", "lecture.notes"]);
  });

  it("cleans the example chunk into sentences that parse with the task's own schema", async () => {
    const out = await clean.mock(clean.input.parse(clean.example));
    expect(clean.output.parse(out)).toEqual({
      sentences: ["Okay lets actually do one the integral of x e to the x dx which one is u think liate x is algebraic e to the x is exponential so algebraic comes first."],
    });
  });

  it("finds the Term Test 2 hint and the Problem Set 5 mention in the example window", async () => {
    const out = hints.output.parse(await hints.mock(hints.input.parse(hints.example)));
    expect(out).toEqual({
      hints: [{ quote: "That's the number one mistake I see, so there will be one of these on Term Test 2.", assessment: "A2" }],
      mentions: [{ ref: "M1", quote: "Problem Set 5 questions 3 to 6 use exactly this.", title: null, part: "Q3–Q6", note: null }],
      tasks: [],
    });
  });

  it("writes notes whose key points carry the transcript's own stamps", async () => {
    const out = notes.output.parse(await notes.mock(notes.input.parse(notes.example)));
    expect(out.keyPoints.map((k) => k.at)).toEqual(["0:45", "6:40", "12:15", "30:02", "33:20", "35:47"]);
    expect(out.summary).toBe(
      "Morning. If you pick u the other way around, the integral gets worse, not better. So the answer is x e to the x minus e to the x, plus C.",
    );
    expect(out.topic).toBeNull();
  });

  it("names an untitled lecture from what the professor says it is about", async () => {
    const out = await notes.mock({ course: "CSC148", topic: null, transcript: "[0:45] Okay everyone, let's get started. Today we are continuing with techniques of integration, and the main topic is integration by parts." });
    expect(out.topic).toEqual({ full: "Integration by parts", short: "Integration" });
  });

  it("refuses input the gateway should reject", () => {
    expect(clean.input.safeParse({ raw: "", before: "" }).success).toBe(false);
    expect(hints.input.safeParse({ ...hints.example, assessments: [{ id: "X1", label: "Term Test 2", kind: "test", when: "Fri" }] }).success).toBe(false);
  });
});
