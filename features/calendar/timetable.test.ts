import { describe, expect, it } from "vitest";
import type { CalendarEvent, ImportId, LocalDate, MaterialId, TimeZone } from "@/lib/domain";
import { fmtRange, zoneOf } from "@/lib/time";
import { ImportError } from "./proposal";
import { timetableRead, type TimetableRead } from "./schema";
import { calendarTasks } from "./tasks";
import { expandTimetable, termAround } from "./timetable";

const zone = zoneOf("America/Toronto" as TimeZone);
const term = { start: "2026-10-26" as LocalDate, end: "2026-12-11" as LocalDate };
const expand = (read: TimetableRead, importId = "imp_v") => expandTimetable(read, { zone, importId: importId as ImportId, materialId: "mat_abc" as MaterialId, term });
const local = (e: CalendarEvent) => `${zone.dayOf(e.start)} ${fmtRange(e, zone)}`;
const task = calendarTasks["calendar.read"];
const read = timetableRead.parse(task.mock(task.input.parse(task.example)));

describe("expandTimetable", () => {
  const p = expand(read);
  const [bio, phl] = p.courses;

  it("lists one preview row per course with its weekly pattern", () => {
    expect(p.courses.map((c) => c.label)).toEqual(["BIO130 · Mon, Wed 1–2pm · MS 2172", "PHL100 · Tue, Thu 11am–12pm · SS 2117"]);
    expect(bio.counts).toBe("14 lectures · 7 labs · 1 test");
    expect(bio.dated).toEqual(["Term Test 1 · Wed 4 Nov, 6pm"]);
    expect(phl.dated).toEqual(["Essay 1 due Fri 13 Nov, 11:59pm"]);
    expect(bio).toMatchObject({ title: "Molecular and Cell Biology", instructor: "Prof. Ferreira" });
    expect(p.source).toEqual({ kind: "vision", materialId: "mat_abc" });
    expect(p.assumption).toBe("Classes repeat weekly from Mon 26 Oct to Fri 11 Dec.");
  });

  it("repeats each meeting weekly from the first week to the term end", () => {
    const lectures = bio.events.filter((e) => e.kind === "lecture");
    expect(lectures.map(local).slice(0, 3)).toEqual(["2026-10-26 1–2pm", "2026-10-28 1–2pm", "2026-11-02 1–2pm"]);
    expect(local(lectures[lectures.length - 1])).toBe("2026-12-09 1–2pm");
    const labs = bio.events.filter((e) => e.kind === "lab");
    expect(labs.map(local)[0]).toBe("2026-10-29 2–5pm");
    expect(labs.every((e) => e.kind === "lab" && e.title === "Lab" && e.location === "RW 110")).toBe(true);
  });

  it("keeps wall times after the clocks fall back", () => {
    const nov2 = bio.events.find((e) => zone.dayOf(e.start) === "2026-11-02");
    expect(nov2?.start).toBe(Date.parse("2026-11-02T13:00:00-05:00"));
  });

  it("turns dated items into a test and a deadline", () => {
    expect(bio.events.find((e) => e.kind === "test")).toMatchObject({ label: "Term Test 1", short: "Test 1", weight: "test", start: Date.parse("2026-11-04T18:00:00-05:00"), end: Date.parse("2026-11-04T19:50:00-05:00") });
    expect(phl.events.find((e) => e.kind === "deadline")).toMatchObject({ label: "Essay 1", short: "Essay 1", effort: "large", start: Date.parse("2026-11-13T23:59:00-05:00") });
  });

  it("derives ids from the slot, so a second read lands on the same rows", () => {
    const again = expand(read, "imp_w");
    const idsOf = (x: typeof p) => x.courses.flatMap((c) => c.events.map((e) => e.id));
    expect(idsOf(again)).toEqual(idsOf(p));
    expect(new Set(idsOf(p)).size).toBe(idsOf(p).length);
  });

  it("drops what it cannot trust and says so when nothing is left", () => {
    const messy: TimetableRead = {
      courses: [
        { code: "csc148h5", meetings: [{ kind: "lecture", day: "Fri", start: "10:00", end: "11:00" }, { kind: "lecture", day: "Fri", start: "10:00", end: "11:00" }, { kind: "lab", day: "Mon", start: "15:00", end: "14:00" }] },
        { code: "Seminar", meetings: [{ kind: "lecture", day: "Mon", start: "09:00", end: "10:00" }] },
      ],
      dated: [{ code: "CSC148", kind: "deadline", label: "A3", date: "2026-13-40" }],
    };
    const out = expand(messy);
    expect(out.courses.map((c) => [c.id, c.events.length])).toEqual([["CSC148", 7]]);
    expect(() => expand({ courses: [], dated: [] })).toThrow(ImportError);
  });
});

describe("termAround", () => {
  it("runs from this Monday to the end of the current term", () => {
    expect(termAround("2026-10-27" as LocalDate)).toEqual({ start: "2026-10-26", end: "2026-12-11" });
    expect(termAround("2027-02-03" as LocalDate)).toEqual({ start: "2027-02-01", end: "2027-04-10" });
    expect(termAround("2027-06-10" as LocalDate)).toEqual({ start: "2027-06-07", end: "2027-08-14" });
  });
});
