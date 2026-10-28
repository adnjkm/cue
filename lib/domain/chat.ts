import type { BlockId, CourseId, EpochMs, LectureId, MessageId, QuestionId, ThreadKey } from "./ids";
import type { SourceRef } from "./sources";
import type { AskMode } from "./study";

/** One row per settled message; written once when the reply finishes or is stopped, never per token. */
export interface ChatMessage {
  id: MessageId;
  thread: ThreadKey;
  courseId: CourseId | null;
  role: "user" | "assistant";
  /** Citation markers removed. */
  text: string;
  citations: readonly SourceRef[];
  mode?: AskMode;
  at: EpochMs;
  /** "Add to study guide"; Guides reads these per course. */
  savedToGuideAt?: EpochMs;
}

/** The four ask contexts the screens draw. Each maps to one prompt and one context source in lib/chat. */
export type AskScope =
  /** Study session. courseId null = all courses (end-of-week review). */
  | { kind: "study"; courseId: CourseId | null; lectureId?: LectureId; focus?: SourceRef }
  /** Note taker: "Uses the last 5 minutes". */
  | { kind: "liveLecture"; lectureId: LectureId; windowMs: number }
  /** Saved notes: "Uses the whole lecture". Same thread as the live scope, so "Your questions" is one list. */
  | { kind: "lecture"; lectureId: LectureId }
  /** Practice "Ask why": hints only until answered. */
  | { kind: "question"; questionId: QuestionId };

export const threadKey = {
  session: (id: BlockId): ThreadKey => `session:${id}` as ThreadKey,
  lecture: (id: LectureId): ThreadKey => `lecture:${id}` as ThreadKey,
  question: (id: QuestionId): ThreadKey => `question:${id}` as ThreadKey,
} as const;

export interface PendingReply {
  question: string;
  mode: AskMode;
  /** Streamed so far, markers not yet parsed. */
  text: string;
  thinking: string;
  phase: "retrieving" | "thinking" | "answering";
}
