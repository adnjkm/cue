import type { Course, CalendarEvent, ImportBatch, TestWeight, EffortSize, Topic, TimedEvent } from "./calendar";
import type { BlockAnchor, BlockId, CourseId, EpochMs, EventId, LectureId, LocalDate, MaterialId, IsoWeek, SetId, TimeZone, WallTime } from "./ids";
import type { SourceRef } from "./sources";
import type { StudySession } from "./study";
import type { Interval, Zone } from "./time";

/** Derived, never stored. courseId comes from the anchor (null only for endOfWeek and course-less custom blocks). */
export interface StudyBlock extends Interval {
  id: BlockId;
  anchor: BlockAnchor;
  courseId: CourseId | null;
  topic: Topic;
  /** "Past paper, timed". */
  note?: string;
  why: {
    /** Whole local days between the anchor event and this placement: "Review 1 day after lecture". */
    offsetDays: number;
    /** A test within prefs.boostWindowDays lengthened or added this block (Today's subline). */
    boostedBy?: { test: EventId; daysUntil: number };
    /** Local day of the anchor event (lecture, test or deadline), so "Due Thu" needs no lookup. */
    anchorDay?: LocalDate;
  };
  placement: "rule" | "pinned" | "authored" | "locked";
}

/** A block whose placement and display were written by hand: the sample's Paper weeks, or a user's custom block. */
export interface AuthoredBlock {
  /** An authored block whose anchor matches a rule demand replaces that demand. */
  anchor: BlockAnchor;
  at: Interval;
  topic: Topic;
  note?: string;
}

export type Placement =
  /** Reschedule or move; also written by Mark done on a rule block, so a done block keeps its time. */
  | { kind: "pinned"; at: Interval }
  /** Reschedule rewrites `block.at`, keeping the authored text. */
  | { kind: "authored"; block: AuthoredBlock };

/**
 * The only stored plan state, one row per block id, written only by planActions (and the sample seed).
 * A row is never empty, and done always has a placement.
 */
export type PlanOverride =
  | { blockId: BlockId; placement: Placement; status?: "done" | "skipped"; updatedAt: EpochMs }
  | { blockId: BlockId; placement?: undefined; status: "skipped"; updatedAt: EpochMs };

export interface PlanPrefs {
  dayStart: WallTime;
  dayEnd: WallTime;
  bufferMin: number;
  stepMin: number;
  maxStudyMinPerDay: number;
  review: { baseMin: number; boostedMin: number };
  /** A test this close boosts the course's reviews and adds review n 2. */
  boostWindowDays: number;
  midweekMin: number;
  endOfWeekMin: number;
  prep: Record<TestWeight, { sessions: number; spanDays: number }>;
  prepMin: { each: number; last: number };
  effortMin: Record<EffortSize, number>;
  workBlockMaxMin: number;
  /** Lectures start this many minutes past the hour; the note taker's length is the slot minus this. */
  lectureStartsPastMin: number;
}

export const DEFAULT_PLAN_PREFS: PlanPrefs = {
  dayStart: "08:00" as WallTime,
  dayEnd: "22:00" as WallTime,
  bufferMin: 15,
  stepMin: 15,
  maxStudyMinPerDay: 240,
  review: { baseMin: 30, boostedMin: 45 },
  boostWindowDays: 21,
  midweekMin: 30,
  endOfWeekMin: 90,
  prep: { quiz: { sessions: 0, spanDays: 0 }, test: { sessions: 4, spanDays: 12 }, midterm: { sessions: 6, spanDays: 7 }, exam: { sessions: 8, spanDays: 14 } },
  prepMin: { each: 60, last: 120 },
  effortMin: { small: 0, medium: 120, large: 240 },
  workBlockMaxMin: 120,
  lectureStartsPastMin: 10,
};

export interface PlanInput {
  zone: TimeZone;
  window: { from: LocalDate; to: LocalDate };
  courses: readonly Course[];
  events: readonly CalendarEvent[];
  imports: readonly Pick<ImportBatch, "id" | "planFrom">[];
  /** Lecture topic: the Lecture record after notes, else the event's topic, else `Lec 9`. */
  topics: ReadonlyMap<EventId, Topic>;
  overrides: readonly PlanOverride[];
  /** Every session row's snapshot. A block with a session never moves (history stays put). */
  sessions: readonly Pick<StudySession, "id" | "anchor" | "planned" | "topic" | "courseId">[];
  prefs: PlanPrefs;
}

export interface Unplaced {
  blockId: BlockId;
  anchor: BlockAnchor;
  minutes: number;
  reason: "noFreeSlot" | "dailyCap";
}

export interface OverrideConflict {
  blockId: BlockId;
  at: Interval;
  clashesWith: EventId;
}

export interface PlanOutput {
  /** Sorted by start, then id. */
  blocks: readonly StudyBlock[];
  unplaced: readonly Unplaced[];
  conflicts: readonly OverrideConflict[];
}

export type BlockStatus = "upcoming" | "now" | "inProgress" | "done" | "missed" | "skipped";

export interface BlockMaterials {
  materials: readonly { materialId: MaterialId; label: string; ref: SourceRef }[];
  transcript?: { lectureId: LectureId; label: string };
  practice: { count: number; setId?: SetId; topic: string };
}

/** One agenda row for Today's timeline and the day view: a fixed event or a study block. */
export type AgendaItem = { kind: "event"; event: TimedEvent } | { kind: "block"; block: StudyBlock };

export interface PlanView {
  zone: Zone;
  range: Interval;
  blocks: readonly StudyBlock[];
  events: readonly CalendarEvent[];
  /** Timed events and blocks in the range, by start. */
  agenda: readonly AgendaItem[];
  unplaced: readonly Unplaced[];
  conflicts: readonly OverrideConflict[];
  status(block: StudyBlock): BlockStatus;
  /** No courses and no events at all: show the first-run state. */
  isEmpty: boolean;
}

export type PlanRange = { day: EpochMs | LocalDate } | { week: IsoWeek } | { month: `${number}-${number}` } | Interval;
