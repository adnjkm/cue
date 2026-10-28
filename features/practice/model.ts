import { gradeOf, type Attempt, type Grade, type PracticeSet, type Question, type QuestionId, type Solution, type SourceRef } from "@/lib/domain";
import { plural } from "@/lib/plural";

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
  if (q.marks) parts.push(plural(q.marks, "mark").replace(" ", "\u00A0"));
  return parts.join(" · ");
}

/** "ECO101 guide · Price elasticity of demand": how a quiz names the guide section it was written from. */
export function sectionLabel(ref: Extract<SourceRef, { kind: "section" }>): string {
  return `${ref.courseId} guide · ${ref.title}`;
}

function groundedName(ref: SourceRef | undefined): string | undefined {
  if (!ref) return undefined;
  if (ref.kind === "section") return sectionLabel(ref);
  const lecture = ref.kind === "page" ? ref.doc.lectureNumber : ref.kind === "transcript" ? ref.lectureNumber : undefined;
  if (lecture !== undefined) return `Lecture ${lecture}`;
  return ref.kind === "page" ? ref.doc.title : undefined;
}

/** The muted line under a worked solution: who wrote it, and from what. */
export function provenance(q: Question, s: Solution, set: Pick<PracticeSet, "title" | "origin">): string {
  if (q.origin.kind === "generated") {
    const section = q.origin.from.find((r) => r.kind === "section");
    const from = section ? sectionLabel(section) : groundedName(s.provenance.groundedIn ?? q.origin.from[0]);
    const paper = set.origin.kind === "paper" ? `the ${set.title}` : undefined;
    const parts = section ? [from] : [from, paper].filter(Boolean);
    return parts.length ? `Cue wrote this question from ${parts.join(" and ")}.` : "Cue wrote this question from your course material.";
  }
  const from = groundedName(s.provenance.groundedIn) ?? "your course material";
  if (s.provenance.by === "document") return `The answer is from the official answer key; Cue wrote the explanation from ${from}.`;
  return `The original exam had no answer key; Cue wrote this from ${from}.`;
}
