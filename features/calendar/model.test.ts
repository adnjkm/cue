import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_PREFS, type EpochMs, type LocalDate, type PlanOverride, type PlanView, type TimeZone, type WallTime } from "@/lib/domain";
import { blockStatus, blockTitle, planInputFrom, schedule } from "@/lib/plan";
import { sampleRows } from "@/lib/sample";
import { zoneOf } from "@/lib/time";
import { blockName, boxOf, eventName, itemsByDay, lookSuffix, periodLabel, shiftDate, viewDays } from "./model";

const ZONE = "America/Toronto" as TimeZone;
const zone = zoneOf(ZONE);
const NOW = Date.parse("2026-10-27T10:40:00-04:00") as EpochMs;
const input = planInputFrom({ ...sampleRows({ now: NOW, zone: ZONE }).rows, zone: ZONE, prefs: DEFAULT_PLAN_PREFS });
const out = schedule(input);
const week = viewDays("week", "2026-10-27" as LocalDate);

/** The view usePlan hands the screen, built from the sample with every past block finished by a session, as the seed does. */
function view(overrides: PlanOverride[] = []): PlanView {
  const range = { start: zone.startOfDay(week[0]), end: zone.startOfDay("2026-11-02" as LocalDate) };
  const inRange = (iv: { start: number; end: number }) => iv.start < range.end && iv.end > range.start;
  const byId = new Map(overrides.map((o) => [o.blockId, o]));
  return {
    zone,
    range,
    blocks: out.blocks.filter(inRange),
    events: input.events.filter((e) => inRange({ start: e.start, end: Math.max(e.end, e.start + 1) })),
    agenda: [],
    unplaced: [],
    conflicts: [],
    isEmpty: false,
    status: (b) => blockStatus(b, { now: NOW, override: byId.get(b.id), ...(b.end <= NOW ? { session: { state: { status: "completed", startedAt: b.start, endedAt: b.end, pausedMs: 0 } } } : {}) }),
  };
}

describe("itemsByDay on the Paper week", () => {
  const days = itemsByDay(view(), week, new Map());

  it("draws the 25 Paper items: 3 deadlines, 8 lectures, 14 study blocks", () => {
    expect(days.flatMap((d) => d.due.map((e) => e.kind))).toEqual(["deadline", "deadline", "deadline"]);
    expect(days.flatMap((d) => d.timed.filter((t) => t.kind === "event")).length).toBe(8);
    expect(days.flatMap((d) => d.timed.filter((t) => t.kind === "block")).length).toBe(14);
  });

  it("keeps finished past blocks plain and marks the current one now", () => {
    const tuesday = days[1].timed.flatMap((t) => (t.kind === "block" ? [`${blockTitle(t.block, "calendar")}${lookSuffix(t.look)}`] : []));
    expect(tuesday).toEqual(["Review · Recursion · now", "Mid-week · PSY", "Work block · PS4"]);
    const monday = days[0].timed.flatMap((t) => (t.kind === "block" ? [t.look] : []));
    expect(monday).toEqual(["plain", "plain"]);
  });

  it("gives only an explicit Mark done the done look", () => {
    const midweek = out.blocks.find((b) => blockTitle(b, "calendar") === "Mid-week · PSY" && zone.dayOf(b.start) === "2026-10-27")!;
    const marked: PlanOverride = { blockId: midweek.id, placement: { kind: "pinned", at: { start: midweek.start, end: midweek.end } }, status: "done", updatedAt: NOW };
    const done = itemsByDay(view([marked]), week, new Map([[midweek.id, marked]]));
    const item = done[1].timed.find((t) => t.id === midweek.id);
    expect(item?.kind === "block" && [item.status, item.look]).toEqual(["done", "done"]);
  });

  it("names blocks and lectures the way the walkthrough and screen readers read them", () => {
    const review = days[1].timed.find((t) => t.kind === "block")!;
    expect(review.kind === "block" && blockName(review.block, review.status, zone)).toBe("Review · Recursion, Tuesday 27 October, 10:30 to 11:15am, now");
    const trees = days[0].timed.find((t) => t.kind === "block")!;
    expect(trees.kind === "block" && blockName(trees.block, trees.status, zone)).toBe("Review · Trees, Monday 26 October, 11:15am to 12pm, done");
    const thursday = days[3].timed.find((t) => t.kind === "event")!;
    expect(thursday.kind === "event" && eventName(thursday.event, zone, false)).toBe("MAT137 Lecture, Thursday 29 October, 9 to 10am, MP 102");
  });
});

describe("grid geometry", () => {
  const at = (day: string, time: string) => zone.at(day as LocalDate, time as WallTime);

  it("places blocks at 50px an hour and draws short blocks tall enough to read", () => {
    expect(boxOf({ start: at("2026-10-27", "09:00"), end: at("2026-10-27", "10:00") }, "2026-10-27" as LocalDate, zone, 2)).toEqual({ top: 450, height: 46, minHeight: 46 });
    expect(boxOf({ start: at("2026-10-27", "10:30"), end: at("2026-10-27", "11:15") }, "2026-10-27" as LocalDate, zone, 2)).toMatchObject({ top: 525, height: 40 });
    expect(boxOf({ start: at("2026-10-27", "14:00"), end: at("2026-10-27", "14:30") }, "2026-10-27" as LocalDate, zone, 1)).toMatchObject({ top: 700, height: 28 });
    expect(boxOf({ start: at("2026-10-27", "19:00"), end: at("2026-10-27", "21:00") }, "2026-10-27" as LocalDate, zone, 2)).toMatchObject({ top: 950, height: 96 });
  });

  it("uses wall time on the 25-hour Sunday", () => {
    expect(boxOf({ start: at("2026-11-01", "13:00"), end: at("2026-11-01", "14:00") }, "2026-11-01" as LocalDate, zone, 2)).toMatchObject({ top: 650, height: 46 });
  });
});

describe("periods", () => {
  it("lays out the October month grid from Sep 28 to Nov 1", () => {
    const days = viewDays("month", "2026-10-27" as LocalDate);
    expect([days.length, days[0], days[days.length - 1]]).toEqual([35, "2026-09-28", "2026-11-01"]);
    expect(viewDays("month", "2026-11-15" as LocalDate).length).toBe(42);
    expect(viewDays("month", "2027-02-10" as LocalDate).length).toBe(28);
  });

  it("steps by period and keeps the day of the month where it can", () => {
    expect(shiftDate("week", "2026-10-27" as LocalDate, 1)).toBe("2026-11-03");
    expect(shiftDate("day", "2026-11-01" as LocalDate, 1)).toBe("2026-11-02");
    expect(shiftDate("month", "2027-01-31" as LocalDate, 1)).toBe("2027-02-28");
    expect(shiftDate("month", "2026-01-15" as LocalDate, -1)).toBe("2025-12-15");
  });

  it("reads the period from the focused date, as Paper’s split week reads October", () => {
    expect(periodLabel("2026-10-27" as LocalDate, zone, false)).toBe("October 2026");
    expect(periodLabel("2026-10-27" as LocalDate, zone, true)).toBe("Oct 2026");
  });
});
