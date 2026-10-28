"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { db, useLive } from "@/lib/db";
import { ids, type CourseId } from "@/lib/domain";
import { href } from "@/lib/routes";
import { useCourseSources } from "@/lib/sources";
import { AddMaterialDialog } from "@/components/cue";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ContentsNav } from "./ContentsNav";
import { joinNames, locate, openingSection, type Located } from "./model";
import { ErrorBox, SectionView } from "./SectionView";
import { tid } from "./testids";
import { QuizAction, Toolbar } from "./Toolbar";
import { markRead, useOutlineJob, writeGuide } from "./writer";

const COLUMN = "flex min-w-0 flex-1 flex-col gap-6";
const TEXT = "max-w-[760px] text-sm leading-[22px] text-ink";

function useGuideData(courseId: CourseId) {
  return useLive(async () => {
    const [courses, guide, sections, materials] = await Promise.all([
      db.courses.toArray(),
      db.guides.get(courseId),
      db.guideSections.where("courseId").equals(courseId).sortBy("order"),
      db.materials.where("courseId").equals(courseId).sortBy("addedAt"),
    ]);
    return { courses: courses.sort((a, b) => a.code.localeCompare(b.code)), guide: guide ?? null, sections, materials };
  }, [courseId]);
}

function AddMaterialButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 self-start rounded-sm py-1.5 text-sm leading-5 text-graphite transition-colors duration-[120ms] ease-standard hover:text-ink"
    >
      <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
      Add material
    </button>
  );
}

/** ] and [ page through sections when focus is in the guide or nowhere, never in a field, a popup or the app nav. */
function useSectionKeys(root: React.RefObject<HTMLElement | null>, courseId: CourseId, located: Located | null) {
  const router = useRouter();
  const prev = located?.prev?.id;
  const next = located?.next?.id;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || (e.key !== "]" && e.key !== "[")) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const inGuide = target === document.body || (target !== null && (root.current?.contains(target) ?? false));
      if (!inGuide || target?.closest("input, textarea, select, [contenteditable], [role=combobox], [role=listbox], [role=menu], [role=dialog]")) return;
      const to = e.key === "]" ? next : prev;
      if (!to) return;
      e.preventDefault();
      router.push(href.guide(courseId, to));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [root, router, courseId, prev, next]);
}

