"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blockTitle } from "@/lib/plan";
import { href } from "@/lib/routes";
import { fmtDay, fmtRange, minutesOfDay, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { EpochMs, LocalDate, Zone } from "@/lib/domain";
import { ItemPopover } from "./ItemPopover";
import { layoutLanes } from "./lanes";
import { blockLines, blockName, boxOf, DEFAULT_SCROLL, deadlineTitle, eventMeta, eventName, eventTitle, HOUR_PX, lookSuffix, WEEKDAY_SHORT, type DayItems, type TimedItem } from "./model";
import { tid } from "./testids";

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);
/** Below this the week scrolls sideways under a sticky gutter instead of squeezing seven columns (calendar.md 5, responsive). */
const MIN_COLUMN = 120;
const hourLabel = (h: number) => (h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);

export interface GridProps {
  mode: "week" | "day";
  days: readonly DayItems[] | null;
  dayList: readonly LocalDate[];
  zone: Zone;
  now: EpochMs;
  today: LocalDate;
  narrow: boolean;
  /** Lecture event ids that are being recorded right now. */
  recording: ReadonlySet<string>;
  /** Changes when the view should return to its default scroll position. */
  scrollKey: string;
  empty?: ReactNode;
}

/** The week and day grids: 50px per hour, a 52px gutter, opening at 8am (or at now when now is out of view). */
export function TimeGrid({ mode, days, dayList, zone, now, today, narrow, recording, scrollKey, empty }: GridProps) {
  const gutter = narrow ? 44 : 52;
  const hoursRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const dueRef = useRef<HTMLDivElement>(null);
  const day = mode === "day";
  const minWidth = day ? undefined : gutter + 7 * MIN_COLUMN;

  useLayoutEffect(() => {
    const el = hoursRef.current;
    if (!el) return;
    const nowTop = (minutesOfDay(now, zone) * HOUR_PX) / 60;
    const showsToday = dayList.includes(today);
    const visible = nowTop >= DEFAULT_SCROLL && nowTop <= DEFAULT_SCROLL + el.clientHeight - 20;
    el.scrollTop = showsToday && now > 0 && !visible ? Math.max(0, nowTop - 120) : DEFAULT_SCROLL;
    const column = (el.scrollWidth - gutter) / dayList.length;
    el.scrollLeft = showsToday && el.scrollWidth > el.clientWidth ? dayList.indexOf(today) * column : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new period or Today resets the scroll, not each minute
  }, [scrollKey]);

  const nav = useMemo(() => (days ?? []).map((d) => [...d.due.filter((e) => e.kind === "deadline").map((e) => e.id), ...d.timed.map((t) => t.id)]), [days]);
  const [active, setActive] = useState<string | null>(null);
  const flat = nav.flat();
  const fallback = days?.flatMap((d) => d.timed).find((t) => t.kind === "block" && t.look === "now")?.id ?? flat[0] ?? null;
  const current = active && flat.includes(active) ? active : fallback;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-nav]");
    if (!el || !days) return;
    const [col, idx] = el.dataset.nav!.split(":").map(Number);
    let target: [number, number] | null = null;
    if (e.key === "ArrowDown" && idx + 1 < nav[col].length) target = [col, idx + 1];
    else if (e.key === "ArrowUp" && idx > 0) target = [col, idx - 1];
    else if (e.key === "Home") target = [col, 0];
    else if (e.key === "End") target = [col, nav[col].length - 1];
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const step = e.key === "ArrowRight" ? 1 : -1;
      const start = itemStart(days[col], nav[col][idx], zone);
      for (let c = col + step; c >= 0 && c < nav.length; c += step) {
        if (nav[c].length === 0) continue;
        const nearest = nav[c].map((id, i) => [Math.abs(itemStart(days[c], id, zone) - start), i] as const).sort((a, b) => a[0] - b[0])[0][1];
        target = [c, nearest];
        break;
      }
    }
    if (!target) return;
    e.preventDefault();
    e.currentTarget.querySelector<HTMLElement>(`[data-nav="${target[0]}:${target[1]}"]`)?.focus();
  }

  const longDay = (d: LocalDate) => fmtDay(d, zone, "long");
  const dueRow = days?.some((d) => d.due.length > 0);

  return (
    <div
      role="table"
      aria-label={day ? longDay(dayList[0]) : `Week of ${longDay(dayList[0])}`}
      aria-busy={days ? undefined : true}
      data-testid={day ? tid.dayGrid : tid.weekGrid}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id;
        if (id) setActive(id);
      }}
    >
      <div ref={headRef} className="shrink-0 overflow-hidden">
        <div role="row" className="flex h-10 items-center border-b border-rule" style={{ minWidth }}>
          <div aria-hidden className="sticky left-0 z-10 shrink-0 self-stretch bg-page" style={{ width: gutter }} />
          {dayList.map((d) => (
            <DayHeader key={d} day={d} today={today} link={!day} label={longDay(d)} />
          ))}
        </div>
      </div>
      <div ref={dueRef} className="shrink-0 overflow-hidden">
        <div role="row" className="flex min-h-9 items-center border-b border-rule" style={{ minWidth }}>
          <div aria-hidden className="sticky left-0 z-10 shrink-0 self-stretch bg-page" style={{ width: gutter }} />
          {dayList.map((d, col) => {
            const items = days?.[col];
            return (
              <div key={d} role="cell" aria-label={`Due ${longDay(d)}`} className={cn("flex min-w-0 flex-1 basis-0 gap-1 pr-1 pl-[5px]", day ? "flex-row flex-wrap" : "flex-col", dueRow && "py-[5px]")}>
                {items?.due.map((e, i) =>
                  e.kind === "note" ? (
                    <p key={e.id} className="truncate px-[7px] py-1 text-sm leading-4 text-graphite">
                      {e.text}
                    </p>
                  ) : (
                    <ItemPopover
                      key={e.id}
                      subject={{ kind: "deadline", event: e }}
                      zone={zone}
                      now={now}
                      trigger={{
                        "aria-label": `${deadlineTitle(e, zone)}, ${longDay(d)}`,
                        "data-nav": `${col}:${i}`,
                        "data-kind": "deadline",
                        "data-id": e.id,
                        tabIndex: e.id === current ? 0 : -1,
                        className: cn(
                          "flex h-6 min-w-0 cursor-pointer items-center rounded-xs border border-border bg-page px-[7px] text-left text-sm leading-4 font-medium text-ink transition-colors duration-[120ms] ease-standard hover:bg-wash focus-visible:outline-offset-1 data-[popup-open]:border-ink",
                          day ? "max-w-full shrink-0" : "w-full",
                        ),
                        children: (
                          <span className="truncate">
                            {deadlineTitle(e, zone)}
                          </span>
                        ),
                      }}
                    />
                  ),
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        ref={hoursRef}
        onScroll={(e) => {
          const x = e.currentTarget.scrollLeft;
          if (headRef.current) headRef.current.scrollLeft = x;
          if (dueRef.current) dueRef.current.scrollLeft = x;
        }}
        role="rowgroup"
        aria-label="Hours"
        tabIndex={0}
        data-testid={tid.hours}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-width:none] focus-visible:outline-offset-[-2px] [&::-webkit-scrollbar]:hidden"
      >
        <div role="row" className="relative flex h-[1200px]" style={{ minWidth }}>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[1200px]">
            {HOURS.map((h) => (
              <div key={h} className="absolute right-0 h-px bg-rule" style={{ top: h * HOUR_PX, left: gutter }} />
            ))}
          </div>
          <div aria-hidden className="sticky left-0 z-10 h-[1200px] shrink-0 bg-page" style={{ width: gutter }}>
            {HOURS.map((h) => (
              <span key={h} className="absolute left-0 text-sm leading-4 whitespace-nowrap text-graphite" style={{ top: h * HOUR_PX - 8 }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {dayList.map((d, col) => (
            <div key={d} role="cell" className="relative h-[1200px] min-w-0 flex-1 basis-0 border-l border-rule">
              {days?.[col] && <DayColumn items={days[col]} col={col} dueCount={days[col].due.filter((e) => e.kind === "deadline").length} zone={zone} now={now} day={day} current={current} recording={recording} label={longDay(d)} />}
            </div>
          ))}
          {empty}
        </div>
      </div>
    </div>
  );
}

/** Where an item sits in its column, in minutes from the top; deadlines sit above the hours. */
function itemStart(d: DayItems, id: string, zone: Zone): number {
  const timed = d.timed.find((t) => t.id === id);
  return timed ? minutesOfDay(timed.start, zone) : -60;
}

function DayHeader({ day, today, link, label }: { day: LocalDate; today: LocalDate; link: boolean; label: string }) {
  const isToday = day === today;
  const content = (
    <>
      <span className={cn("text-sm leading-4 tracking-caps uppercase", isToday ? "text-ink" : "text-graphite")}>{WEEKDAY_SHORT[weekdayOf(day) - 1]}</span>
      {isToday ? (
        <span className="rounded-xs bg-ink px-1.5 text-sm leading-4 text-page">{Number(day.slice(8))}</span>
      ) : (
        <span className={cn("text-sm leading-4", day < today ? "text-graphite" : "text-ink")}>{Number(day.slice(8))}</span>
      )}
    </>
  );
  return (
    <div role="columnheader" aria-label={label} aria-current={isToday ? "date" : undefined} className="flex min-w-0 flex-1 basis-0 items-baseline justify-center">
      {link ? (
        <Link href={href.calendar({ view: "day", date: day })} aria-label={`${label}, open day view`} className="flex items-baseline gap-1.5 rounded-xs focus-visible:outline-offset-4">
          {content}
        </Link>
      ) : (
        <span className="flex items-baseline gap-1.5">
          {content}
        </span>
      )}
    </div>
  );
}

function DayColumn(props: { items: DayItems; col: number; dueCount: number; zone: Zone; now: EpochMs; day: boolean; current: string | null; recording: ReadonlySet<string>; label: string }) {
  const { items, col, dueCount, zone, day } = props;
  const { visible, overflow } = layoutLanes(items.timed, day ? 4 : 3);
  const navIndex = new Map(items.timed.map((t, i) => [t.id, dueCount + i]));
  const placed = visible.map((v) => {
    const lines = v.item.kind === "block" ? blockLines(v.item) : 2;
    return { ...v, lines, box: boxOf(v.item, items.day, zone, lines) };
  });
  return (
    <ul aria-label={props.label} className="absolute inset-0">
      {placed.map(({ item, lane, lanes, lines, box: drawn }) => {
        const next = placed.filter((p) => p.lane === lane && p.item.start >= item.end).reduce((top, p) => Math.min(top, p.box.top), Infinity);
        const box = { top: drawn.top, height: Math.max(drawn.minHeight, Math.min(drawn.height, next - drawn.top - 2)) };
        return (
          <li key={item.id} className="absolute" style={{ top: box.top, height: box.height, ...laneStyle(lane, lanes) }}>
            <Item item={item} lines={lines} {...props} nav={`${col}:${navIndex.get(item.id)}`} />
          </li>
        );
      })}
      {overflow.map((o) => {
        const top = (minutesOfDay(o.start as EpochMs, zone) * HOUR_PX) / 60;
        return (
          <li key={`more-${o.start}`} className="absolute h-7" style={{ top, ...laneStyle(o.lane, o.lanes) }}>
            <Popover>
              <PopoverTrigger className="h-full w-full cursor-pointer rounded-xs border border-border bg-page px-2 text-left text-sm leading-4 font-medium text-ink hover:bg-wash focus-visible:outline-offset-1">
                +{o.items.length}
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={8} className="w-[280px] gap-1 rounded-lg p-4 text-sm leading-5">
                <p className="leading-4 font-medium text-ink">{o.items.length} more at this time</p>
                <ul className="flex flex-col">
                  {o.items.map((t) => (
                    <li key={t.id} className="text-graphite">
                      <span className="text-ink">{t.kind === "block" ? blockTitle(t.block, "calendar") : eventTitle(t.event)}</span> · {fmtRange(t, zone)}
                    </li>
                  ))}
                </ul>
                <Link href={href.calendar({ view: "day", date: items.day })} className="mt-2 text-ink underline underline-offset-4">
                  View day
                </Link>
              </PopoverContent>
            </Popover>
          </li>
        );
      })}
    </ul>
  );
}

function laneStyle(lane: number, lanes: number) {
  const gaps = 8 + (lanes - 1) * 2;
  return { left: `calc(4px + ${lane} * ((100% - ${gaps}px) / ${lanes} + 2px))`, width: `calc((100% - ${gaps}px) / ${lanes})` };
}

const BASE = "flex h-full w-full cursor-pointer flex-col items-start overflow-hidden rounded-xs text-left text-sm leading-4 text-ink transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-[160ms]";
const LINE = "block w-full truncate";

function Item({ item, lines, zone, now, day, current, recording, nav }: { item: TimedItem; lines: 1 | 2; zone: Zone; now: EpochMs; day: boolean; current: string | null; recording: ReadonlySet<string>; nav: string }) {
  const common = { tabIndex: item.id === current ? 0 : -1, "data-nav": nav, "data-id": item.id };
  if (item.kind === "event") {
    const e = item.event;
    const live = now >= e.start && now < e.end;
    const rec = recording.has(e.id);
    const meta = eventMeta(e, zone, live && !rec) + (rec ? " · recording" : "");
    return (
      <ItemPopover
        subject={{ kind: "event", event: e, live }}
        zone={zone}
        now={now}
        trigger={{
          ...common,
          "aria-label": eventName(e, zone, live) + (rec ? ", recording" : ""),
          "data-kind": e.kind,
          className: cn(BASE, "border border-border bg-page pr-2 pl-[7px] hover:bg-wash data-[popup-open]:border-ink", day ? "justify-center" : "py-[3px]"),
          children: (
            <>
              <span className={cn(LINE, "flex items-center gap-1.5 font-medium")}>
                {rec && <span aria-hidden className="size-2 shrink-0 rounded-full bg-ink motion-safe:animate-breathe" />}
                <span className="truncate">{eventTitle(e)}</span>
              </span>
              <span className={LINE}>{meta}</span>
            </>
          ),
        }}
      />
    );
  }
  const { block, look, status } = item;
  const title = blockTitle(block, "calendar");
  const suffix = lookSuffix(look);
  return (
    <ItemPopover
      subject={{ kind: "block", block, status, look }}
      zone={zone}
      now={now}
      trigger={{
        ...common,
        "aria-label": blockName(block, status, zone),
        "data-state": look === "plain" ? undefined : look,
        "data-kind": "block",
        className: cn(
          BASE,
          "px-2",
          lines === 1 ? (day ? "justify-center" : "py-1") : day ? "justify-center" : "py-1",
          look === "missed"
            ? "border border-dashed border-border bg-page hover:bg-wash data-[popup-open]:border-ink"
            : look === "done"
              ? "bg-wash hover:bg-control data-[popup-open]:shadow-[inset_0_0_0_1px_var(--color-ink)]"
              : "bg-fill hover:bg-control data-[popup-open]:shadow-[inset_0_0_0_1px_var(--color-ink)]",
        ),
        children: (
          <>
            <span className={cn(LINE, "flex items-center gap-1 font-medium", (look === "done" || look === "missed") && "text-graphite")}>
              {look === "done" && <Check aria-hidden className="size-3 shrink-0" strokeWidth={2} />}
              <span className="truncate">
                {title}
                {lines === 1 ? suffix : ""}
              </span>
            </span>
            {lines === 2 && (
              <span className={cn(LINE, look === "done" && "text-graphite")}>
                {fmtRange(block, zone)}
                {suffix}
              </span>
            )}
            {lines === 2 && block.note && <span className={cn(LINE, "pt-1 text-graphite")}>{block.note}</span>}
          </>
        ),
      }}
    />
  );
}
