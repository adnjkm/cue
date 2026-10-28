import type { BlockStatus, CalendarEvent, EpochMs, Interval, PlanInput, StudyBlock } from "@/lib/domain";
import { findSlot } from "@/lib/plan";

const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;

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
