import { db } from "@/lib/db";
import type { CalendarEvent, Course, EventId, ImportBatch, Lecture, PlanInput, PlanOverride, PlanPrefs, StudySession, TimeZone, Topic } from "@/lib/domain";
import { readPrefs } from "@/lib/prefs";
import { zoneOf } from "@/lib/time";
import { planWindow } from "./schedule";

export interface PlanSources {
  zone: TimeZone;
  prefs: PlanPrefs;
  courses: readonly Course[];
  events: readonly CalendarEvent[];
  imports: readonly ImportBatch[];
  overrides: readonly PlanOverride[];
  sessions: readonly StudySession[];
  lectures: readonly Pick<Lecture, "eventId" | "topic" | "notes">[];
}

export async function readPlanSources(): Promise<PlanSources> {
  const [foundation, courses, events, imports, overrides, sessions, lectures] = await Promise.all([
    readPrefs("foundation"),
    db.courses.toArray(),
    db.events.toArray(),
    db.imports.toArray(),
    db.overrides.toArray(),
    db.sessions.toArray(),
    db.lectures.toArray(),
  ]);
  return { zone: foundation.zone, prefs: foundation.plan, courses, events, imports, overrides, sessions, lectures };
}

/** Lecture topic: the Lecture record once notes exist, else the event's topic (schedule falls back to "Lec 9"). */
export function planInputFrom(src: PlanSources): PlanInput {
  const topics = new Map<EventId, Topic>();
  for (const e of src.events) if (e.kind === "lecture" && e.topic) topics.set(e.id, e.topic);
  for (const l of src.lectures) if (l.eventId && l.notes && l.topic) topics.set(l.eventId, l.topic);
  const sessions = src.sessions.map((s) => ({ id: s.id, anchor: s.anchor, planned: s.planned, topic: s.topic, courseId: s.courseId }));
  return {
    zone: src.zone,
    window: planWindow(zoneOf(src.zone), { imports: src.imports, events: src.events, overrides: src.overrides, sessions }),
    courses: src.courses,
    events: src.events,
    imports: src.imports.map((i) => ({ id: i.id, planFrom: i.planFrom })),
    topics,
    overrides: src.overrides,
    sessions,
    prefs: src.prefs,
  };
}

export async function loadPlanInput(): Promise<PlanInput> {
  return planInputFrom(await readPlanSources());
}
