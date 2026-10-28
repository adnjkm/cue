"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { db, useLive } from "@/lib/db";
import { ids } from "@/lib/domain";
import { href } from "@/lib/routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Block } from "./Blocks";
import { Footnotes } from "./Footnotes";
import { tid } from "./testids";

/** The focus frame is a fixed-height scroller; printing needs the document to run its full length. */
const PRINT_CSS = `
@page { margin: 16mm 14mm; }
@media print {
  html, body { height: auto !important; overflow: visible !important; }
  *:has(> [data-guide-print]) { height: auto !important; overflow: visible !important; display: block !important; }
}`;

/** Every written section in guide order, laid out for paper. Calls window.print() once, when the guide is on screen. */
export function ExportPage({ courseParam }: { courseParam: string }) {
  const router = useRouter();
  const courseId = ids.course(courseParam);
  const printed = useRef(false);
  const data = useLive(async () => {
    const [guide, sections] = await Promise.all([db.guides.get(courseId), db.guideSections.where("courseId").equals(courseId).sortBy("order")]);
    return { guide: guide ?? null, sections };
  }, [courseId]);
  const written = data?.sections.filter((s) => s.draft) ?? [];
  const back = href.guide(courseId);

  useEffect(() => {
    if (!data?.guide || written.length === 0 || printed.current) return;
    printed.current = true;
    void document.fonts.ready.then(() =>
      // Charts measure their width a frame after mount; two frames later the page is what prints.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print())),
    );
  }, [data?.guide, written.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role=dialog]")) router.push(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, back]);

  return (
    <div data-guide-print="" data-testid={tid.print} className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto flex max-w-[680px] flex-col gap-10 px-4 pt-7 pb-12 md:px-0 print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={back} className={buttonVariants({ variant: "secondary" })} aria-keyshortcuts="Escape">
            Back to guide
          </Link>
          {written.length > 0 && <Button onClick={() => window.print()}>Print or save as PDF</Button>}
        </div>
        <h1 className="text-lg leading-6 font-normal tracking-display text-ink">{courseId} · Study guide</h1>
        {data && !data.guide && <p className="text-sm leading-[22px] text-ink">There&apos;s no study guide for {courseId} yet. Open the guide to write one.</p>}
        {data?.guide && written.length < data.sections.length && (
          <p className="text-sm leading-5 text-graphite print:hidden">
            {written.length} of {data.sections.length} sections are written. Open a section in the guide to write it, and it joins this export.
          </p>
        )}
        {data?.guide?.chapters.map((chapter) => {
          const sections = written.filter((s) => s.chapterId === chapter.id);
          if (sections.length === 0) return null;
          return (
            <section key={chapter.id} aria-label={chapter.title} className="flex flex-col gap-8">
              <h2 className="text-sm leading-4 tracking-caps text-graphite uppercase break-after-avoid">{chapter.title}</h2>
              {sections.map((s) => (
                <article key={s.id} className="flex flex-col gap-6">
                  <h3 className="text-lg leading-7 font-normal tracking-display text-ink break-after-avoid">{s.title}</h3>
                  {s.draft?.blocks.map((b, i) => (
                    <Block key={i} block={b} footnotes={s.draft!.footnotes} interactive={false} />
                  ))}
                  {s.draft && <Footnotes footnotes={s.draft.footnotes} interactive={false} />}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
