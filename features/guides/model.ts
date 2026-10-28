import { ids, slugify, type ChapterId, type Course, type CourseId, type EpochMs, type Guide, type GuideChapter, type GuideSection, type Passage, type SectionId } from "@/lib/domain";
import type { GuideOutline } from "./schema";

/** Rows for a new outline. Ids come from titles, so a repeated title gets "-2" and ids stay URL-safe. */
export function outlineRows(courseId: CourseId, outline: GuideOutline, now: EpochMs): { guide: Guide; sections: GuideSection[] } {
  const taken = new Set<string>();
  const unique = (base: string) => {
    const slug = base || "section";
    let candidate = slug;
    for (let n = 2; taken.has(candidate); n++) candidate = `${slug}-${n}`;
    taken.add(candidate);
    return candidate;
  };
  const chapterSlugs = new Set<string>();
  const chapters: GuideChapter[] = outline.chapters.map((c) => {
    let slug = slugify(c.title) || "chapter";
    for (let n = 2; chapterSlugs.has(slug); n++) slug = `${slugify(c.title) || "chapter"}-${n}`;
    chapterSlugs.add(slug);
    return {
      id: `${courseId}.${slug}` as ChapterId,
      title: c.title,
      ...(c.textbookChapter ? { textbookChapter: c.textbookChapter } : {}),
      sections: c.sections.map((title) => ({ id: ids.section(courseId, unique(slugify(title))), title })),
    };
  });
  let order = 0;
  const sections = chapters.flatMap((c) => c.sections.map((s): GuideSection => ({ id: s.id, courseId, chapterId: c.id, order: order++, title: s.title })));
  return { guide: { courseId, chapters, outlinedAt: now }, sections };
}

export interface Located {
  section: GuideSection;
  chapter: GuideChapter;
  prev?: GuideSection;
  next?: GuideSection;
}

/** The section a URL slug names, with its chapter and neighbours in reading order. */
export function locate(guide: Guide, sections: readonly GuideSection[], slug: string): Located | null {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const i = ordered.findIndex((s) => ids.sectionSlug(s.id) === slug);
  if (i < 0) return null;
  const section = ordered[i];
  const chapter = guide.chapters.find((c) => c.id === section.chapterId);
  if (!chapter) return null;
  return { section, chapter, prev: ordered[i - 1], next: ordered[i + 1] };
}

/** Where a course opens: its last-read section, else its first. */
export function openingSection(guide: Guide, sections: readonly GuideSection[]): SectionId | undefined {
  const last = guide.lastRead && sections.some((s) => s.id === guide.lastRead?.sectionId) ? guide.lastRead.sectionId : undefined;
  return last ?? [...sections].sort((a, b) => a.order - b.order)[0]?.id;
}

/** "Lecture 8 slides, Lab 6 handout and 2 more": distinct names, at most three, joined for a sentence. */
export function joinNames(all: readonly string[]): string {
  const names = [...new Set(all)];
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  return shown.length <= 1 ? (shown[0] ?? "") : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

/** "Lecture 7, Lecture 7 slides and Textbook ch. 5": what a section is being written from. */
export function sourceNames(passages: readonly Pick<Passage, "ref">[]): string {
  return joinNames(
    passages.map(({ ref }) => {
      switch (ref.kind) {
        case "transcript":
          return ref.lectureNumber === undefined ? "a lecture" : `Lecture ${ref.lectureNumber}`;
        case "page": {
          const chapter = ref.doc.kind === "textbook" ? ref.section?.match(/^§\s*(\d+)/)?.[1] : undefined;
          return chapter ? `${ref.doc.title} ch. ${chapter}` : ref.doc.title;
        }
        case "question":
          return ref.setTitle;
        case "assessment":
          return ref.label;
        case "section":
          return ref.title;
      }
    }),
  );
}

/** /guides opens the most recently read guide, else the first course with a guide, else the first course. */
export function guidesLanding(courses: readonly Pick<Course, "id" | "code">[], guides: readonly Guide[]): { courseId: CourseId; sectionId?: SectionId } | null {
  const read = guides.filter((g) => g.lastRead).sort((a, b) => (b.lastRead?.at ?? 0) - (a.lastRead?.at ?? 0))[0];
  if (read?.lastRead) return { courseId: read.courseId, sectionId: read.lastRead.sectionId };
  const byCode = [...courses].sort((a, b) => a.code.localeCompare(b.code));
  const courseId = byCode.find((c) => guides.some((g) => g.courseId === c.id))?.id ?? guides.map((g) => g.courseId).sort()[0] ?? byCode[0]?.id;
  return courseId ? { courseId } : null;
}
