"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { db, useLive } from "@/lib/db";
import type { ViewerTab } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Prose, TranscriptLine } from "@/components/cue";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { availableTabs, flagLabel, stepSlide, tabLabel, viewerLabel, type PageRef, type TranscriptRef, type ViewerState } from "./model";

const LABEL = "text-sm leading-4 tracking-caps text-graphite uppercase";
const CARD = "flex flex-col gap-4 rounded-sm border border-border bg-page p-8 max-md:p-5";

function usePage(ref: PageRef | undefined) {
  return useLive(async () => (ref ? { page: (await db.pages.get([ref.materialId, ref.page])) ?? null } : { page: null }), [ref?.materialId, ref?.page]);
}

function CardSkeleton() {
  return (
    <div aria-hidden="true" className={CARD}>
      <span className="h-6 w-1/2 animate-breathe rounded-xs bg-fill" />
      <span className="h-5 w-4/5 animate-breathe rounded-xs bg-fill [animation-delay:90ms]" />
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <div className={cn(CARD, "text-sm leading-5 text-graphite")}>{children}</div>;
}

function SlideCard({ at, onMove }: { at: PageRef; onMove: (delta: number) => void }) {
  const found = usePage(at);
  const slide = found?.page?.slide;
  return (
    <section
      aria-label="Slide viewer"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onMove(e.key === "ArrowRight" ? 1 : -1);
      }}
      className={cn(CARD, "focus-visible:outline-offset-[-1px]")}
    >
      {found === undefined ? (
        <>
          <span aria-hidden="true" className="h-6 w-1/2 animate-breathe rounded-xs bg-fill" />
          <span aria-hidden="true" className="h-5 w-4/5 animate-breathe rounded-xs bg-fill [animation-delay:90ms]" />
        </>
      ) : !found.page ? (
        <p className="text-sm leading-5 text-graphite">
          Slide {at.page} isn&apos;t stored on this device any more. Add the deck again to see it here.
        </p>
      ) : slide ? (
        <>
          <h2 className="text-lg leading-6 font-medium tracking-display text-ink">{slide.heading}</h2>
          {slide.body && <Prose text={slide.body} className="gap-2 text-sm leading-5 text-ink" />}
          {slide.code && (
            <pre className="max-w-full overflow-x-auto rounded-xs bg-fill px-5 py-4 font-mono text-[13px] leading-[22px] tracking-normal text-ink [tab-size:4]">
              <code>{slide.code.text}</code>
            </pre>
          )}
        </>
      ) : (
        <Prose text={found.page.text} className="gap-2 text-sm leading-5 text-ink" />
      )}
    </section>
  );
}

