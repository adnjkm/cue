import { describe, expect, it } from "vitest";
import { buildExam } from "./exam";
import type { PaperChunkRead } from "./types";

const opts = (...labels: string[]) => labels.map((label) => ({ label, text: `Option ${label}` }));
const q = (number: string, extra: Partial<PaperChunkRead["questions"][number]> = {}): PaperChunkRead["questions"][number] => ({
  number,
  topic: "Big-O",
  prompt: `Question ${number}`,
  options: opts("A", "B", "C", "D"),
  ...extra,
});

describe("buildExam", () => {
  it("takes keys from a later answer-key page, trusting only keys that name an option", () => {
    const exam = buildExam(
      [
        { title: "Fall 2024 Midterm", course: "CSC148", questions: [q("1"), q("2"), q("3", { answer: "D" })], answerKey: [] },
        { questions: [], answerKey: [{ number: "1", answer: "B" }, { number: "2", answer: "F" }, { number: "3", answer: "A" }] },
      ],
      "quiz.pdf",
    );
    expect(exam.title).toBe("Fall 2024 Midterm");
    expect(exam.course).toBe("CSC148");
    expect(exam.questions.map((x) => x.key)).toEqual([{ source: "document", answer: "B" }, { source: "none" }, { source: "document", answer: "D" }]);
  });

  it("keeps the first key when two key pages disagree", () => {
    const exam = buildExam([{ questions: [q("1")], answerKey: [{ number: "1", answer: "C" }] }, { questions: [], answerKey: [{ number: "1", answer: "A" }] }], "x.pdf");
    expect(exam.questions[0].key).toEqual({ source: "document", answer: "C" });
  });

  it("joins a question split across two chunks into one", () => {
    const exam = buildExam(
      [
        { questions: [q("1"), q("2", { prompt: "What is the cost of", options: opts("A", "B") })], answerKey: [] },
        { questions: [q("2", { prompt: "What is the cost of appending to a list?", options: [{ label: "C", text: "O(n)" }, { label: "D", text: "O(n²)" }] }), q("3")], answerKey: [] },
      ],
      "x.pdf",
    );
    expect(exam.questions.map((x) => x.number)).toEqual(["1", "2", "3"]);
    expect(exam.questions[1].prompt).toBe("What is the cost of appending to a list?");
    expect(exam.questions[1].options.map((o) => o.label)).toEqual(["A", "B", "C", "D"]);
  });

  it("numbers by position when two sections both start at 1", () => {
    const exam = buildExam([{ questions: [q("1"), q("2"), q("1", { topic: "Trees" }), q("2", { topic: "Trees" })], answerKey: [] }], "x.pdf");
    expect(exam.questions.map((x) => x.number)).toEqual(["1", "2", "3", "4"]);
  });

  it("names the paper after its file when no title is printed, and leaves the course out", () => {
    const exam = buildExam([{ questions: [q("1", { marks: 2 })], answerKey: [] }], "Term test 2 (scan).PDF");
    expect(exam.title).toBe("Term test 2 (scan)");
    expect(exam).not.toHaveProperty("course");
    expect(exam.questions[0]).toMatchObject({ number: "1", type: "multipleChoice", marks: 2, origin: { kind: "paper" } });
  });

  it("carries a figure box to be cropped later", () => {
    const exam = buildExam([{ questions: [q("5", { figure: { page: 1, box: [0.1, 0.7, 0.4, 0.9] } })], answerKey: [] }], "x.pdf");
    expect(exam.questions[0].figureAt).toEqual({ page: 1, box: [0.1, 0.7, 0.4, 0.9] });
  });
});