export function GuidePage({ courseParam, slug }: { courseParam: string; slug?: string }) {
  const router = useRouter();
  const courseId = ids.course(courseParam);
  const root = useRef<HTMLDivElement>(null);
  const data = useGuideData(courseId);
  const sources = useCourseSources(courseId);
  const outlineJob = useOutlineJob(courseId);
  const [adding, setAdding] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const located = data?.guide && slug ? locate(data.guide, data.sections, slug) : null;
  const sectionId = located?.section.id;

  useEffect(() => {
    if (courseId !== courseParam) router.replace(slug ? `/guides/${courseId}/${slug}` : href.guide(courseId));
  }, [courseId, courseParam, slug, router]);

  const opening = data?.guide ? openingSection(data.guide, data.sections) : undefined;
  useEffect(() => {
    if (!slug && opening) router.replace(href.guide(courseId, opening));
  }, [slug, opening, courseId, router]);

  useEffect(() => {
    if (sectionId) void markRead(courseId, sectionId);
  }, [courseId, sectionId]);

  useSectionKeys(root, courseId, located);

  const shownCourse = useRef(courseId);
  useEffect(() => {
    shownCourse.current = courseId;
  }, [courseId]);
  const writeThisGuide = async () => {
    const first = await writeGuide(courseId);
    if (first && shownCourse.current === courseId) router.replace(href.guide(courseId, first));
  };

  const course = data?.courses.find((c) => c.id === courseId);
  const hasMaterial = (sources?.stamp ?? 0) > 0;
  const nav = (onNavigate?: () => void, label = true) =>
    data?.guide && located ? (
      <ContentsNav
        courseId={courseId}
        guide={data.guide}
        current={{ chapterId: located.chapter.id, sectionId: located.section.id }}
        prev={located.prev?.id}
        next={located.next?.id}
        onNavigate={onNavigate}
        label={label}
      />
    ) : null;

  let body: React.ReactNode = null;
  if (!data) body = null;
  else if (data.guide && located) {
    body = (
      <div className="flex gap-12">
        <div className="-mx-1 flex w-[248px] shrink-0 flex-col gap-3 self-start overflow-y-auto px-1 max-lg:hidden lg:sticky lg:top-7 lg:max-h-[calc(100dvh-56px)]">
          {nav()}
          <AddMaterialButton onClick={() => setAdding(true)} />
        </div>
        <SectionView key={located.section.id} section={located.section} sources={sources} />
      </div>
    );
  } else if (data.guide && slug) {
    const first = openingSection(data.guide, data.sections);
    body = (
      <div className={cn(COLUMN, "items-start gap-4")}>
        <p className={TEXT}>This section isn&apos;t in the {courseId} guide. It may have been renamed when the guide was planned again.</p>
        {first && (
          <Link href={href.guide(courseId, first)} className={buttonVariants({ variant: "secondary" })}>
            Open the guide
          </Link>
        )}
      </div>
    );
  } else if (data.guide) body = null;
  else if (!course) {
    body = (
      <div className={cn(COLUMN, "items-start gap-4")}>
        <p className={TEXT}>There&apos;s no course called {courseParam} in Cue. Pick one of your courses, or add your schedule to bring in new ones.</p>
        <Link href={href.guides()} className={buttonVariants({ variant: "secondary" })}>
          Open your study guides
        </Link>
      </div>
    );
  } else if (!sources) body = null;
  else if (!hasMaterial) {
    body = (
      <div className={cn(COLUMN, "items-start gap-4")}>
        <p className={TEXT}>No material for {course.code} yet. Add a lecture, slides or a textbook chapter and Cue will write the guide.</p>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add material
        </Button>
      </div>
    );
  } else {
    const planning = outlineJob?.status === "planning";
    const from = joinNames(data.materials.map((m) => m.title)) || "your saved lectures";
    body = (
      <div className={cn(COLUMN, "items-start gap-4")}>
        <p className={TEXT}>
          Cue plans chapters for {course.code} from {from}, then writes each section with footnotes to the slide, page or lecture moment it came from.
        </p>
        {outlineJob?.status === "failed" && <ErrorBox label="Couldn't plan this guide" error={outlineJob.error} className="self-stretch" />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button disabled={planning} onClick={() => void writeThisGuide()}>
            Write this guide
          </Button>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add material
          </Button>
        </div>
        {planning && (
          <p role="status" className="text-sm leading-5 text-graphite">
            Planning chapters from {from}.
          </p>
        )}
      </div>
    );
  }

  const contentsSheet = located ? (
    <Sheet open={contentsOpen} onOpenChange={setContentsOpen}>
      <SheetTrigger render={<Button variant="secondary" className="lg:hidden" />}>Contents</SheetTrigger>
      <SheetContent side="left" className="gap-0 overflow-y-auto border-rule p-0 shadow-none data-[side=left]:w-[288px] data-[side=left]:sm:max-w-[288px]">
        <SheetHeader className="px-6 pt-7 pb-0">
          <SheetTitle className="py-1.5 text-sm leading-4 tracking-caps text-graphite uppercase">Contents</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-6 pt-3 pb-6">
          {nav(() => setContentsOpen(false), false)}
          <AddMaterialButton
            onClick={() => {
              setContentsOpen(false);
              setAdding(true);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  ) : undefined;

  return (
    <div
      ref={root}
      data-testid={tid.main}
      aria-busy={!data || undefined}
      className={cn("flex min-w-0 flex-col gap-6 px-4 pt-6 pb-12 md:px-10 md:pt-7", located && "max-md:pb-0")}
    >
      <Toolbar
        courseId={courseId}
        courses={data?.courses ?? []}
        canExport={data?.sections.some((s) => s.draft) ?? false}
        quizSection={located?.section.draft ? located.section.id : null}
        contents={contentsSheet}
        onAddMaterial={course ? () => setAdding(true) : undefined}
      />
      {body}
      {located && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-rule bg-page px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden">
          <QuizAction courseId={courseId} sectionId={located.section.draft ? located.section.id : null} className="h-11 w-full" />
        </div>
      )}
      {course && <AddMaterialDialog open={adding} onOpenChange={setAdding} courseId={courseId} defaultKind="slides" />}
    </div>
  );
}
