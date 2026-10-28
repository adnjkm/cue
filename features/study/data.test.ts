import { describe, expect, it } from "vitest";
import type { BlockId, CourseId, EpochMs, PlanOverride, Unplaced } from "@/lib/domain";
import { setAsideBlock } from "./data";

const id = "custom.review-now.lec.evt_mat137_tue.2026-10-27" as BlockId;
const anchor = { kind: "custom" as const, key: "review-now.lec.evt_mat137_tue.2026-10-27", course: "MAT137" as CourseId };
const at = { start: Date.parse("2026-10-27T09:48:00-04:00") as EpochMs, end: Date.parse("2026-10-27T10:33:00-04:00") as EpochMs };
const row: PlanOverride = { blockId: id, placement: { kind: "authored", block: { anchor, at, topic: { full: "Integration by parts", short: "By parts" } } }, updatedAt: at.start };
const setAside: Unplaced = { blockId: id, anchor, minutes: 45, reason: "noFreeSlot" };

describe("setAsideBlock", () => {
  it("opens a Review now block that the scheduler set aside because it overlaps the lecture", () => {
    expect(setAsideBlock(id, row, [setAside])).toEqual({
      id,
      anchor,
      start: at.start,
      end: at.end,
      courseId: "MAT137",
      topic: { full: "Integration by parts", short: "By parts" },
      why: { offsetDays: 0 },
      placement: "authored",
    });
  });

  it("opens nothing for a block that is not set aside or has no authored custom override", () => {
    expect(setAsideBlock(id, row, [])).toBeNull();
    expect(setAsideBlock(id, null, [setAside])).toBeNull();
    expect(setAsideBlock(id, { blockId: id, placement: { kind: "pinned", at }, updatedAt: at.start }, [setAside])).toBeNull();
  });
});
