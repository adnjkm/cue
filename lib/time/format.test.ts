import { describe, expect, it } from "vitest";
import type { EpochMs, IsoWeek, LocalDate, TimeZone, WallTime } from "@/lib/domain";
import { fmtCountdown, fmtDay, fmtDuration, fmtRange, fmtStamp, fmtTime, zoneOf } from "@/lib/time";

const zone = zoneOf("America/Toronto" as TimeZone);
const day = "2026-10-27" as LocalDate;
const at = (time: string, d = day) => zone.at(d, time as WallTime);
const span = (a: string, b: string) => ({ start: at(a), end: at(b) });

describe("Paper time formats", () => {
  it("formats times like Today's timeline", () => {
    expect(fmtTime(at("09:00"), zone)).toBe("9am");
    expect(fmtTime(at("10:30"), zone)).toBe("10:30am");
    expect(fmtTime(at("12:00"), zone)).toBe("12pm");
    expect(fmtTime(at("14:00"), zone)).toBe("2pm");
    expect(fmtTime(at("19:00"), zone)).toBe("7pm");
    expect(fmtTime(at("11:45"), zone)).toBe("11:45am");
  });

  it("shares one meridiem across a range and uses an en dash", () => {
    expect(fmtRange(span("10:30", "11:15"), zone)).toBe("10:30–11:15am");
    expect(fmtRange(span("11:15", "12:00"), zone)).toBe("11:15am–12pm");
    expect(fmtRange(span("09:00", "10:00"), zone)).toBe("9–10am");
    expect(fmtRange(span("19:00", "21:00"), zone)).toBe("7–9pm");
  });

  it("formats durations, countdowns and transcript stamps", () => {
    expect(fmtDuration(45 * 60_000)).toBe("45m");
    expect(fmtDuration(120 * 60_000)).toBe("2h");
    expect(fmtDuration(195 * 60_000)).toBe("3h 15m");
    expect(fmtCountdown((31 * 60 + 48) * 1000)).toBe("31:48");
    expect(fmtCountdown(45 * 60_000)).toBe("45:00");
    expect(fmtCountdown((31 * 60 + 47) * 1000 + 1)).toBe("31:48");
    expect(fmtStamp((41 * 60 + 5) * 1000)).toBe("41:05");
    expect(fmtStamp((4 * 60 + 15) * 1000)).toBe("4:15");
    expect(fmtStamp(45_000)).toBe("0:45");
    expect(fmtStamp((3600 + 2 * 60 + 3) * 1000)).toBe("1:02:03");
  });

  it("formats days", () => {
    expect(fmtDay("2026-10-29" as LocalDate, zone, "weekdayShort")).toBe("Thu");
    expect(fmtDay(day, zone, "long")).toBe("Tuesday 27 October");
    expect(fmtDay(day, zone, "month")).toBe("October 2026");
    expect(fmtDay(day, zone, "monthSpan")).toBe("Oct – Nov 2026");
    expect(fmtDay("2026-10-14" as LocalDate, zone, "monthSpan")).toBe("October 2026");
  });
});

describe("zone math", () => {
  it("keeps wall times on the 25-hour fall-back Sunday", () => {
    const sunday = "2026-11-01" as LocalDate;
    expect((at("13:00", sunday) - zone.startOfDay(sunday)) / 3_600_000).toBe(14);
    expect(fmtRange({ start: at("13:00", sunday), end: at("14:00", sunday) }, zone)).toBe("1–2pm");
    expect(zone.dayOf(at("23:30", sunday))).toBe("2026-11-01");
    expect(zone.addDays(sunday, 1)).toBe("2026-11-02");
  });

  it("knows ISO weeks and weekdays", () => {
    expect(zone.weekOf(day)).toBe("2026-W44");
    expect(zone.weekOf(at("10:12"))).toBe("2026-W44");
    expect(zone.weekday(day)).toBe(2);
    expect(zone.daysOfWeek("2026-W44" as IsoWeek)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(zone.weekOf("2027-01-01" as LocalDate)).toBe("2026-W53");
  });

  it("converts an instant to the local day", () => {
    expect(zone.dayOf(Date.parse("2026-10-28T03:30:00Z") as EpochMs)).toBe("2026-10-27");
  });
});
