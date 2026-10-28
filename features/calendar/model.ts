import {
  isTimed,
  type BlockStatus,
  type CalendarEvent,
  type EpochMs,
  type Interval,
  type LocalDate,
  type PlanOverride,
  type PlanView,
  type StudyBlock,
  type TimedEvent,
  type Zone,
} from "@/lib/domain";
import type { CalendarView } from "@/lib/routes";
import { blockTitle } from "@/lib/plan";
import { addDays, fmtDay, fmtRange, fmtTime, minutesOfDay, parseDay, weekdayOf } from "@/lib/time";

export { MONTH_SHORT, shortDay, WEEKDAY_SHORT } from "./proposal";

export const HOUR_PX = 50;
/** 8am sits 40px below the top of the hours body, as on the 900px artboards. */
export const DEFAULT_SCROLL = 8 * HOUR_PX - 40;
const MIN = 60_000;

/**
 * How a study block draws. Past blocks with a finished session draw plain, as Paper does (architecture 20.8);
 * only an explicit Mark done gets the done treatment.
 */
export type BlockLook = "plain" | "now" | "progress" | "done" | "missed";

export function blockLook(status: BlockStatus, override: PlanOverride | undefined): BlockLook | null {
  switch (status) {
    case "skipped":
      return null;
    case "done":
      return override?.status === "done" ? "done" : "plain";
    case "now":
      return "now";
    case "inProgress":
      return "progress";
    case "missed":
      return "missed";
    case "upcoming":
      return "plain";
  }
}

const LOOK_SUFFIX: Record<BlockLook, string> = { plain: "", now: " · now", progress: " · in progress", done: " · done", missed: " · missed" };

export const lookSuffix = (look: BlockLook) => LOOK_SUFFIX[look];

/** Spoken status for the accessible name: a finished past block reads "done" even though it draws plain. */
function statusWord(status: BlockStatus): string {
  return status === "done" ? ", done" : status === "now" ? ", now" : status === "inProgress" ? ", in progress" : status === "missed" ? ", missed" : "";
}

export type TimedItem =
  | { kind: "block"; id: string; start: EpochMs; end: EpochMs; fixed: false; block: StudyBlock; look: BlockLook; status: BlockStatus }
  | { kind: "event"; id: string; start: EpochMs; end: EpochMs; fixed: true; event: TimedEvent };

export type DueItem = Extract<CalendarEvent, { kind: "deadline" | "note" }>;

export interface DayItems {
  day: LocalDate;
  due: DueItem[];
  timed: TimedItem[];
}

/** Everything one view draws, bucketed by local day. Blocks a student skipped are left out. */
export function itemsByDay(plan: PlanView, days: readonly LocalDate[], overrides: ReadonlyMap<string, PlanOverride>): DayItems[] {
  const { zone } = plan;
  const map = new Map<LocalDate, DayItems>(days.map((day) => [day, { day, due: [], timed: [] }]));
  for (const e of plan.events) {
    if (e.kind === "deadline" || e.kind === "note") map.get(zone.dayOf(e.start))?.due.push(e);
    else if (isTimed(e)) for (const day of spannedDays(e, zone)) map.get(day)?.timed.push({ kind: "event", id: e.id, start: e.start, end: e.end, fixed: true, event: e });
  }
  for (const block of plan.blocks) {
    const status = plan.status(block);
    const look = blockLook(status, overrides.get(block.id));
    if (look) map.get(zone.dayOf(block.start))?.timed.push({ kind: "block", id: block.id, start: block.start, end: block.end, fixed: false, block, look, status });
  }
  for (const d of map.values()) {
    d.due.sort((a, b) => Number(a.kind === "note") - Number(b.kind === "note") || a.start - b.start || (a.id < b.id ? -1 : 1));
    d.timed.sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed) || (a.id < b.id ? -1 : 1));
  }
  return days.map((d) => map.get(d)!);
}

