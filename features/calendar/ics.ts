import ICAL from "ical.js";
import { deadlineEvent, ids, type CalendarEvent, type CourseId, type EpochMs, type ImportId, type LocalDate, type TimeZone, type WallTime, type Zone } from "@/lib/domain";
import { addDays, zoneOf } from "@/lib/time";
import {
  classify,
  deadlineEffort,
  deadlineLabel,
  deadlineShort,
  detectCourse,
  ImportError,
  lectureTopic,
  proposeCourse,
  testShort,
  testWeight,
  type ImportProposal,
} from "./proposal";

const MIN = 60_000;
const MAX_OCCURRENCES = 730;
const MAX_SPAN_MS = 400 * 24 * 60 * MIN;

/** One expanded instance of a VEVENT, with its instant resolved. */
interface Occurrence {
  uid: string;
  recurrenceId?: string;
  summary: string;
  location?: string;
  description?: string;
  start: EpochMs;
  end: EpochMs;
  allDay: boolean;
  firstDay: LocalDate;
  seriesId?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validZone(tzid: string | undefined): tzid is string {
  if (!tzid) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}

/**
 * ical.js only resolves a TZID when the file ships its VTIMEZONE, so wall time plus the IANA id is converted here.
 * Floating times and unknown ids (Windows zone names) are read in the student's zone.
 */
function instant(t: ICAL.Time, tzid: string | undefined, fallback: Zone): EpochMs {
  if (t.zone?.tzid === "UTC") return (t.toUnixTime() * 1000) as EpochMs;
  const zone = validZone(tzid) ? zoneOf(tzid as TimeZone) : fallback;
  return zone.at(`${t.year}-${pad(t.month)}-${pad(t.day)}` as LocalDate, `${pad(t.hour)}:${pad(t.minute)}` as WallTime);
}

const dayOf = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}` as LocalDate;

function tzidOf(event: ICAL.Event, prop: "dtstart" | "dtend"): string | undefined {
  const p = event.component.getFirstProperty(prop) ?? event.component.getFirstProperty("dtstart");
  const tzid = p?.getParameter("tzid");
  return typeof tzid === "string" ? tzid : undefined;
}

function text(event: ICAL.Event, prop: string): string | undefined {
  const v = event.component.getFirstPropertyValue(prop);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function occurrence(item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, zone: Zone, base: Pick<Occurrence, "uid" | "recurrenceId" | "seriesId">): Occurrence {
  const startAt = instant(start, tzidOf(item, "dtstart"), zone);
  const endAt = instant(end, tzidOf(item, "dtend"), zone);
  return {
    ...base,
    summary: item.summary?.trim() || "Untitled event",
    ...(text(item, "location") ? { location: text(item, "location") } : {}),
    ...(text(item, "description") ? { description: text(item, "description") } : {}),
    start: startAt,
    end: (endAt < startAt ? startAt : endAt) as EpochMs,
    allDay: start.isDate,
    firstDay: dayOf(start),
  };
}

function expand(root: ICAL.Component, zone: Zone): Occurrence[] {
  const out: Occurrence[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    const uid = event.uid || `${event.summary}|${event.startDate?.toString()}`;
    if (!event.startDate) continue;
    if (event.isRecurrenceException()) {
      // An exception whose master is in the file is reached through the master's iterator.
      const hasMaster = root.getAllSubcomponents("vevent").some((v) => v !== vevent && v.getFirstPropertyValue("uid") === event.uid && !v.hasProperty("recurrence-id"));
      if (hasMaster) continue;
      out.push(occurrence(event, event.startDate, event.endDate, zone, { uid, recurrenceId: event.recurrenceId.toString() }));
      continue;
    }
    if (!event.isRecurring()) {
      out.push(occurrence(event, event.startDate, event.endDate, zone, { uid }));
      continue;
    }
    const iterator = event.iterator();
    const first = instant(event.startDate, tzidOf(event, "dtstart"), zone);
    for (let next = iterator.next(), n = 0; next && n < MAX_OCCURRENCES; next = iterator.next(), n++) {
      const details = event.getOccurrenceDetails(next);
      const o = occurrence(details.item, details.startDate, details.endDate, zone, { uid, recurrenceId: details.recurrenceId.toString(), seriesId: `ics:${uid}` });
      if (o.start - first > MAX_SPAN_MS) break;
      out.push(o);
    }
  }
  return out;
}

function eventId(o: Occurrence, suffix = ""): CalendarEvent["id"] {
  return ids.eventFromIcs(o.uid, o.recurrenceId === undefined && !suffix ? undefined : `${o.recurrenceId ?? ""}${suffix}`);
}

/** All-day items become one note per local day. */
function notes(o: Occurrence, textValue: string, importId: ImportId, zone: Zone): CalendarEvent[] {
  const days: LocalDate[] = [];
  const last = zone.dayOf((o.end - 1) as EpochMs);
  for (let d = o.firstDay; days.length === 0 || d <= last; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > 31) break;
  }
  return days.map((day, i) => ({
    id: eventId(o, i === 0 ? "" : `@${day}`),
    kind: "note" as const,
    text: textValue,
    start: zone.startOfDay(day),
    end: zone.startOfDay(addDays(day, 1)),
    importId,
    ...(o.seriesId ? { seriesId: o.seriesId } : {}),
  }));
}

function courseEvents(o: Occurrence, course: CourseId, rest: string, importId: ImportId, zone: Zone): CalendarEvent[] {
  const base = { id: eventId(o), importId, courseId: course, ...(o.seriesId ? { seriesId: o.seriesId } : {}) };
  const where = o.location ? { location: o.location } : {};
  const kind = classify(rest || o.summary, o.allDay || o.end - o.start < MIN);
  if (kind === "deadline") {
    const label = deadlineLabel(rest);
    const due = o.allDay ? zone.at(o.firstDay, "23:59" as WallTime) : o.end;
    return [deadlineEvent({ ...base, start: due, label, short: deadlineShort(label), effort: deadlineEffort(label) })];
  }
  if (o.allDay) return notes(o, o.summary, importId, zone);
  if (kind === "test") {
    const label = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "Test";
    const weight = testWeight(label);
    return [{ ...base, kind: "test", start: o.start, end: o.end, label, short: testShort(label, weight), weight, ...where }];
  }
  if (kind === "lab") {
    const title = /\btut(?:orial)?\b|\bTUT\d/i.test(o.summary) ? "Tutorial" : /\bpractical\b|\bPRA\d/i.test(o.summary) ? "Practical" : /\bseminar\b/i.test(o.summary) ? "Seminar" : "Lab";
    return [{ ...base, kind: "lab", start: o.start, end: o.end, title, ...where }];
  }
  const { number, topic } = lectureTopic(rest);
  return [{ ...base, kind: "lecture", start: o.start, end: o.end, ...where, ...(number ? { number } : {}), ...(topic ? { topic } : {}) }];
}

const mostCommon = (values: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/**
 * An .ics file as an import proposal. Recurrence (RRULE, EXDATE, moved instances) is expanded by ical.js.
 * Ids come from UID plus recurrence id, so importing the same file twice lands on the same rows.
 */
export function parseIcs(source: string, opts: { zone: Zone; importId: ImportId; fileName: string }): ImportProposal {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(source));
  } catch {
    throw new ImportError("unreadable");
  }
  const occurrences = expand(root, opts.zone);
  if (occurrences.length === 0) throw new ImportError("empty");

  const byCourse = new Map<CourseId, { events: CalendarEvent[]; titles: string[]; instructors: string[] }>();
  const other: CalendarEvent[] = [];
  for (const o of occurrences) {
    const course = detectCourse(o.summary);
    if (!course) {
      if (o.allDay) other.push(...notes(o, o.summary, opts.importId, opts.zone));
      else other.push({ id: eventId(o), kind: "busy", title: o.summary, start: o.start, end: o.end, importId: opts.importId, ...(o.location ? { location: o.location } : {}), ...(o.seriesId ? { seriesId: o.seriesId } : {}) });
      continue;
    }
    const entry = byCourse.get(course.id) ?? { events: [], titles: [], instructors: [] };
    const events = courseEvents(o, course.id, course.rest, opts.importId, opts.zone);
    entry.events.push(...events);
    if (events[0]?.kind === "lecture" && course.rest && !lectureTopic(course.rest).number) entry.titles.push(course.rest);
    const instructor = /instructor:\s*([^\n]+)/i.exec(o.description ?? "")?.[1]?.trim();
    if (instructor) entry.instructors.push(instructor);
    byCourse.set(course.id, entry);
  }

  const courses = [...byCourse.entries()]
    .map(([id, entry]) => {
      const lectures = entry.events.filter((e) => e.kind === "lecture").sort((a, b) => a.start - b.start);
      const numbered = lectures.some((e) => e.kind === "lecture" && e.number !== undefined);
      const events = numbered ? entry.events : entry.events.map((e) => (e.kind === "lecture" ? { ...e, number: lectures.indexOf(e) + 1 } : e));
      return proposeCourse(id, events, opts.zone, { title: mostCommon(entry.titles), instructor: mostCommon(entry.instructors) });
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  other.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  return { importId: opts.importId, source: { kind: "ics", fileName: opts.fileName }, courses, other };
}
