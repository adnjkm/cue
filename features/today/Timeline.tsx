"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CourseChip, SectionLabel } from "@/components/cue";
import { Button } from "@/components/ui/button";
import type { StudySession } from "@/lib/domain";
import { fmtCountdown, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { leftMs, type TodayRow, type Trailing } from "./rows";
import { tid } from "./testids";

/** "31:48 left", ticking each second without re-rendering the rest of the page. */
export function SessionLeft({ session }: { session: StudySession }) {
  const now = useNow("second");
  if (now === 0) return null;
  return <span className="tabular-nums">{fmtCountdown(Math.max(0, leftMs(session, now)))} left</span>;
}

/** `statusId` marks the text that describes the row's link; it never wraps the Reschedule button, so no engine reads the button into the link. */
function TrailingView({
  trailing,
  statusId,
  rowLinkId,
  onReschedule,
}: {
  trailing: Trailing;
  statusId: string;
  rowLinkId: string;
  onReschedule: (t: Extract<Trailing, { kind: "missed" }>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const buttonId = useId();
  switch (trailing.kind) {
    case "text":
      return <span id={statusId}>{trailing.text}</span>;
    case "dot":
      return (
        <span id={statusId} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-graphite" />
          {trailing.text}
        </span>
      );
    case "recording":
      return (
        <span id={statusId} className="inline-flex items-center gap-1.5 leading-4 font-medium text-ink">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ink" />
          Recording
        </span>
      );
    case "inProgress":
      return (
        <span id={statusId}>
          In progress · <SessionLeft session={trailing.session} />
        </span>
      );
    case "missed":
      return (
        <span>
          <span id={statusId}>Missed</span> ·{" "}
          {/* Its own word, then the row link's name, so two missed rows read differently in a list of controls. */}
          <Button
            id={buttonId}
            aria-labelledby={`${buttonId} ${rowLinkId}`}
            variant="link"
            disabled={busy}
            focusableWhenDisabled
            onClick={async () => {
              setBusy(true);
              try {
                await onReschedule(trailing);
              } finally {
                setBusy(false);
              }
            }}
            className="pointer-events-auto relative h-auto rounded-xs border-0 p-0 align-baseline leading-[18px] after:absolute after:-inset-x-1 after:-inset-y-[13px] focus-visible:outline-offset-1"
          >
            Reschedule
          </Button>
        </span>
      );
  }
}

function Row({ row, linkRef, onReschedule }: { row: TodayRow; linkRef: (el: HTMLAnchorElement | null) => void; onReschedule: (t: Extract<Trailing, { kind: "missed" }>) => Promise<void> }) {
  const statusId = useId();
  const linkId = useId();
  return (
    <li
      data-state={row.state}
      aria-current={row.current ? "time" : undefined}
      className="relative grid grid-cols-[64px_1fr_auto] items-center gap-y-1 border-b border-rule py-3 transition-colors duration-[120ms] ease-standard hover:bg-wash md:flex md:py-3.5"
    >
      <Link
        ref={linkRef}
        id={linkId}
        href={row.href}
        aria-describedby={statusId}
        className="col-span-3 col-start-1 row-span-2 row-start-1 grid grid-cols-subgrid grid-rows-subgrid items-center focus-visible:outline-none after:absolute after:inset-y-0 after:-inset-x-2 after:rounded-sm focus-visible:after:outline-2 focus-visible:after:outline-ink md:flex md:min-w-0 md:flex-1"
      >
        <time
          dateTime={new Date(row.start).toISOString()}
          className={cn("col-start-1 row-start-1 shrink-0 text-sm leading-[18px] tabular-nums md:w-24", row.current ? "font-medium text-ink" : "text-graphite")}
        >
          {row.time}
        </time>
        <span className="col-start-2 row-start-1 flex shrink-0 md:w-[84px]">{row.course && <CourseChip code={row.course} />}</span>
        <span className={cn("col-span-2 col-start-2 row-start-2 min-w-0 text-base leading-5 text-ink md:flex-1", row.current && "font-medium")}>{row.title}</span>
      </Link>
      <div
        className="pointer-events-none relative col-start-3 row-start-1 flex items-center justify-end justify-self-end pl-3 text-right text-sm leading-[18px] text-graphite md:w-[180px] md:shrink-0 md:pl-0"
      >
        <TrailingView trailing={row.trailing} statusId={statusId} rowLinkId={linkId} onReschedule={onReschedule} />
      </div>
    </li>
  );
}

/** The day list under the card: one row per lecture or study block, each a single link into its feature. */
export function Timeline({
  rows,
  summary,
  linkRef,
  onReschedule,
}: {
  rows: readonly TodayRow[];
  summary: string;
  linkRef: (key: string, el: HTMLAnchorElement | null) => void;
  onReschedule: (t: Extract<Trailing, { kind: "missed" }>) => Promise<void>;
}) {
  const labelId = useId();
  return (
    <div data-testid={tid.timeline} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
        <SectionLabel id={labelId} className="leading-[18px]">
          Today
        </SectionLabel>
        <p className="text-sm leading-[18px] text-graphite">{summary}</p>
      </div>
      {rows.length ? (
        <ol role="list" aria-labelledby={labelId}>
          {rows.map((row) => (
            <Row key={row.key} row={row} linkRef={(el) => linkRef(row.key, el)} onReschedule={onReschedule} />
          ))}
        </ol>
      ) : (
        <p className="border-b border-rule py-3.5 text-sm leading-[18px] text-graphite">No lectures or study blocks today</p>
      )}
    </div>
  );
}
