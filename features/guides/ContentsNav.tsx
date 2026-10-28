"use client";

import Link from "next/link";
import type { CourseId, Guide, SectionId } from "@/lib/domain";
import { href } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ITEM = "flex rounded-sm py-1.5 text-sm leading-5 transition-colors duration-[120ms] ease-standard";

/**
 * Chapters in guide order with the current chapter's sections beneath it: plain links, no numbers, no chevrons.
 * A chapter link opens its first section, which is what expands it.
 */
export function ContentsNav({
  courseId,
  guide,
  current,
  prev,
  next,
  onNavigate,
}: {
  courseId: CourseId;
  guide: Guide;
  current: { chapterId: string; sectionId: SectionId };
  prev?: SectionId;
  next?: SectionId;
  onNavigate?: () => void;
}) {
  const shortcut = (id: SectionId | undefined) => (id === next ? "]" : id === prev ? "[" : undefined);
  return (
    <nav aria-label="Contents" className="flex flex-col gap-3">
      <p aria-hidden="true" className="py-1.5 text-sm leading-4 tracking-caps text-graphite uppercase">
        Contents
      </p>
      <ol role="list" className="flex flex-col">
        {guide.chapters.map((chapter) => {
          const open = chapter.id === current.chapterId;
          const first = chapter.sections[0]?.id;
          return (
            <li key={chapter.id}>
              {first && (
                <Link
                  href={href.guide(courseId, first)}
                  aria-current={open ? "true" : undefined}
                  aria-keyshortcuts={open ? undefined : shortcut(first)}
                  onClick={onNavigate}
                  className={cn(ITEM, open ? "font-medium text-ink" : "text-graphite hover:text-ink")}
                >
                  {chapter.title}
                </Link>
              )}
              {open && (
                <ol role="list" className="flex flex-col pb-1">
                  {chapter.sections.map((s) => {
                    const here = s.id === current.sectionId;
                    return (
                      <li key={s.id}>
                        <Link
                          href={href.guide(courseId, s.id)}
                          aria-current={here ? "page" : undefined}
                          aria-keyshortcuts={shortcut(s.id)}
                          onClick={onNavigate}
                          className={cn(ITEM, "items-center pl-4", here ? "font-medium text-ink" : "text-graphite hover:text-ink")}
                        >
                          {s.title}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
