import type { AiErrorKind } from "./ai";
import type { ChapterId, CourseId, EpochMs, SectionId } from "./ids";
import type { GuideDraft } from "./payload/guides";
import type { CourseSources } from "./sources";

export interface GuideChapter {
  id: ChapterId;
  title: string;
  /** Kept apart from guide order ("Elasticity" is 4th here, textbook ch. 5). */
  textbookChapter?: number;
  sections: readonly { id: SectionId; title: string }[];
}

export interface Guide {
  courseId: CourseId;
  chapters: readonly GuideChapter[];
  outlinedAt: EpochMs;
  /** Drives `/guides` (most recently read course) and the course select (its last section). */
  lastRead?: { sectionId: SectionId; at: EpochMs };
}

export interface GuideSection {
  id: SectionId;
  courseId: CourseId;
  chapterId: ChapterId;
  order: number;
  title: string;
  /** Missing = not written yet. */
  draft?: GuideDraft;
  /** The last write or rewrite failed. With a draft present, the old draft stays on screen beside the error. */
  lastError?: { kind: AiErrorKind; at: EpochMs };
}

/** Newer material or a newer saved lecture than the draft used. */
export function sectionStale(section: GuideSection, sources: CourseSources): { stale: false } | { stale: true; because: string } {
  if (!section.draft || sources.stamp <= section.draft.sourceStamp) return { stale: false };
  return { stale: true, because: sources.newest ? `${sources.newest.label} added` : "New material added" };
}
