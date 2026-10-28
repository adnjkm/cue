"use client";

import type { EpochMs, LocalDate, Zone } from "@/lib/domain";
import { blockTitle } from "@/lib/plan";
import { fmtDay, fmtRange, fmtTime, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ItemPopover } from "./ItemPopover";
import { blockName, deadlineTitle, eventMeta, eventName, eventTitle, lookSuffix, WEEKDAY_SHORT, type DayItems } from "./model";
import { tid } from "./testids";

const ROW = "flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-xs border border-transparent px-2 py-2 text-left text-sm leading-4 text-ink transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-1";

/** The week below 768px: one section per day instead of seven 40px columns (calendar.md 5, responsive). */
export function WeekAgenda({ days, zone, now, today }: { days: readonly DayItems[] | null; zone: Zone; now: EpochMs; today: LocalDate }) {
  return (
    <div data-testid={tid.agenda} aria-busy={days ? undefined : true} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-6">
      {days?.map((d) => (
        <AgendaDay key={d.day} items={d} zone={zone} now={now} today={today} />
      ))}
    </div>
  );
}

export function AgendaDay({ items, zone, now, today }: { items: DayItems; zone: Zone; now: EpochMs; today: LocalDate }) {
  const { day } = items;
  const isToday = day === today;
  const deadlines = items.due.filter((e) => e.kind === "deadline");
  const notes = items.due.filter((e) => e.kind === "note");
  const empty = items.timed.length === 0 && items.due.length === 0;
  return (
    <section aria-label={fmtDay(day, zone, "long")} className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-1.5 border-b border-rule pb-2 text-sm leading-4 font-normal">
        <span className={cn("tracking-caps uppercase", isToday ? "text-ink" : "text-graphite")}>{WEEKDAY_SHORT[weekdayOf(day) - 1]}</span>
        <span className={isToday ? "rounded-xs bg-ink px-1.5 text-page" : "text-ink"}>{Number(day.slice(8))}</span>
      </h2>
      {empty && <p className="text-sm leading-5 text-graphite">Nothing planned</p>}
      {notes.map((n) => (
        <p key={n.id} className="text-sm leading-5 text-graphite">
          {n.text}
        </p>
      ))}
      {deadlines.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {deadlines.map((e) => (
            <li key={e.id} className="min-w-0 max-w-full">
              <ItemPopover
                subject={{ kind: "deadline", event: e }}
                zone={zone}
                now={now}
                trigger={{
                  "aria-label": `${deadlineTitle(e, zone)}, ${fmtDay(day, zone, "long")}`,
                  className: "block h-6 max-w-full cursor-pointer truncate rounded-xs border border-border bg-page px-[7px] text-sm leading-[22px] font-medium text-ink hover:bg-wash focus-visible:outline-offset-1",
                  children: deadlineTitle(e, zone),
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {items.timed.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.timed.map((t) => (
            <li key={t.id}>
              {t.kind === "event" ? (
                <ItemPopover
                  subject={{ kind: "event", event: t.event, live: now >= t.start && now < t.end }}
                  zone={zone}
                  now={now}
                  trigger={{
                    "aria-label": eventName(t.event, zone, now >= t.start && now < t.end),
                    "data-kind": t.event.kind,
                    className: cn(ROW, "border-border bg-page hover:bg-wash data-[popup-open]:border-ink"),
                    children: (
                      <>
                        <span className="w-16 shrink-0 text-graphite">{fmtTime(t.start, zone)}</span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">{eventTitle(t.event)}</span>
                          <span className="truncate">{eventMeta(t.event, zone, now >= t.start && now < t.end)}</span>
                        </span>
                      </>
                    ),
                  }}
                />
              ) : (
                <ItemPopover
                  subject={{ kind: "block", block: t.block, status: t.status, look: t.look }}
                  zone={zone}
                  now={now}
                  trigger={{
                    "aria-label": blockName(t.block, t.status, zone),
                    "data-state": t.look === "plain" ? undefined : t.look,
                    "data-kind": "block",
                    className: cn(
                      ROW,
                      t.look === "missed" ? "border-dashed border-border bg-page hover:bg-wash" : t.look === "done" ? "bg-wash text-graphite hover:bg-control" : "bg-fill hover:bg-control",
                      "data-[popup-open]:shadow-[inset_0_0_0_1px_var(--color-ink)]",
                    ),
                    children: (
                      <>
                        <span className="w-16 shrink-0 text-graphite">{fmtTime(t.start, zone)}</span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">{blockTitle(t.block, "calendar")}</span>
                          <span className="truncate">
                            {fmtRange(t, zone)}
                            {lookSuffix(t.look)}
                          </span>
                          {t.block.note && <span className="truncate text-graphite">{t.block.note}</span>}
                        </span>
                      </>
                    ),
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

