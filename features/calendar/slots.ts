import type { BlockStatus, CalendarEvent, EpochMs, Interval, PlanInput, StudyBlock, Topic } from "@/lib/domain";
import { findSlot } from "@/lib/plan";

const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;

type Deadline = Extract<CalendarEvent, { kind: "deadline" }>;

/**
 * Where Reschedule may put a block, most preferred first. A review never moves before its lecture ends, and work or
 * prep never moves past its deadline or test. An upcoming block first looks later than its own slot, then earlier.
 */
export function rescheduleWindows(block: StudyBlock, status: BlockStatus, events: readonly CalendarEvent[], now: EpochMs): Interval[] {
  const { anchor } = block;
  const find = (id: string) => events.find((e) => e.id === id);
  const lecture = anchor.kind === "review" ? find(anchor.lecture) : undefined;
  const due = anchor.kind === "work" ? find(anchor.deadline) : anchor.kind === "testPrep" ? find(anchor.test) : undefined;
  const floor = Math.max(now, lecture?.end ?? now);
  const ceiling = Math.min(floor + WEEK, due?.start ?? Infinity);
  const windows = status === "upcoming" ? [{ start: Math.max(floor, block.end), end: ceiling }, { start: floor, end: Math.min(ceiling, block.start) }] : [{ start: floor, end: ceiling }];
  return windows.filter((w) => w.end - w.start >= block.end - block.start) as Interval[];
}

/** The first free slot for the block inside those windows, with the block itself taken off the board. */
export function rescheduleSlot(input: PlanInput, block: StudyBlock, status: BlockStatus, now: EpochMs): Interval | null {
  const without: PlanInput = { ...input, overrides: [...input.overrides.filter((o) => o.blockId !== block.id), { blockId: block.id, status: "skipped", updatedAt: 0 as EpochMs }] };
  const minutes = (block.end - block.start) / MIN;
  for (const w of rescheduleWindows(block, status, input.events, now)) {
    const slot = findSlot(without, minutes, { after: w.start, before: w.end });
    if (slot) return slot;
  }
  return null;
}

/** Plan more time past the largest effort adds hour-long blocks of this topic; the deadline popover finds them by it. */
const EXTRA_WORK_MIN = 60;

export const extraWorkTopic = (deadline: Deadline): Topic => ({ full: `Work block — ${deadline.label}`, short: `Work block · ${deadline.short}` });

export function isExtraWork(block: StudyBlock, deadline: Deadline): boolean {
  return block.anchor.kind === "custom" && block.anchor.course === deadline.courseId && block.topic.short === extraWorkTopic(deadline).short && block.start < deadline.start;
}

/** The daily study cap guards automatic planning; a student who asks for more time may go one block over it. */
export function extraWorkSlot(input: PlanInput, deadline: Deadline, now: EpochMs): Interval | null {
  if (deadline.start <= now) return null;
  const prefs = { ...input.prefs, maxStudyMinPerDay: input.prefs.maxStudyMinPerDay + EXTRA_WORK_MIN };
  return findSlot({ ...input, prefs }, EXTRA_WORK_MIN, { after: now, before: deadline.start });
}
