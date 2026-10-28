import type { CourseId, EpochMs, EventId, ImportId, MaterialId } from "./ids";

/** Who asserted that a course exists. A course with no source left (and no content) is removed. */
export type CourseSource = ImportId | "manual";

export interface Course {
  id: CourseId;
  code: string;
  /** "CSC", used in "Mid-week · CSC". */
  short: string;
  title?: string;
  instructor?: string;
  sources: readonly CourseSource[];
}

/** { full: "Recursion & tree traversal", short: "Recursion" }: full for headings, short for calendar blocks. */
export interface Topic {
  full: string;
  short: string;
}

export type TestWeight = "quiz" | "test" | "midterm" | "exam";
export type EffortSize = "small" | "medium" | "large";

interface EventBase {
  id: EventId;
  start: EpochMs;
  end: EpochMs;
  importId: ImportId;
  /** Shared by instances expanded from one RRULE or one weekly timetable slot. */
  seriesId?: string;
}

/** A union by kind, so a deadline cannot have a duration and a note cannot have a room. Written by Calendar. */
export type CalendarEvent =
  | (EventBase & { kind: "lecture"; courseId: CourseId; number?: number; topic?: Topic; location?: string })
  | (EventBase & { kind: "lab"; courseId: CourseId; title: string; location?: string })
  /** label "Term Test 2", short "Test 2" (calendar: "Test 2 prep · 1 of 4"). */
  | (EventBase & { kind: "test"; courseId: CourseId; label: string; short: string; weight: TestWeight; location?: string })
  /** Invariant: end === start === due. Built only by `deadlineEvent()`. label "Problem Set 4", short "PS4". */
  | (EventBase & { kind: "deadline"; courseId: CourseId; label: string; short: string; effort: EffortSize })
  /** Any non-course timed event from a personal calendar. Busy time for the scheduler. */
  | (EventBase & { kind: "busy"; title: string; location?: string })
  /** All-day text: start is the local day start, end the next day start. "Thanksgiving · no class". */
  | (EventBase & { kind: "note"; text: string });

export type TimedEvent = Extract<CalendarEvent, { kind: "lecture" | "lab" | "test" | "busy" }>;
export type CourseEvent = Extract<CalendarEvent, { courseId: CourseId }>;

export function deadlineEvent(fields: Omit<Extract<CalendarEvent, { kind: "deadline" }>, "kind" | "end">): Extract<CalendarEvent, { kind: "deadline" }> {
  return { ...fields, kind: "deadline", end: fields.start };
}

export function isTimed(e: CalendarEvent): e is TimedEvent {
  return e.kind === "lecture" || e.kind === "lab" || e.kind === "test" || e.kind === "busy";
}

export interface ImportBatch {
  id: ImportId;
  at: EpochMs;
  /**
   * The scheduler never places a rule block before this instant for anchors from this import.
   * ICS, vision and manual imports: the import time. The sample: Monday 00:00 after the Paper week.
   */
  planFrom: EpochMs;
  source: { kind: "ics"; fileName: string } | { kind: "vision"; materialId: MaterialId } | { kind: "manual" } | { kind: "sample" };
  courses: readonly CourseId[];
}
