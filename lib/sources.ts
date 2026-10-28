"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { db, useLive } from "@/lib/db";
import type { CourseId, CourseSources, EpochMs, FootnoteSource, SourceRef } from "@/lib/domain";
import { href } from "@/lib/routes";
import { currentZone, fmtStamp, zoneOf } from "@/lib/time";

type PageRef = Extract<SourceRef, { kind: "page" }>;

function pageLoc(ref: PageRef): string {
  return ref.figure ? `Figure ${ref.figure}` : (ref.section ?? ref.label ?? `p. ${ref.page}`);
}

function slideRange(ref: PageRef): string {
  return ref.to && ref.to !== ref.page ? `${ref.page}–${ref.to}` : String(ref.page);
}

function chapterOf(section: string | undefined): string | undefined {
  return section?.match(/^§\s*(\d+)/)?.[1];
}

function pageLabel(ref: PageRef, style: "chip" | "meta" | "footnote"): string {
  const { doc } = ref;
  if (doc.kind === "slides") {
    const many = ref.to && ref.to !== ref.page;
    const slides = `${many ? "Slides" : "Slide"} ${slideRange(ref)}`;
    if (style === "chip") return slides;
    if (style === "meta") return `${doc.title} · ${slides}`;
    return `${doc.title} ${slideRange(ref)}`;
  }
  const name = doc.short ?? doc.title;
  if (style === "chip") return `${name} ${pageLoc(ref)}`;
  if (style === "meta") return `${doc.title} · ${pageLoc(ref)}`;
  if (ref.figure) return `${doc.title} Figure ${ref.figure}`;
  if (doc.kind === "problemSet" || doc.kind === "pastPaper") return `${doc.title}, ${ref.label ?? `p. ${ref.page}`}`;
  if (doc.kind === "textbook") {
    const chapter = chapterOf(ref.section);
    const page = ref.label ?? `p. ${ref.page}`;
    return chapter ? `${doc.title} ch. ${chapter}, ${page}` : `${doc.title}, ${page}`;
  }
  return `${name} ${pageLoc(ref)}`;
}

/**
 * The only label formatter. Unit-tested against every Paper string:
 * chip:     "Slide 17", "Transcript 41:05", "A2 handout §3", "Textbook §5.2"
 * meta:     "Lecture 8 slides · Slide 17", "Lecture 8 transcript · 41:05", "Course notes · §5.3"
 * footnote: "Lecture 7 at 4:15", "Lecture 7 slides 6–8", "Textbook ch. 5, p. 92", "Textbook Figure 5-1"
 */
export function sourceLabel(ref: SourceRef, style: "chip" | "meta" | "footnote"): string {
  switch (ref.kind) {
    case "page":
      return pageLabel(ref, style);
    case "transcript": {
      const at = fmtStamp(ref.atMs);
      const lecture = ref.lectureNumber === undefined ? "Lecture" : `Lecture ${ref.lectureNumber}`;
      if (style === "chip") return `Transcript ${at}`;
      if (style === "meta") return `${lecture} transcript · ${at}`;
      return `${lecture} at ${at}`;
    }
    case "question":
      return style === "chip" ? `Q${ref.number}` : `${ref.setTitle}, Q${ref.number}`;
    case "assessment":
      return ref.label;
    case "section":
      return ref.title;
  }
}

/** "Lecture 7 at 4:15. Textbook ch. 5, p. 92." and "Lecture 7 slides 6–8. Used in Problem Set 4, Q1." */
export function footnoteText(sources: readonly FootnoteSource[]): string {
  if (sources.length === 0) return "";
  const parts = sources.map(({ ref, relation, note }) => {
    const label = sourceLabel(ref, "footnote");
    const related = relation === "used" ? `Used in ${label}` : relation === "tested" ? `Tested in ${label}` : label;
    return note ? `${related}, ${note}` : related;
  });
  return `${parts.join(". ")}.`;
}

type PeekListener = () => void;
let peekRef: SourceRef | null = null;
const peekListeners = new Set<PeekListener>();

/** The SourcePeek sheet reads this store, so any screen can open a source without losing its own state. */
export const sourcePeek = {
  open(ref: SourceRef) {
    peekRef = ref;
    peekListeners.forEach((l) => l());
  },
  close() {
    peekRef = null;
    peekListeners.forEach((l) => l());
  },
  subscribe(listener: PeekListener) {
    peekListeners.add(listener);
    return () => peekListeners.delete(listener);
  },
  current: () => peekRef,
} as const;

export function useSourcePeek(): SourceRef | null {
  return useSyncExternalStore(sourcePeek.subscribe, sourcePeek.current, () => null);
}

/** Opens a ref without losing the current screen: page and transcript refs open SourcePeek; others navigate. */
export function useOpenSource(): (ref: SourceRef) => void {
  const router = useRouter();
  return useCallback(
    (ref: SourceRef) => {
      switch (ref.kind) {
        case "page":
        case "transcript":
          sourcePeek.open(ref);
          return;
        case "question":
          router.push(href.practiceSet(ref.setId, { q: ref.questionId }));
          return;
        case "assessment":
          router.push(href.calendar({ view: "day", date: zoneOf(currentZone()).dayOf(ref.at) }));
          return;
        case "section":
          router.push(href.guide(ref.courseId, ref.sectionId));
          return;
      }
    },
    [router],
  );
}

/** Pure part of useCourseSources, so the stale rule is testable without a database. */
export function courseSourcesFrom(
  materials: readonly { title: string; addedAt: EpochMs }[],
  lectures: readonly { number?: number; savedAt?: EpochMs }[],
): CourseSources {
  const items = [
    ...materials.map((m) => ({ label: m.title, at: m.addedAt })),
    ...lectures.flatMap((l) => (l.savedAt === undefined ? [] : [{ label: l.number === undefined ? "Lecture" : `Lecture ${l.number}`, at: l.savedAt }])),
  ].sort((a, b) => b.at - a.at);
  return items.length ? { stamp: items[0].at, newest: items[0] } : { stamp: 0 as EpochMs };
}

/** What a course's guide was written from. stamp = newest material addedAt or lecture savedAt. */
export function useCourseSources(courseId: CourseId): CourseSources | undefined {
  return useLive(async () => {
    const materials = await db.materials.where("courseId").equals(courseId).toArray();
    const lectures = await db.lectures.where("courseId").equals(courseId).toArray();
    return courseSourcesFrom(
      materials,
      lectures.map((l) => ({ number: l.number, savedAt: l.state.status === "saved" ? l.state.savedAt : undefined })),
    );
  }, [courseId]);
}
