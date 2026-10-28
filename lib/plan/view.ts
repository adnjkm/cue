"use client";

import { useMemo } from "react";
import { useLive } from "@/lib/db";
import { isTimed, type AgendaItem, type EpochMs, type Interval, type LocalDate, type PlanRange, type PlanView, type StudyBlock, type Zone } from "@/lib/domain";
import { addDays, mondayOfWeek, useNow, weekdayOf, zoneOf } from "@/lib/time";
import { planInputFrom, readPlanSources, type PlanSources } from "./input";
import { blockStatus, schedule } from "./schedule";

export function rangeInterval(range: PlanRange, zone: Zone): Interval {
  if ("start" in range) return range;
  if ("day" in range) {
    const day = typeof range.day === "number" ? zone.dayOf(range.day) : range.day;
    return { start: zone.startOfDay(day), end: zone.startOfDay(addDays(day, 1)) };
  }
  if ("week" in range) {
    const monday = mondayOfWeek(range.week);
    return { start: zone.startOfDay(monday), end: zone.startOfDay(addDays(monday, 7)) };
  }
  const [y, m] = range.month.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01` as LocalDate;
  const nextMonth = (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`) as LocalDate;
  const last = addDays(nextMonth, -1);
  const gridStart = addDays(first, 1 - weekdayOf(first));
  const gridEnd = addDays(last, 8 - weekdayOf(last));
  return { start: zone.startOfDay(gridStart), end: zone.startOfDay(gridEnd) };
}

/** Everything that changes where blocks go. A lecture heartbeat changes none of it, so it never re-runs schedule(). */
function fingerprint(src: PlanSources): string {
  return JSON.stringify([
    src.zone,
    src.prefs,
    src.events,
    src.imports.map((i) => [i.id, i.planFrom]),
    src.overrides,
    src.sessions.map((s) => [s.id, s.anchor, s.planned, s.topic, s.courseId]),
    src.lectures.filter((l) => l.notes && l.topic).map((l) => [l.eventId, l.topic]),
  ]);
}

/**
 * Reads every plan input with useLive and runs schedule() for the whole window, memoized on a fingerprint
 * of the inputs. Undefined until IndexedDB answers.
 */
export function usePlan(range: PlanRange): PlanView | undefined {
  const now = useNow("minute");
  const src = useLive(readPlanSources, []);
  const key = src ? fingerprint(src) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the fingerprint, not the row objects
  const plan = useMemo(() => (src ? { input: planInputFrom(src), output: schedule(planInputFrom(src)) } : undefined), [key]);
  const rangeKey = JSON.stringify(range);
  return useMemo(() => {
    if (!src || !plan) return undefined;
    const zone = zoneOf(src.zone);
    const span = rangeInterval(range, zone);
    const inRange = (iv: Interval) => iv.start < span.end && iv.end > span.start;
    const sessions = new Map(src.sessions.map((s) => [s.id, s]));
    const overrides = new Map(src.overrides.map((o) => [o.blockId, o]));
    const blocks = plan.output.blocks.filter(inRange);
    const events = src.events.filter((e) => inRange({ start: e.start, end: Math.max(e.end, e.start + 1) as EpochMs }));
    const agenda: AgendaItem[] = [
      ...events.filter(isTimed).map((event) => ({ kind: "event" as const, event })),
      ...blocks.map((block) => ({ kind: "block" as const, block })),
    ].sort((a, b) => {
      const sa = a.kind === "event" ? a.event.start : a.block.start;
      const sb = b.kind === "event" ? b.event.start : b.block.start;
      return sa - sb;
    });
    return {
      zone,
      range: span,
      blocks,
      events,
      agenda,
      unplaced: plan.output.unplaced,
      conflicts: plan.output.conflicts,
      status: (block: StudyBlock) => blockStatus(block, { now, session: sessions.get(block.id), override: overrides.get(block.id) }),
      isEmpty: src.courses.length === 0 && src.events.length === 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range is compared by value
  }, [src, plan, rangeKey, now]);
}
