"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EpochMs, LocalDate, Zone } from "@/lib/domain";
import { blockTitle } from "@/lib/plan";
import { href } from "@/lib/routes";
import { addDays, fmtDay, parseDay, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AgendaDay } from "./Agenda";
import { ItemPopover, type Subject } from "./ItemPopover";
import { blockName, deadlineTitle, eventName, lookSuffix, MONTH_SHORT, testChipTitle, WEEKDAY_SHORT, type DayItems } from "./model";
import { tid } from "./testids";

/** One month chip: deadlines and tests outlined, study blocks filled, notes as plain text (calendar.md 3). */
type Chip = { id: string; kind: "due" | "study" | "note"; label: string; name: string; state?: string; subject?: Subject };

function chipsOf(d: DayItems, zone: Zone): Chip[] {
  const long = fmtDay(d.day, zone, "long");
  const dated: Chip[] = [
    ...d.due.flatMap((e): Chip[] => (e.kind === "deadline" ? [{ id: e.id, kind: "due", label: deadlineTitle(e, zone), name: `${deadlineTitle(e, zone)}, ${long}`, subject: { kind: "deadline", event: e } }] : [])),
    ...d.timed.flatMap((t): Chip[] =>
      t.kind === "event" && t.event.kind === "test" ? [{ id: t.id, kind: "due", label: testChipTitle(t.event, zone), name: eventName(t.event, zone, false), subject: { kind: "event", event: t.event, live: false } }] : [],
    ),
  ];
  const study = d.timed.flatMap((t): Chip[] =>
    t.kind === "block"
      ? [{ id: t.id, kind: "study", label: blockTitle(t.block, "calendar") + lookSuffix(t.look), name: blockName(t.block, t.status, zone), state: t.look === "plain" ? undefined : t.look, subject: { kind: "block", block: t.block, status: t.status, look: t.look } }]
      : [],
  );
  const notes = d.due.flatMap((e): Chip[] => (e.kind === "note" ? [{ id: e.id, kind: "note", label: e.text, name: e.text }] : []));
  return [...dated, ...study, ...notes];
}

/** Up to three items show; above three, two and `+N more` (calendar.md flag 12). */
export const visibleCount = (n: number) => (n <= 3 ? n : 2);

function dateLabel(day: LocalDate, first: LocalDate): string {
  const { m, d } = parseDay(day);
  return d === 1 || day === first ? `${MONTH_SHORT[m - 1]} ${d}` : String(d);
}

