import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { BlockId, CourseId, EpochMs, LectureId, LocalDate, TimeZone } from "@/lib/domain";
import { setPrefs } from "@/lib/prefs";
import { samplePlanInput } from "@/lib/sample/plan-input";
import { zoneOf } from "@/lib/time";
import { planActions } from "./actions";
import { loadPlanInput } from "./input";
import { schedule } from "./schedule";

const ZONE = "America/Toronto" as TimeZone;
const zone = zoneOf(ZONE);
const NOW = Date.parse("2026-10-27T10:12:00-04:00") as EpochMs;
const at = (day: string, time: string) => zone.at(day as LocalDate, time as never);
const PREP = "prep.evt_sample_csc148_midterm.3" as BlockId;
const RECURSION = "review.evt_sample_csc148_l08.2" as BlockId;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const input = samplePlanInput({ now: NOW, zone: ZONE });
  await setPrefs("foundation", { zone: ZONE });
  await db.events.bulkPut([...input.events]);
  await db.imports.bulkPut(input.imports.map((i) => ({ ...i, at: NOW, source: { kind: "sample" as const }, courses: [] })));
  await db.overrides.bulkPut([...input.overrides]);
});

const blockOf = async (id: BlockId) => schedule(await loadPlanInput()).blocks.find((b) => b.id === id);

describe("planActions", () => {
  it("reschedules an authored block to the next free slot and keeps its text", async () => {
    const slot = await planActions.reschedule(PREP, { after: at("2026-10-31", "13:00") });
    expect(slot).toEqual({ start: at("2026-10-31", "13:00"), end: at("2026-10-31", "15:00") });
    expect(await blockOf(PREP)).toMatchObject({ start: slot!.start, topic: { full: "Midterm" }, note: "Past paper, timed", placement: "authored" });
  });

  it("moves a missed review after now, like Today's Reschedule at 11:40", async () => {
    const slot = await planActions.reschedule(RECURSION, { after: at("2026-10-27", "11:40") });
    expect(slot).toEqual({ start: at("2026-10-27", "11:45"), end: at("2026-10-27", "12:30") });
  });

  it("marks done in place and is idempotent; skip and restore round-trip", async () => {
    const before = await blockOf(RECURSION);
    await planActions.markDone(RECURSION);
    await planActions.markDone(RECURSION);
    expect(await db.overrides.get(RECURSION)).toMatchObject({ status: "done", placement: { kind: "authored" } });
    expect(await blockOf(RECURSION)).toMatchObject({ start: before!.start, placement: "locked" });
    await planActions.skip(RECURSION);
    expect(await blockOf(RECURSION)).toBeUndefined();
    await planActions.restore(RECURSION);
    expect(await blockOf(RECURSION)).toMatchObject({ start: before!.start, placement: "authored" });
  });

  it("refuses to move a block onto a lecture", async () => {
    await expect(planActions.move(PREP, { start: at("2026-10-28", "10:00"), end: at("2026-10-28", "11:00") })).rejects.toThrow("overlaps a fixed event");
  });

  it("creates one Review now block per lecture per day", async () => {
    const lectureId = "lec.evt_sample_mat137_tue" as LectureId;
    await db.lectures.put({ id: lectureId, courseId: "MAT137" as CourseId, scheduledMs: 50 * 60_000, state: { status: "ready" }, topic: { full: "Integration by parts", short: "By parts" }, updatedAt: NOW });
    const a = await planActions.reviewNow(lectureId, (NOW + 3 * 60 * 60_000) as EpochMs);
    const b = await planActions.reviewNow(lectureId, (NOW + 4 * 60 * 60_000) as EpochMs);
    expect(a).toBe(b);
    expect(a).toBe("custom.review-now.lec.evt_sample_mat137_tue.2026-10-27");
    expect(await blockOf(a)).toMatchObject({ start: at("2026-10-27", "13:12"), courseId: "MAT137", topic: { short: "By parts" } });
  });
});
