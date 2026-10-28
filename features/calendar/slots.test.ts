import { describe, expect, it } from "vitest";
import { type BlockStatus, type CalendarEvent, type EpochMs, type Interval, type PlanInput, type TimeZone, type WallTime } from "@/lib/domain";
import { blockStatus, schedule } from "@/lib/plan";
import { samplePlanInput } from "@/lib/sample/plan-input";
import { fmtRange, zoneOf } from "@/lib/time";
import { rescheduleSlot } from "./slots";

const ZONE = "America/Toronto" as TimeZone;
const zone = zoneOf(ZONE);
const at = (iso: string) => Date.parse(iso) as EpochMs;
const label = (iv: Interval | null) => (iv ? `${zone.dayOf(iv.start)} ${fmtRange(iv, zone)}` : null);

function setup(now: EpochMs, edit: (input: PlanInput) => PlanInput = (i) => i) {
  const input = edit(samplePlanInput({ now, zone: ZONE }));
  const blocks = schedule(input).blocks;
  const block = (id: string) => blocks.find((b) => b.id === id)!;
  const status = (id: string): BlockStatus => blockStatus(block(id), { now });
  const event = (id: string) => input.events.find((e) => e.id === id) as Extract<CalendarEvent, { kind: "deadline" }>;
  return { input, block, status, event, blocks };
}

describe("rescheduleSlot", () => {
  const NOW = at("2026-10-27T10:40:00-04:00");
  const { input, block, status } = setup(NOW);

  it("moves an upcoming review later, after its lecture, not to an earlier free slot before it", () => {
    const id = "review.evt_sample_mat137_thu.1";
    expect(status(id)).toBe("upcoming");
    const slot = rescheduleSlot(input, block(id), status(id), NOW);
    expect(label(slot)).toBe("2026-10-29 11–11:45am");
    expect(slot!.start).toBeGreaterThanOrEqual(at("2026-10-29T10:00:00-04:00"));
  });

  it("keeps a work block before its deadline", () => {
    const slot = rescheduleSlot(input, block("work.evt_sample_eco101_ps4.1"), "upcoming", NOW);
    expect(label(slot)).toBe("2026-10-29 11am–1pm");
    expect(slot!.end).toBeLessThanOrEqual(at("2026-10-29T17:00:00-04:00"));
  });

  it("moves a missed block to the first free slot after now", () => {
    const later = at("2026-10-27T15:00:00-04:00");
    const s = setup(later);
    expect(s.status("midweek.PSY100.2026-W44")).toBe("missed");
    expect(label(rescheduleSlot(s.input, s.block("midweek.PSY100.2026-W44"), "missed", later))).toBe("2026-10-27 3–3:30pm");
  });

  it("looks earlier when nothing fits between an upcoming work block and its deadline", () => {
    const s = setup(NOW, (i) => ({ ...i, prefs: { ...i.prefs, dayEnd: "20:00" as WallTime } }));
    const slot = rescheduleSlot(s.input, s.block("work.evt_sample_csc148_a2.2"), "upcoming", NOW);
    expect(label(slot)).toBe("2026-10-28 2:30–4:30pm");
  });

  it("gives up when the deadline has no room left", () => {
    const s = setup(NOW, (i) => ({ ...i, prefs: { ...i.prefs, dayStart: "19:00" as WallTime, dayEnd: "20:00" as WallTime } }));
    expect(rescheduleSlot(s.input, s.block("work.evt_sample_csc148_a2.2"), "upcoming", NOW)).toBeNull();
  });
});
