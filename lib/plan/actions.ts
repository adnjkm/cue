import { db } from "@/lib/db";
import { ids, type BlockId, type CourseId, type EpochMs, type Interval, type LectureId, type PlanOverride, type Topic } from "@/lib/domain";
import { zoneOf } from "@/lib/time";
import { loadPlanInput } from "./input";
import { findSlot, schedule } from "./schedule";

const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;

async function currentBlock(blockId: BlockId) {
  const input = await loadPlanInput();
  return { input, block: schedule(input).blocks.find((b) => b.id === blockId) ?? null };
}

async function writeAt(blockId: BlockId, at: Interval): Promise<void> {
  const existing = await db.overrides.get(blockId);
  const placement: PlanOverride["placement"] =
    existing?.placement?.kind === "authored" ? { kind: "authored", block: { ...existing.placement.block, at } } : { kind: "pinned", at };
  const status = existing?.status === "done" ? "done" : undefined;
  await db.overrides.put({ blockId, placement, ...(status ? { status } : {}), updatedAt: Date.now() as EpochMs });
}

/** The only writer of `overrides`. Every action is idempotent. */
export const planActions = {
  /** Moves the block to the next free slot after `after`, keeping authored text; null when nothing fits within 7 days. */
  reschedule: async (blockId: BlockId, opts: { after: EpochMs }): Promise<Interval | null> => {
    const { input, block } = await currentBlock(blockId);
    if (!block) return null;
    const without = { ...input, overrides: [...input.overrides.filter((o) => o.blockId !== blockId), { blockId, status: "skipped" as const, updatedAt: 0 as EpochMs }] };
    const slot = findSlot(without, (block.end - block.start) / MIN, { after: opts.after, before: (opts.after + WEEK) as EpochMs });
    if (slot) await writeAt(blockId, slot);
    return slot;
  },
  /** Rejects an interval that overlaps fixed busy time. */
  move: async (blockId: BlockId, at: Interval): Promise<void> => {
    const input = await loadPlanInput();
    const clash = input.events.find((e) => (e.kind === "lecture" || e.kind === "lab" || e.kind === "test" || e.kind === "busy") && e.start < at.end && at.start < e.end);
    if (clash) throw new Error("That time overlaps a fixed event.");
    await writeAt(blockId, at);
  },
  /** Sets status done; pins a rule block at its current placement so it never moves afterwards. */
  markDone: async (blockId: BlockId): Promise<void> => {
    const existing = await db.overrides.get(blockId);
    if (existing?.status === "done") return;
    const placement = existing?.placement ?? (await currentBlock(blockId).then(({ block }) => (block ? { kind: "pinned" as const, at: { start: block.start, end: block.end } } : undefined)));
    if (!placement) return;
    await db.overrides.put({ blockId, placement, status: "done", updatedAt: Date.now() as EpochMs });
  },
  skip: async (blockId: BlockId): Promise<void> => {
    const existing = await db.overrides.get(blockId);
    const updatedAt = Date.now() as EpochMs;
    await db.overrides.put(existing?.placement ? { blockId, placement: existing.placement, status: "skipped", updatedAt } : { blockId, status: "skipped", updatedAt });
  },
  /** Clears the status; deletes the row when no placement is left. */
  restore: async (blockId: BlockId): Promise<void> => {
    const existing = await db.overrides.get(blockId);
    if (!existing) return;
    if (!existing.placement) await db.overrides.delete(blockId);
    else await db.overrides.put({ blockId, placement: existing.placement, updatedAt: Date.now() as EpochMs });
  },
  addCustom: async (fields: { course: CourseId | null; topic: Topic; at: Interval; note?: string }): Promise<BlockId> => {
    const anchor = { kind: "custom" as const, key: crypto.randomUUID().slice(0, 8), course: fields.course };
    const blockId = ids.block(anchor);
    await db.overrides.put({
      blockId,
      placement: { kind: "authored", block: { anchor, at: fields.at, topic: fields.topic, ...(fields.note ? { note: fields.note } : {}) } },
      updatedAt: Date.now() as EpochMs,
    });
    return blockId;
  },
  /** Saved notes' "Review now": a 45-minute custom block from now for that lecture. Idempotent per lecture per day. */
  reviewNow: async (lectureId: LectureId, now: EpochMs): Promise<BlockId> => {
    const lecture = await db.lectures.get(lectureId);
    if (!lecture) throw new Error(`No lecture ${lectureId}`);
    const input = await loadPlanInput();
    const day = zoneOf(input.zone).dayOf(now);
    const anchor = { kind: "custom" as const, key: `review-now.${lectureId}.${day}`, course: lecture.courseId };
    const blockId = ids.block(anchor);
    if (await db.overrides.get(blockId)) return blockId;
    const start = (Math.floor(now / MIN) * MIN) as EpochMs;
    const topic = lecture.topic ?? (lecture.number === undefined ? { full: "Lecture review", short: "Lecture" } : { full: `Lecture ${lecture.number}`, short: `Lec ${lecture.number}` });
    await db.overrides.put({ blockId, placement: { kind: "authored", block: { anchor, at: { start, end: (start + 45 * MIN) as EpochMs }, topic } }, updatedAt: now });
    return blockId;
  },
} as const;