function TranscriptPanel({ at, scrollRef }: { at: TranscriptRef; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const segments = useLive(() => db.segments.where("lectureId").equals(at.lectureId).sortBy("seq"), [at.lectureId]);
  const listRef = useRef<HTMLOListElement>(null);
  const target = segments ? segments.reduce((best, s, i) => (s.atMs <= at.atMs ? i : best), 0) : -1;
  useEffect(() => {
    const box = scrollRef.current;
    const line = listRef.current?.children[target] as HTMLElement | undefined;
    if (!box || !line) return;
    if (box.scrollHeight > box.clientHeight) box.scrollTop = Math.max(0, line.offsetTop - box.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2);
    else line.scrollIntoView({ block: "center" });
  }, [target, scrollRef]);
  if (!segments) return <CardSkeleton />;
  if (segments.length === 0) return <Missing>This lecture has no transcript on this device yet.</Missing>;
  return (
    <ol ref={listRef} aria-label={at.lectureNumber === undefined ? "Lecture transcript" : `Lecture ${at.lectureNumber} transcript`} className="flex flex-col">
      {segments.map((s, i) => (
        <TranscriptLine
          key={s.seq}
          atMs={s.atMs}
          text={s.text ?? s.raw}
          state={s.flag || i === target ? "flagged" : "final"}
          flagLabel={s.flag ? (s.flag.by === "model" ? flagLabel(s.flag.assessment?.label) : "Flagged by you") : undefined}
          className={cn(i === target && "bg-control")}
        />
      ))}
    </ol>
  );
}

/** A page's first short paragraph is its title in the sample and in most PDFs; it reads as the card heading. */
function splitTitle(text: string): { title?: string; body: string } {
  const [first, ...rest] = text.trim().split(/\n{2,}/);
  if (rest.length === 0 || first.length > 80 || first.includes("\n")) return { body: text };
  return { title: first.replace(/\.$/, ""), body: rest.join("\n\n") };
}

function PagePanel({ at }: { at: PageRef }) {
  const found = usePage(at);
  if (found === undefined) return <CardSkeleton />;
  if (!found.page) return <Missing>This page isn&apos;t stored on this device any more. Add the file again to read it here.</Missing>;
  const { title, body } = splitTitle(found.page.text);
  return (
    <article className={CARD}>
      {title && <h2 className="text-lg leading-6 font-normal tracking-display text-ink">{title}</h2>}
      <Prose text={body} className="gap-3 text-sm leading-5 text-ink" />
    </article>
  );
}

/** The viewer scrolls on its own, so the transcript moment and the step's action under it stay in view. */
export function MaterialViewer({
  viewer,
  slideCount,
  onChange,
  empty,
  children,
}: {
  viewer: ViewerState | null;
  slideCount: number | undefined;
  onChange: (v: ViewerState) => void;
  empty: ReactNode;
  children?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabs = viewer ? availableTabs(viewer) : [];
  const count = slideCount ?? 0;
  const move = (delta: number) => viewer && onChange(stepSlide(viewer, delta, count));
  const nav = (dir: "Previous" | "Next") => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${dir} slide`}
            disabled={!viewer?.slides || (dir === "Previous" ? viewer.slides.page <= 1 : viewer.slides.page >= count)}
            onClick={() => move(dir === "Previous" ? -1 : 1)}
            className="text-graphite hover:text-ink"
          />
        }
      >
        {dir === "Previous" ? <ChevronLeft size={12} strokeWidth={3} aria-hidden="true" /> : <ChevronRight size={12} strokeWidth={3} aria-hidden="true" />}
      </TooltipTrigger>
      <TooltipContent>{dir} slide</TooltipContent>
    </Tooltip>
  );

  return (
    <Tabs
      value={viewer?.tab ?? "slides"}
      onValueChange={(tab: ViewerTab) => viewer && onChange({ ...viewer, tab })}
      className="flex min-w-0 flex-1 flex-col gap-6 lg:min-h-0"
    >
      <div className="flex min-h-7 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <p aria-live="polite" className={LABEL}>
            {viewer && tabs.length > 0 ? viewerLabel(viewer, slideCount) : "Material"}
          </p>
          {viewer?.tab === "slides" && viewer.slides && (
            <span className="flex items-center">
              {nav("Previous")}
              {nav("Next")}
            </span>
          )}
        </div>
        {tabs.length > 0 && viewer && (
          <TabsList aria-label="Material" className="h-auto max-w-full gap-1 overflow-x-auto rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto">
            {tabs.map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="h-7 flex-none rounded-sm border-0 px-3 py-1.5 text-sm leading-4 font-normal text-graphite hover:bg-wash hover:text-ink focus-visible:border-0 focus-visible:outline-2 data-active:bg-control data-active:font-medium data-active:text-ink"
              >
                {tabLabel(t, viewer)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
      </div>
      <div ref={scrollRef} className="flex flex-col lg:min-h-0 lg:flex-[0_1_auto] lg:overflow-y-auto">
        {!viewer ? (
          <CardSkeleton />
        ) : tabs.length === 0 ? (
          empty
        ) : (
          <>
            {viewer.slides && (
              <TabsContent value="slides" tabIndex={-1} className="flex-none">
                <SlideCard at={viewer.slides} onMove={move} />
              </TabsContent>
            )}
            {viewer.transcript && (
              <TabsContent value="transcript" className="flex-none">
                <TranscriptPanel at={viewer.transcript} scrollRef={scrollRef} />
              </TabsContent>
            )}
            {viewer.textbook && (
              <TabsContent value="textbook" className="flex-none">
                <PagePanel at={viewer.textbook} />
              </TabsContent>
            )}
            {viewer.handout && (
              <TabsContent value="handout" className="flex-none">
                <PagePanel at={viewer.handout} />
              </TabsContent>
            )}
          </>
        )}
      </div>
      {children}
    </Tabs>
  );
}