function spannedDays(iv: Interval, zone: Zone): LocalDate[] {
  const out: LocalDate[] = [];
  const last = zone.dayOf(Math.max(iv.start, iv.end - 1) as EpochMs);
  for (let d = zone.dayOf(iv.start); d <= last && out.length < 8; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Top and height in the 1200px hour column. Short blocks are drawn taller than their time so their text fits (calendar.md 2);
 * `minHeight` is the true-to-time height, the floor when a following block needs the space.
 */
export function boxOf(iv: Interval, day: LocalDate, zone: Zone, lines: 1 | 2): { top: number; height: number; minHeight: number } {
  const dayStart = zone.startOfDay(day);
  const start = Math.max(iv.start, dayStart);
  const startMin = zone.dayOf(start as EpochMs) === day ? minutesOfDay(start as EpochMs, zone) : 0;
  const minutes = Math.max(0, Math.min(iv.end, zone.startOfDay(addDays(day, 1))) - start) / MIN;
  const top = (startMin * HOUR_PX) / 60;
  const exact = Math.max(12, (minutes * HOUR_PX) / 60 - 4);
  const height = Math.max(lines === 2 ? 40 : 28, exact);
  return { top, height: Math.min(height, 24 * HOUR_PX - top), minHeight: exact };
}

/** A study block shows its time line from 45 minutes up; shorter blocks show the title only. */
export const blockLines = (b: Interval): 1 | 2 => (b.end - b.start >= 45 * MIN ? 2 : 1);

export function eventTitle(e: TimedEvent): string {
  switch (e.kind) {
    case "lecture":
      return `${e.courseId} Lecture`;
    case "lab":
      return `${e.courseId} ${e.title}`;
    case "test":
      return `${e.courseId} ${e.label}`;
    case "busy":
      return e.title;
  }
}

export function eventMeta(e: TimedEvent, zone: Zone, live: boolean): string {
  return [fmtRange(e, zone), e.location].filter(Boolean).join(" · ") + (live ? " · now" : "");
}

/** `CSC148 A2 due 11:59pm`. */
export const deadlineTitle = (e: Extract<CalendarEvent, { kind: "deadline" }>, zone: Zone) => `${e.courseId} ${e.short} due ${fmtTime(e.start, zone)}`;

/** Month chips: `MAT137 test 1 at 6pm`, `CSC148 midterm at 6pm`. */
export const testChipTitle = (e: Extract<CalendarEvent, { kind: "test" }>, zone: Zone) => `${e.courseId} ${e.short.toLowerCase()} at ${fmtTime(e.start, zone)}`;

/** `10:30 to 11:15am`: the range as a screen reader should say it. */
export const spokenRange = (iv: Interval, zone: Zone) => fmtRange(iv, zone).replace("–", " to ");

const longDay = (t: EpochMs, zone: Zone) => fmtDay(zone.dayOf(t), zone, "long");

/** `Review · Recursion, Tuesday 27 October, 10:30 to 11:15am, now`. */
export function blockName(b: StudyBlock, status: BlockStatus, zone: Zone): string {
  return `${blockTitle(b, "calendar")}, ${longDay(b.start, zone)}, ${spokenRange(b, zone)}${b.note ? `, ${b.note}` : ""}${statusWord(status)}`;
}

/** `MAT137 Lecture, Thursday 29 October, 9 to 10am, MP 102`. */
export function eventName(e: TimedEvent, zone: Zone, live: boolean): string {
  return `${eventTitle(e)}, ${longDay(e.start, zone)}, ${spokenRange(e, zone)}${e.location ? `, ${e.location}` : ""}${live ? ", now" : ""}`;
}

/** The days a view draws: one, the ISO week, or the month grid from the Monday on or before the 1st. */
export function viewDays(view: CalendarView, date: LocalDate): LocalDate[] {
  if (view === "day") return [date];
  if (view === "week") {
    const monday = addDays(date, 1 - weekdayOf(date));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }
  const { y, m } = parseDay(date);
  const first = `${y}-${String(m).padStart(2, "0")}-01` as LocalDate;
  const start = addDays(first, 1 - weekdayOf(first));
  const next = (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`) as LocalDate;
  const end = addDays(next, (8 - weekdayOf(next)) % 7);
  const out: LocalDate[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One period back or forward. A month step keeps the day of the month where it can. */
export function shiftDate(view: CalendarView, date: LocalDate, dir: 1 | -1): LocalDate {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  const { y, m, d } = parseDay(date);
  const index = y * 12 + (m - 1) + dir;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const days = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, days)).padStart(2, "0")}` as LocalDate;
}

/** `October 2026`, or `Oct 2026` where the toolbar is narrow. The label follows the focused date, as Paper's split week reads October. */
export function periodLabel(date: LocalDate, zone: Zone, short: boolean): string {
  const label = fmtDay(date, zone, "month");
  return short ? label.replace(/^(\w{3})\w*/, "$1") : label;
}

export function parseDateParam(s: string | null): LocalDate | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const { y, m, d } = parseDay(s as LocalDate);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? (s as LocalDate) : null;
}

export function parseViewParam(s: string | null): CalendarView | null {
  return s === "day" || s === "week" || s === "month" ? s : null;
}
