import type { CourseId, EpochMs, EventId, LectureId, MaterialId, QuestionId, SectionId, SetId } from "./ids";
import type { MaterialKind } from "./materials";

/** Display facts copied at citation time, so labels need no lookup and survive deletion. */
export interface DocFacts {
  kind: MaterialKind;
  title: string;
  short?: string;
  lectureNumber?: number;
}

/** The one citation type. Chips, resource rows, footnotes, related cards and plan steps all use it. */
export type SourceRef =
  | { kind: "page"; materialId: MaterialId; doc: DocFacts; page: number; to?: number; label?: string; section?: string; figure?: string; title?: string }
  | { kind: "transcript"; lectureId: LectureId; courseId: CourseId; lectureNumber?: number; atMs: number; toMs?: number; quote?: string }
  | { kind: "question"; setId: SetId; questionId: QuestionId; setTitle: string; number: string }
  | { kind: "assessment"; eventId: EventId; label: string; at: EpochMs }
  | { kind: "section"; courseId: CourseId; sectionId: SectionId; title: string };

export interface FootnoteSource {
  ref: SourceRef;
  relation?: "used" | "tested";
  note?: string;
}

/** What a course's guide was written from. stamp = newest material addedAt or lecture savedAt. */
export interface CourseSources {
  stamp: EpochMs;
  newest?: { label: string; at: EpochMs };
}
