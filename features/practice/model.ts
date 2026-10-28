import { gradeOf, type Attempt, type Grade, type Question, type QuestionId, type Solution } from "@/lib/domain";

export type TileState = "current" | "correct" | "missed" | "unanswered" | "checking";

export function topicsOf(questions: readonly Question[]): string[] {
  return [...new Set(questions.map((q) => q.topic))];
}

/** Questions in printed order, narrowed to one topic or all of them. */
export function visibleQuestions(questions: readonly Question[], topic: string | null): Question[] {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  return topic === null ? sorted : sorted.filter((q) => q.topic === topic);
}

/** The bar groups by topic, keeping printed numbers, so numbers interleave across groups. */
export function groupByTopic(questions: readonly Question[]): { topic: string; questions: Question[] }[] {
  const groups = new Map<string, Question[]>();
  for (const q of questions) groups.set(q.topic, [...(groups.get(q.topic) ?? []), q]);
  return [...groups].map(([topic, qs]) => ({ topic, questions: qs }));
}

export function tileState(q: Question, current: QuestionId | null, attempt: Attempt | undefined): TileState {
  if (q.id === current) return "current";
  const g = gradeOf(q, attempt);
  if (g.status === "unanswered") return "unanswered";
  if (g.status === "checking") return "checking";
  return g.correct ? "correct" : "missed";
}

export type RowState = "idle" | "correct-choice" | "wrong-choice" | "correct-answer" | "checking" | "other";

export function rowState(grade: Grade, label: string, key: Question["key"]): RowState {
  switch (grade.status) {
    case "unanswered":
      return "idle";
    case "checking":
      return grade.choice === label ? "checking" : "other";
    case "answered":
      if (grade.choice === label) return grade.correct ? "correct-choice" : "wrong-choice";
      return key.source !== "none" && label === key.answer ? "correct-answer" : "other";
  }
}

export const ROW_NOTE: Record<RowState, string | undefined> = {
  idle: undefined,
  "correct-choice": "Your answer · correct",
  "wrong-choice": "Your answer · wrong",
  "correct-answer": "Correct answer",
  checking: "Your answer · checking…",
  other: undefined,
};

export function eyebrow(q: Question): string {
  const parts = [`Question ${q.number}`];
  if (q.origin.kind === "generated") parts.push("Written by Cue");
  parts.push("Multiple choice");
  if (q.marks) parts.push(`${q.marks} mark${q.marks === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function provenance(q: Question, s: Solution): string {
  const grounded = s.provenance.groundedIn;
  const lecture = grounded?.kind === "page" ? grounded.doc.lectureNumber : grounded?.kind === "transcript" ? grounded.lectureNumber : undefined;
  const from = lecture !== undefined ? `Lecture ${lecture}` : grounded?.kind === "page" ? grounded.doc.title : "your course material";
  if (q.origin.kind === "generated") return `Cue wrote this question from ${from}.`;
  if (s.provenance.by === "document") return `The answer is from the official answer key; Cue wrote the explanation from ${from}.`;
  return `The original exam had no answer key; Cue wrote this from ${from}.`;
}
