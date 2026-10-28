import { describe, expect, it } from "vitest";
import type { EpochMs, LocalDate, TimeZone, WallTime } from "@/lib/domain";
import { minutesOfDay, zoneOf } from "./zone";

const at = (iso: string) => Date.parse(iso) as EpochMs;
const toronto = zoneOf("America/Toronto" as TimeZone);
const kathmandu = zoneOf("Asia/Kathmandu" as TimeZone);

describe("zone lookups across offset changes", () => {
  it.each([
    ["2026-11-01T03:59:00Z", "2026-10-31", 1439],
    ["2026-11-01T04:00:00Z", "2026-11-01", 0],
    ["2026-11-01T05:30:00Z", "2026-11-01", 90],
    ["2026-11-01T06:30:00Z", "2026-11-01", 90],
    ["2027-03-14T06:59:00Z", "2027-03-14", 119],
    ["2027-03-14T07:00:00Z", "2027-03-14", 180],
  ])("Toronto %s is %s at minute %i", (iso, day, minute) => {
    expect(toronto.dayOf(at(iso))).toBe(day);
    expect(minutesOfDay(at(iso), toronto)).toBe(minute);
  });

  it("handles a zone whose offset is not a whole hour", () => {
    expect(kathmandu.dayOf(at("2026-10-27T18:14:00Z"))).toBe("2026-10-27");
    expect(minutesOfDay(at("2026-10-27T18:14:00Z"), kathmandu)).toBe(1439);
    expect(kathmandu.dayOf(at("2026-10-27T18:15:00Z"))).toBe("2026-10-28");
    expect(minutesOfDay(at("2026-10-27T18:15:00Z"), kathmandu)).toBe(0);
  });

  it("resolves wall times in a DST gap forward and in an overlap to the first occurrence, also when repeated", () => {
    for (let i = 0; i < 2; i++) {
      expect(toronto.at("2027-03-14" as LocalDate, "02:30" as WallTime)).toBe(at("2027-03-14T07:30:00Z"));
      expect(toronto.at("2026-11-01" as LocalDate, "01:30" as WallTime)).toBe(at("2026-11-01T05:30:00Z"));
    }
  });
});
