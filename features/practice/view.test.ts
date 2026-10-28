import { describe, expect, it } from "vitest";
import type { Question, QuestionId, SetId } from "@/lib/domain";
import { onwardTarget, reduceView, type View } from "./view";

const SET = "set_paper" as SetId;
const RT = "Recursion & trees";
const BO = "Big-O & efficiency";
const LL = "Linked lists";
const TOPIC: Record<number, string> = { 1: RT, 2: RT, 3: RT, 4: RT, 5: BO, 6: BO, 7: RT, 8: RT, 9: BO, 10: BO, 11: BO, 12: LL, 13: LL, 14: LL, 15: LL };
const id = (n: number) => `${SET}.q${n}` as QuestionId;

/** Paper's midterm: 15 questions in printed order, keys all B. */
const questions: Question[] = Object.entries(TOPIC).map(([n, topic], order) => ({
  id: id(Number(n)),
  setId: SET,
  order,
  number: n,
  topic,
  type: "multipleChoice",
  prompt: `Question ${n}`,
  options: ["A", "B", "C", "D"].map((label) => ({ label, text: label })),
  key: { source: "model", answer: "B" },
  origin: { kind: "paper" },
}));
const answered = (...ns: number[]) => new Map(ns.map((n) => [id(n), { choice: "B" }]));
const ctx = { questions, attempts: answered(1, 2, 3, 4, 5, 6, 7, 9) };
const at = (n: number, topic: string | null = null): View => ({ current: id(n), topic });

describe("reduceView", () => {
  it("steps through printed order, crossing topic groups (4 then 5)", () => {
    expect(reduceView(at(4), { type: "step", by: 1 }, ctx)).toEqual(at(5));
    expect(reduceView(at(7), { type: "step", by: -1 }, ctx)).toEqual(at(6));
  });

  it("stops at the ends and returns the same view, so nothing is written", () => {
    const first = at(1);
    expect(reduceView(first, { type: "step", by: -1 }, ctx)).toBe(first);
    const last = at(15);
    expect(reduceView(last, { type: "step", by: 1 }, ctx)).toBe(last);
  });

  it("steps only within the filtered topic", () => {
    expect(reduceView(at(6, BO), { type: "step", by: 1 }, ctx)).toEqual(at(9, BO));
  });

  it("keeps the current question when the new topic still shows it", () => {
    expect(reduceView(at(7), { type: "filter", topic: RT }, ctx)).toEqual(at(7, RT));
  });

  it("jumps to the topic’s first question when the filter hides the current one", () => {
    expect(reduceView(at(7), { type: "filter", topic: BO }, ctx)).toEqual(at(5, BO));
    expect(reduceView(at(5, BO), { type: "filter", topic: null }, ctx)).toEqual(at(5));
  });

  it("goes onward to the next question while it is unanswered", () => {
    expect(reduceView(at(7), { type: "onward" }, ctx)).toEqual(at(8));
    expect(reduceView(at(9, BO), { type: "onward" }, ctx)).toEqual(at(10, BO));
  });

  it("jumps to the first unanswered question when the next one is answered or none follows", () => {
    const eightDone = { questions, attempts: answered(1, 2, 3, 4, 5, 6, 7, 8, 9) };
    expect(reduceView(at(8), { type: "onward" }, eightDone)).toEqual(at(10));
    expect(reduceView(at(15), { type: "onward" }, ctx)).toEqual(at(8));
    expect(reduceView(at(11, BO), { type: "onward" }, ctx)).toEqual(at(10, BO));
  });

  it("reports no onward target once every visible question is answered", () => {
    const allAnswered = { questions, attempts: answered(...Object.keys(TOPIC).map(Number)) };
    expect(onwardTarget(at(15), allAnswered)).toBeUndefined();
    expect(onwardTarget(at(7), allAnswered)).toBeUndefined();
    expect(onwardTarget(at(7), ctx)).toBe(id(8));
  });

  it("clears a filter that would hide a question opened by link", () => {
    expect(reduceView(at(5, BO), { type: "goto", id: id(12) }, ctx)).toEqual(at(12));
    expect(reduceView(at(5, BO), { type: "goto", id: id(9) }, ctx)).toEqual(at(9, BO));
  });

  it("ignores a link to a question the set does not have", () => {
    const view = at(7);
    expect(reduceView(view, { type: "goto", id: "set_other.q1" as QuestionId }, ctx)).toBe(view);
  });

  it("starts an empty written set on its first question and leaves a started one alone", () => {
    expect(reduceView({ current: null, topic: null }, { type: "appended", id: id(1) }, ctx)).toEqual(at(1));
    const view = at(7);
    expect(reduceView(view, { type: "appended", id: id(16) }, ctx)).toBe(view);
  });
});
