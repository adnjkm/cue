import type { BlobId, CourseId, EpochMs, MaterialId, MessageId, QuestionId, SectionId, SetId } from "./ids";
import type { SourceRef } from "./sources";

export type Box = [x0: number, y0: number, x1: number, y1: number];

export interface Option {
  label: string;
  text: string;
}

export interface TreeNode {
  v: string;
  l?: TreeNode;
  r?: TreeNode;
}

export type Figure = { kind: "crop"; blob: BlobId; page: number; box: Box } | { kind: "tree"; root: TreeNode };

/** Where "Write questions" takes its material from. Travels in the URL as base64url JSON. */
export type GenerationScope =
  | { kind: "topic"; courseId: CourseId; topic: string | "missedMost"; missedOnly: boolean; count: 3 | 5 | 10; note?: string }
  | { kind: "similar"; questionId: QuestionId }
  | { kind: "section"; courseId: CourseId; sectionId: SectionId }
  | { kind: "message"; courseId: CourseId; messageId: MessageId };

export interface PracticeSet {
  id: SetId;
  courseId: CourseId | null;
  /** "2024 Midterm". */
  title: string;
  origin: { kind: "paper"; materialId: MaterialId } | { kind: "generated"; scope: GenerationScope };
  /** current is null while a generated set is still empty. */
  view: { current: QuestionId | null; topic: string | null };
  createdAt: EpochMs;
}

/** The single source of truth for grading. An answer cannot exist without saying where it came from. */
export type AnswerKey = { source: "document"; answer: string } | { source: "model"; answer: string } | { source: "none" };

export interface Question {
  id: QuestionId;
  setId: SetId;
  order: number;
  /** As printed; generated ones continue after the paper's last. */
  number: string;
  topic: string;
  type: "multipleChoice";
  marks?: number;
  prompt: string;
  options: readonly Option[];
  key: AnswerKey;
  figure?: Figure;
  origin: { kind: "paper" } | { kind: "generated"; from: readonly SourceRef[] };
}

/** Only the choice is stored. */
export interface Attempt {
  questionId: QuestionId;
  setId: SetId;
  choice: string;
  at: EpochMs;
}

export type Grade = { status: "unanswered" } | { status: "checking"; choice: string } | { status: "answered"; choice: string; correct: boolean };

/** Checking means a choice exists and no key is known yet. Survives reloads. */
export function gradeOf(q: Pick<Question, "key">, attempt: Pick<Attempt, "choice"> | undefined): Grade {
  if (!attempt) return { status: "unanswered" };
  if (q.key.source === "none") return { status: "checking", choice: attempt.choice };
  return { status: "answered", choice: attempt.choice, correct: attempt.choice === q.key.answer };
}
