"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import type { Course, CourseId, SectionId } from "@/lib/domain";
import { href } from "@/lib/routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function QuizAction({ courseId, sectionId, className }: { courseId: CourseId; sectionId: SectionId | null; className?: string }) {
  if (!sectionId) {
    return (
      <Button disabled className={className}>
        Quiz me on this section
      </Button>
    );
  }
  return (
    <Link href={href.practice({ generate: { kind: "section", courseId, sectionId } })} className={cn(buttonVariants(), className)}>
      Quiz me on this section
    </Link>
  );
}

/**
 * Title left, controls right, as drawn. From 768 to 1023 a Contents button leads the controls; below 768 the
 * controls wrap under the title and Export PDF moves into a menu, because Quiz me rides the bottom bar.
 */
export function Toolbar({
  courseId,
  courses,
  canExport,
  quizSection,
  contents,
  onAddMaterial,
}: {
  courseId: CourseId;
  courses: readonly Course[];
  canExport: boolean;
  quizSection: SectionId | null;
  contents?: ReactNode;
  onAddMaterial?: () => void;
}) {
  const router = useRouter();
  const [exporting, startExport] = useTransition();
  const exportGuide = () => startExport(() => router.push(href.guideExport(courseId)));
  const items = courses.map((c) => ({ value: c.id, label: c.code }));
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 md:min-h-8">
      <h1 className="min-w-0 text-lg leading-6 font-normal tracking-display text-ink">{courseId} · Study guide</h1>
      <div className="flex items-center gap-3 max-md:w-full">
        {contents}
        <Select
          items={items}
          value={items.some((i) => i.value === courseId) ? courseId : null}
          onValueChange={(next) => next && next !== courseId && router.push(href.guide(next as CourseId))}
        >
          <SelectTrigger aria-label="Course">
            <SelectValue placeholder="Course" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="end" className="min-w-36">
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value} className="py-1 leading-5">
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" disabled={!canExport || exporting} onClick={exportGuide} className="max-md:hidden">
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
        <QuizAction courseId={courseId} sectionId={quizSection} className="max-md:hidden" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label="More actions" className="rounded-sm md:hidden" />}>
            <Ellipsis className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-40">
            <DropdownMenuItem disabled={!canExport} onClick={exportGuide}>
              Export PDF
            </DropdownMenuItem>
            {onAddMaterial && <DropdownMenuItem onClick={onAddMaterial}>Add material</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
