import { deadlineEvent, ids, type CalendarEvent, type CourseId, type EpochMs, type ImportId, type LocalDate, type MaterialId, type WallTime, type Zone } from "@/lib/domain";
import { addDays, parseDay, wallMinutes, weekdayOf } from "@/lib/time";
import { deadlineEffort, deadlineShort, detectCourse, ImportError, proposeCourse, testShort, testWeight, type ImportProposal } from "./proposal";
import { WEEKDAY_CODES, type TimetableRead } from "./schema";

const MIN = 60_000;
const TEST_MINUTES = 110;

export interface Term {
  start: LocalDate;
  end: LocalDate;
}

/**
 * The weeks a timetable repeats over: from the Monday of this week to the end of the current term
 * (fall to 11 Dec, winter to 10 Apr, summer to 14 Aug). Nothing is planned before this week.
 */
export function termAround(today: LocalDate): Term {
  const { y, m } = parseDay(today);
  const end = m >= 9 ? `${y}-12-11` : m <= 4 ? `${y}-04-10` : `${y}-08-14`;
  return { start: addDays(today, 1 - weekdayOf(today)), end: end as LocalDate };
}

const minutes = (hhmm: string) => wallMinutes(hhmm as WallTime);

function courseIdOf(code: string): CourseId | null {
  return detectCourse(code.toUpperCase())?.id ?? null;
}

/** What calendar.read saw, checked and repeated weekly over the term. Ids come from course, kind and slot, so a re-read lands on the same rows. */
export function expandTimetable(read: TimetableRead, opts: { zone: Zone; importId: ImportId; materialId: MaterialId; term: Term }): ImportProposal {
  const { zone, importId, term } = opts;
  const byCourse = new Map<CourseId, { events: CalendarEvent[]; title?: string; instructor?: string }>();
  const entry = (id: CourseId) => {
    const e = byCourse.get(id) ?? { events: [] };
    byCourse.set(id, e);
    return e;
  };

  for (const course of read.courses) {
    const id = courseIdOf(course.code);
    if (!id) continue;
    const e = entry(id);
    if (course.title && !e.title) e.title = course.title.trim();
    if (course.instructor && !e.instructor) e.instructor = course.instructor.trim();
    const seen = new Set<string>();
    for (const m of course.meetings) {
      const key = `${m.kind}|${m.day}|${m.start}|${m.end}`;
      if (seen.has(key) || minutes(m.end) <= minutes(m.start)) continue;
      seen.add(key);
      const weekday = WEEKDAY_CODES.indexOf(m.day) + 1;
      const first = addDays(term.start, (weekday - weekdayOf(term.start) + 7) % 7);
      for (let day = first; day <= term.end; day = addDays(day, 7)) {
        const start = zone.at(day, m.start as WallTime);
        const base = {
          id: ids.eventFromSlot(id, m.kind, start),
          start,
          end: zone.at(day, m.end as WallTime),
          importId,
          courseId: id,
          seriesId: `tt:${id}:${key}`,
          ...(m.room?.trim() ? { location: m.room.trim() } : {}),
        };
        e.events.push(m.kind === "lecture" ? { ...base, kind: "lecture" } : { ...base, kind: "lab", title: "Lab" });
      }
    }
  }

  for (const d of read.dated) {
    const id = courseIdOf(d.code);
    const { y, m, d: dd } = parseDay(d.date as LocalDate);
    if (!id || !(m >= 1 && m <= 12 && dd >= 1 && dd <= 31 && y > 2000)) continue;
    const label = d.label.trim();
    if (d.kind === "deadline") {
      const start = zone.at(d.date as LocalDate, (d.time ?? "23:59") as WallTime);
      entry(id).events.push(deadlineEvent({ id: ids.eventFromSlot(id, "deadline", start), start, importId, courseId: id, label, short: deadlineShort(label), effort: deadlineEffort(label) }));
    } else {
      const start = zone.at(d.date as LocalDate, (d.time ?? "09:00") as WallTime);
      const weight = testWeight(label);
      entry(id).events.push({ id: ids.eventFromSlot(id, "test", start), kind: "test", start, end: (start + TEST_MINUTES * MIN) as EpochMs, importId, courseId: id, label, short: testShort(label, weight), weight });
    }
  }

  const courses = [...byCourse.entries()]
    .filter(([, e]) => e.events.length > 0)
    .map(([id, e]) => proposeCourse(id, e.events, zone, { title: e.title, instructor: e.instructor }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (courses.length === 0) throw new ImportError("noClasses");
  return { importId, source: { kind: "vision", materialId: opts.materialId }, courses, other: [] };
}
