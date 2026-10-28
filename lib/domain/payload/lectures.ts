import type { EpochMs } from "../ids";

/** Written once by the end-of-lecture pass. Exam hints are not copied here: they are flagged segments. */
export interface LectureNotes {
  summary: string;
  keyPoints: readonly { atMs: number; text: string }[];
  generatedAt: EpochMs;
}