export function MonthGrid({ days, dayList, month, zone, now, today, narrow }: { days: readonly DayItems[] | null; dayList: readonly LocalDate[]; month: number; zone: Zone; now: EpochMs; today: LocalDate; narrow: boolean }) {
  const inGrid = dayList.includes(today);
  const firstOfMonth = dayList.find((d) => parseDay(d).m === month && parseDay(d).d === 1)!;
  const [active, setActive] = useState<LocalDate | null>(null);
  const focus = active && dayList.includes(active) ? active : inGrid ? today : firstOfMonth;
  const weeks = Array.from({ length: dayList.length / 7 }, (_, i) => dayList.slice(i * 7, i * 7 + 7));
  const byDay = new Map(days?.map((d) => [d.day, d]));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-date-link]");
    if (!el) return;
    const day = el.dataset.dateLink as LocalDate;
    const move: Record<string, LocalDate> = {
      ArrowRight: addDays(day, 1),
      ArrowLeft: addDays(day, -1),
      ArrowDown: addDays(day, 7),
      ArrowUp: addDays(day, -7),
      Home: addDays(day, 1 - weekdayOf(day)),
      End: addDays(day, 7 - weekdayOf(day)),
    };
    const next = move[e.key];
    if (!next || !dayList.includes(next)) return;
    e.preventDefault();
    setActive(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-date-link="${next}"]`)?.focus();
  }

  return (
    <div className={cn("flex min-h-0 flex-col", narrow ? "gap-4 overflow-y-auto" : "flex-1")}>
      <div
        role="grid"
        aria-label={fmtDay(firstOfMonth, zone, "month")}
        aria-busy={days ? undefined : true}
        data-testid={tid.monthGrid}
        onKeyDown={onKeyDown}
        className={cn("flex flex-col border-t border-ink", !narrow && "min-h-0 flex-1")}
      >
        <div role="row" className="flex h-10 shrink-0 items-center border-b border-rule">
          {WEEKDAY_SHORT.map((w, i) => (
            <div
              key={w}
              role="columnheader"
              className={cn("min-w-0 flex-1 basis-0 text-sm leading-4 tracking-caps uppercase", narrow ? "text-center" : "pl-2.5", inGrid && weekdayOf(today) === i + 1 ? "text-ink" : "text-graphite")}
            >
              {narrow ? w.charAt(0) : w}
              {narrow && <span className="sr-only">{w.slice(1)}</span>}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className={cn("flex border-b border-rule", narrow ? "h-[52px] shrink-0" : "min-h-0 flex-1 basis-0")}>
            {week.map((day, i) => {
              const items = byDay.get(day);
              const chips = items ? chipsOf(items, zone) : [];
              const outside = parseDay(day).m !== month;
              const isToday = day === today;
              const tabbable = day === focus;
              const label = dateLabel(day, dayList[0]);
              const linkProps = {
                "data-date-link": day,
                tabIndex: tabbable ? 0 : -1,
                onFocus: () => setActive(day),
                "aria-current": isToday ? ("date" as const) : undefined,
                "aria-label": `${fmtDay(day, zone, "long")}${chips.length ? `, ${chips.length} item${chips.length === 1 ? "" : "s"}` : ""}`,
              };
              const number = isToday ? <span className="rounded-xs bg-ink px-1.5 text-page">{label}</span> : <span className={outside ? "text-guide" : "text-ink"}>{label}</span>;
              return (
                <div key={day} role="gridcell" data-date={day} className={cn("flex min-w-0 flex-1 basis-0 flex-col overflow-hidden", i > 0 && "border-l border-rule", narrow ? "items-center gap-1 pt-1.5" : "gap-[3px] px-1 py-1.5")}>
                  {narrow ? (
                    <button
                      type="button"
                      {...linkProps}
                      aria-pressed={day === focus}
                      onClick={() => setActive(day)}
                      className={cn("rounded-xs px-1.5 text-sm leading-4", day === focus && !isToday && "bg-control", outside && !isToday && "text-guide")}
                    >
                      {isToday ? <span className="-mx-1.5 block rounded-xs bg-ink px-1.5 text-page">{parseDay(day).d}</span> : parseDay(day).d}
                    </button>
                  ) : (
                    <div className={cn("flex text-sm leading-4", isToday ? "px-0.5 pb-0.5" : "px-1.5 pb-0.5")}>
                      <Link href={href.calendar({ view: "day", date: day })} {...linkProps} className="rounded-xs focus-visible:outline-offset-1">
                        {number}
                      </Link>
                    </div>
                  )}
                  {narrow ? <Marks chips={chips} /> : <Chips chips={chips} day={day} zone={zone} now={now} tabbable={tabbable} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {narrow && byDay.get(focus) && <AgendaDay items={byDay.get(focus)!} zone={zone} now={now} today={today} />}
    </div>
  );
}

function Marks({ chips }: { chips: readonly Chip[] }) {
  const marks = chips.filter((c) => c.kind !== "note").slice(0, 3);
  if (marks.length === 0) return null;
  return (
    <span aria-hidden className="flex gap-[3px]">
      {marks.map((c) => (
        <span key={c.id} className={cn("size-1.5 rounded-full", c.kind === "study" ? "bg-graphite" : "border border-ink")} />
      ))}
    </span>
  );
}

const CHIP = "block w-full min-w-0 shrink-0 truncate rounded-xs text-left text-xs leading-4 font-medium text-ink transition-colors duration-[120ms] ease-standard cursor-pointer focus-visible:outline-offset-1";

function Chips({ chips, day, zone, now, tabbable }: { chips: readonly Chip[]; day: LocalDate; zone: Zone; now: EpochMs; tabbable: boolean }) {
  const shown = chips.slice(0, visibleCount(chips.length));
  const hidden = chips.length - shown.length;
  return (
    <>
      {shown.map((c) => (
        <ChipItem key={c.id} chip={c} zone={zone} now={now} tabbable={tabbable} />
      ))}
      {hidden > 0 && (
        <Popover>
          <PopoverTrigger tabIndex={tabbable ? 0 : -1} className="block shrink-0 cursor-pointer rounded-xs px-1.5 text-left text-xs leading-4 text-graphite hover:text-ink focus-visible:outline-offset-1">
            +{hidden} more
          </PopoverTrigger>
          <PopoverContent side="right" align="start" sideOffset={8} className="w-[280px] gap-2 rounded-lg p-4 text-sm leading-5">
            <p className="leading-4 font-medium text-ink">{fmtDay(day, zone, "long")}</p>
            <ul className="flex flex-col gap-[3px]">
              {chips.map((c) => (
                <li key={c.id}>
                  <ChipItem chip={c} zone={zone} now={now} tabbable />
                </li>
              ))}
            </ul>
            <Link href={href.calendar({ view: "day", date: day })} className="self-start text-ink underline underline-offset-4">
              View day
            </Link>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

function ChipItem({ chip, zone, now, tabbable }: { chip: Chip; zone: Zone; now: EpochMs; tabbable: boolean }) {
  if (chip.kind === "note" || !chip.subject) return <p className="shrink-0 truncate px-1.5 text-xs leading-4 text-graphite">{chip.label}</p>;
  return (
    <ItemPopover
      subject={chip.subject}
      zone={zone}
      now={now}
      trigger={{
        "aria-label": chip.name,
        "data-state": chip.state,
        "data-kind": chip.kind,
        tabIndex: tabbable ? 0 : -1,
        className: cn(
          CHIP,
          chip.kind === "due"
            ? "border border-border bg-page px-1.5 py-px hover:bg-wash data-[popup-open]:border-ink"
            : chip.state === "missed"
              ? "border border-dashed border-border bg-page px-1.5 py-px text-graphite hover:bg-wash"
              : chip.state === "done"
                ? "bg-wash px-[7px] py-0.5 text-graphite hover:bg-control data-[popup-open]:shadow-[inset_0_0_0_1px_var(--color-ink)]"
                : "bg-fill px-[7px] py-0.5 hover:bg-control data-[popup-open]:shadow-[inset_0_0_0_1px_var(--color-ink)]",
        ),
        children: chip.label,
      }}
    />
  );
}
