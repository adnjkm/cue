"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode, type Ref } from "react";
import type { ChatHandle } from "@/lib/chat";
import type { LocalDate, RelatedLink, Segment } from "@/lib/domain";
import { href } from "@/lib/routes";
import { useOpenSource } from "@/lib/sources";
import { currentZone, fmtStamp, zoneOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SectionLabel, TranscriptLine } from "@/components/cue";
import { Item } from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { flagLabel } from "./hints";
import { tid } from "./testids";

export type StatusKind = "recording" | "ring" | "saved";

/** `● Recording`, `○ Paused`, `✓ Saved`: shape and word, never color alone. The one role=status on the screen. */
export function StatusPill({ kind, label, className }: { kind: StatusKind; label: string; className?: string }) {
  return (
    <div role="status" className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {kind === "saved" ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-ink">
          <path d="M2.5 6.25 4.9 8.6 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", kind === "recording" ? "bg-ink" : "border-[1.5px] border-ink")} />
      )}
      <span className="text-sm leading-4 font-medium text-ink">{label}</span>
    </div>
  );
}

/** Paper's 16px chevron (`M6 3l5 5-5 5`, stroke 1.5), drawn as is: lucide's at 16px is smaller and thinner. */
export function Chevron({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={cn("shrink-0", className)}>
      <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The 32-high toolbar of both views: title left; status, time and actions right. At 375 it wraps to two rows. */
export function Toolbar({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-x-6 gap-y-2 md:h-8 max-md:flex-col max-md:items-stretch">
      <div className="flex min-w-0 items-center gap-2">
        <h1 title={title} className="min-w-0 truncate text-lg leading-6 font-normal tracking-display text-ink">
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-3 max-md:min-h-8">{children}</div>
    </header>
  );
}

/**
 * The shared Composer as Paper draws it here, until lectures-3 and lectures-5 land in it: the send button stays
 * ink while the box is empty (an empty send is already a no-op), and keyboard focus rings the whole box.
 */
export function composerClass(chat: ChatHandle): string {
  return cn(
    "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ink has-[textarea:focus-visible]:outline-solid",
    chat.error?.kind !== "budget" && "[&_button:disabled]:opacity-100",
  );
}

/** Wide: the 920/400 columns. Below 1024: one column with `Transcript` and `Related N` tabs. */
export function Columns({ main, mainLabel, related, relatedCount, relatedFresh }: { main: ReactNode; mainLabel: string; related: ReactNode; relatedCount: number; relatedFresh?: boolean }) {
  const wide = useMediaQuery("(min-width: 1024px)", true);
  if (wide) {
    return (
      <div className="flex min-h-0 flex-1 gap-10 max-xl:gap-8">
        {main}
        <section aria-labelledby="related-label" className="flex min-h-0 w-[400px] shrink-0 flex-col gap-3 max-xl:w-80">
          <div className="flex h-7 shrink-0 items-center justify-between">
            <SectionLabel id="related-label">Related coursework</SectionLabel>
          </div>
          {related}
        </section>
      </div>
    );
  }
  return (
    <Tabs defaultValue="main" className="min-h-0 flex-1 gap-3">
      <TabsList className="h-auto gap-1 bg-transparent p-0">
        {[
          { value: "main", label: mainLabel },
          { value: "related", label: `Related ${relatedCount}` },
        ].map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="h-7 flex-none rounded-sm border-0 px-3 py-1.5 text-sm leading-4 font-normal text-graphite hover:text-ink data-active:bg-control data-active:font-medium data-active:text-ink"
          >
            {t.label}
            {t.value === "related" && relatedFresh && <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="main" className="flex min-h-0 flex-1 flex-col">
        {main}
      </TabsContent>
      <TabsContent value="related" className="flex min-h-0 flex-col">
        <h2 className="sr-only">Related coursework</h2>
        {related}
      </TabsContent>
    </Tabs>
  );
}

function linkHref(target: RelatedLink["target"]): string | null {
  switch (target.kind) {
    case "assessment":
      return href.calendar({ view: "day", date: zoneOf(currentZone()).dayOf(target.at) as LocalDate });
    case "question":
      return href.practiceSet(target.setId, { q: target.questionId });
    case "section":
      return href.guide(target.courseId, target.sectionId);
    case "page":
    case "transcript":
      return null;
  }
}

function RelatedCard({ link, emphasized, arriving }: { link: RelatedLink; emphasized: boolean; arriving: boolean }) {
  const open = useOpenSource();
  const url = linkHref(link.target);
  const body = (
    <>
      <time className={cn("w-11 shrink-0 text-sm leading-5 tabular-nums", emphasized ? "font-medium text-ink" : "text-graphite")}>{fmtStamp(link.atMs)}</time>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 font-medium text-ink">{link.title}</span>
        <span className="text-sm leading-4 text-graphite">{link.meta}</span>
      </span>
      <Chevron className="text-graphite transition-transform duration-[120ms] ease-standard group-hover/card:translate-x-0.5" />
    </>
  );
  const className = cn(
    // Item's outline-none hides the global ring, and an emphasized card's border is already ink, so focus needs the ring back.
    "group/card flex-nowrap gap-4 px-4 py-3 text-left transition-[background-color,transform] duration-100 ease-standard hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink focus-visible:outline-solid active:scale-[0.98] [a]:hover:bg-wash",
    emphasized ? "border-ink" : "border-border",
    arriving && "animate-in fade-in-0 slide-in-from-top-1 duration-200",
  );
  return url ? (
    <Item variant="outline" data-state={emphasized ? "emphasized" : "default"} className={className} render={<Link href={url} />}>
      {body}
    </Item>
  ) : (
    <Item variant="outline" data-state={emphasized ? "emphasized" : "default"} className={cn(className, "cursor-pointer")} render={<button type="button" onClick={() => open(link.target)} />}>
      {body}
    </Item>
  );
}

/** Related coursework. Live: newest first and emphasized, new cards drop in. Saved: no emphasis. */
export function RelatedList({ links, style, scrollRef }: { links: readonly RelatedLink[]; style: "live" | "saved"; scrollRef?: Ref<HTMLUListElement> }) {
  const [seen] = useState(() => new Set(links.map((l) => l.id)));
  if (links.length === 0) {
    return <p className="text-sm leading-5 text-graphite">Links to tests, problem sets and readings appear here when the lecture mentions them.</p>;
  }
  return (
    <ul ref={scrollRef} data-testid={tid.related} className="-m-1 flex min-h-0 flex-col gap-2 overflow-y-auto p-1">
      {links.map((link, i) => (
        <li key={link.id}>
          <RelatedCard link={link} emphasized={style === "live" && i === 0} arriving={!seen.has(link.id)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A transcript line with its Flag action. The action is the row's keyboard stop (roving: one tab stop for
 * the list, arrows move between rows), and it sits over the text lane so the lane keeps Paper's 828 px.
 * Without hover (touch), the hidden action ignores taps until a tap on the row focuses it: see `revealFlag`.
 */
export function TranscriptRow({
  segment,
  labelStyle,
  onToggleFlag,
  focusable,
  onRowKey,
  buttonRef,
  className,
}: {
  segment: Segment;
  labelStyle: "live" | "saved";
  onToggleFlag?: (s: Segment) => void;
  focusable?: boolean;
  onRowKey?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  className?: string;
}) {
  const flagged = !!segment.flag;
  const at = fmtStamp(segment.atMs);
  return (
    <TranscriptLine
      atMs={segment.atMs}
      text={segment.text ?? segment.raw}
      state={flagged ? "flagged" : "final"}
      flagLabel={segment.flag ? flagLabel(segment.flag, labelStyle) : undefined}
      className={cn("relative scroll-my-3 transition-colors duration-[120ms] ease-standard max-md:gap-3 max-md:px-3", !flagged && onToggleFlag && "hover:bg-wash focus-within:bg-wash", className)}
      actions={
        onToggleFlag && (
          <button
            ref={buttonRef}
            type="button"
            tabIndex={focusable ? 0 : -1}
            aria-keyshortcuts="f"
            aria-label={`${flagged ? "Unflag" : "Flag"} the line at ${at}`}
            onClick={() => onToggleFlag(segment)}
            onKeyDown={onRowKey}
            className={cn(
              "absolute right-4 flex h-8 cursor-pointer items-center rounded-xs text-sm leading-5 font-medium text-ink opacity-0 transition-opacity duration-[120ms] group-hover/line:opacity-100 focus-visible:opacity-100 max-md:right-3",
              "[@media(hover:none)]:pointer-events-none [@media(hover:none)]:focus:pointer-events-auto [@media(hover:none)]:focus:opacity-100",
              flagged ? "top-1.5" : "top-0",
            )}
          >
            <span className={cn("pl-3", flagged ? "bg-fill" : "bg-wash")}>{flagged ? "Unflag" : "Flag"}</span>
          </button>
        )
      }
    />
  );
}

/** On a device without hover, a tap on a transcript row focuses its Flag action, which shows it. */
export function revealFlag(e: React.MouseEvent<HTMLElement>, buttons: ReadonlyMap<number, HTMLButtonElement>): number | null {
  if (!window.matchMedia("(hover: none)").matches) return null;
  const line = (e.target as HTMLElement).closest("li");
  for (const [seq, button] of buttons) {
    if (button.closest("li") !== line) continue;
    button.focus({ preventScroll: true });
    return seq;
  }
  return null;
}

/** A line in the transcript's lanes that is not a transcript line: `Paused at 38:12`, `Listening…`. */
export function NoteLine({ lane, children, tone = "graphite" }: { lane?: ReactNode; children: ReactNode; tone?: "graphite" | "ink" }) {
  return (
    <li className="flex gap-4 px-4 py-1.5 max-md:gap-3 max-md:px-3">
      <span className="w-11 shrink-0 text-sm leading-5 font-medium text-ink">{lane}</span>
      <p className={cn("min-w-0 flex-1 text-sm leading-5", tone === "ink" ? "text-ink" : "text-graphite")}>{children}</p>
    </li>
  );
}

/** The filled row the design uses for a problem or a choice in the transcript lane: ink line, graphite line, action. */
export function NoticeRow({ title, detail, action }: { title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex flex-col items-start gap-3 rounded-sm bg-fill px-4 py-3 max-md:px-3">
      <div className="flex flex-col">
        <p className="text-sm leading-5 text-ink">{title}</p>
        {detail && <p className="text-sm leading-5 text-graphite">{detail}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </li>
  );
}

/** Keeps a scroll box pinned to its end while the reader is within 48 px of it. */
export function useStickToEnd<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [stuck, setStuck] = useState(true);
  const onScroll = () => {
    const el = ref.current;
    if (el) setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };
  const toEnd = (behavior: ScrollBehavior = "auto") => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };
  /** Stops following the end, for a jump to an earlier moment. */
  const hold = () => setStuck(false);
  return { ref, stuck, onScroll, toEnd, hold };
}
