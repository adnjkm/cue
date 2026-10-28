import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CalendarEvent, ImportId, TimeZone } from "@/lib/domain";
import { fmtRange, zoneOf } from "@/lib/time";
import { parseIcs } from "./ics";
import { classify, detectCourse, ImportError } from "./proposal";

const zone = zoneOf("America/Toronto" as TimeZone);
const fixture = fs.readFileSync(path.resolve(import.meta.dirname, "../../scripts/fixtures/calendar/timetable.ics"), "utf8");
const parse = (text: string, importId = "imp_a") => parseIcs(text, { zone, importId: importId as ImportId, fileName: "timetable.ics" });
const local = (e: CalendarEvent) => `${zone.dayOf(e.start)} ${fmtRange(e, zone)}`;

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body.trim()}\r\nEND:VCALENDAR\r\n`;

describe("parseIcs on the timetable fixture", () => {
  const p = parse(fixture);
  const ast = p.courses[0];

  it("finds one course and labels it for the preview", () => {
    expect(p.courses.map((c) => c.id)).toEqual(["AST101"]);
    expect(ast.label).toBe("AST101 · Tue, Thu 3–4pm · MP 202");
    expect(ast.counts).toBe("24 lectures · 1 test · 1 deadline");
    expect(ast.title).toBe("The Sun and Its Neighbours");
    expect(ast.instructor).toBe("Prof. Ostrowski");
    expect(ast.dated).toEqual(["Problem Set 3 due Fri 6 Nov, 11:59pm", "Midterm · Tue 17 Nov, 6pm"]);
  });

  it("expands RRULE and drops EXDATE instances", () => {
    const lectures = ast.events.filter((e) => e.kind === "lecture");
    expect(lectures).toHaveLength(24);
    expect(local(lectures[0])).toBe("2026-09-08 3–4pm");
    expect(local(lectures[23])).toBe("2026-12-03 3–4pm");
    const days = lectures.map((e) => zone.dayOf(e.start));
    expect(days).not.toContain("2026-11-10");
    expect(days).not.toContain("2026-11-12");
    expect(days).toContain("2026-11-05");
  });

  it("keeps wall time across the fall-back weekend", () => {
    const lectures = ast.events.filter((e) => e.kind === "lecture");
    expect(lectures.find((e) => zone.dayOf(e.start) === "2026-11-03")).toMatchObject({ start: Date.parse("2026-11-03T15:00:00-05:00") });
    expect(lectures.find((e) => zone.dayOf(e.start) === "2026-10-27")).toMatchObject({ start: Date.parse("2026-10-27T15:00:00-04:00") });
  });

  it("applies a moved instance and numbers lectures in order", () => {
    const lectures = ast.events.filter((e) => e.kind === "lecture");
    const oct15 = lectures.find((e) => zone.dayOf(e.start) === "2026-10-15");
    expect(oct15).toMatchObject({ location: "MP 203", number: 12, seriesId: "ics:2026F-AST101H1-LEC0101@acorn.utoronto.ca" });
    expect(lectures.map((e) => (e.kind === "lecture" ? e.number : 0))).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it("reads the midterm as a test and the problem set as a deadline", () => {
    const test = ast.events.find((e) => e.kind === "test");
    expect(test).toMatchObject({ label: "Midterm", short: "Midterm", weight: "midterm", location: "EX 310" });
    expect(local(test!)).toBe("2026-11-17 6–8pm");
    const due = ast.events.find((e) => e.kind === "deadline");
    expect(due).toMatchObject({ label: "Problem Set 3", short: "PS3", effort: "medium", start: Date.parse("2026-11-06T23:59:00-05:00") });
    expect(due!.end).toBe(due!.start);
  });

  it("keeps non-course events as busy time", () => {
    expect(p.other).toHaveLength(12);
    expect(p.other.every((e) => e.kind === "busy" && e.title === "Climbing with Priya" && e.location === "Basecamp Climbing")).toBe(true);
    expect(local(p.other[0])).toBe("2026-09-14 7–8:30pm");
  });

  it("gives every event the import id and a stable id on re-import", () => {
    const again = parse(fixture, "imp_b");
    const idsOf = (x: typeof p) => [...x.courses.flatMap((c) => c.events), ...x.other].map((e) => e.id);
    expect(idsOf(again)).toEqual(idsOf(p));
    expect(new Set(idsOf(p)).size).toBe(idsOf(p).length);
    expect(again.courses[0].events.every((e) => e.importId === "imp_b")).toBe(true);
    expect(p.source).toEqual({ kind: "ics", fileName: "timetable.ics" });
  });
});

describe("parseIcs on other shapes", () => {
  it("reads UTC times and floating times in the student's zone", () => {
    const p = parse(
      wrap(`
BEGIN:VEVENT
UID:u1
SUMMARY:CSC148 Lecture 9: Binary search trees
DTSTART:20261028T140000Z
DTEND:20261028T150000Z
END:VEVENT
BEGIN:VEVENT
UID:u2
SUMMARY:Dentist
DTSTART:20261029T090000
DURATION:PT1H
END:VEVENT`),
    );
    const lecture = p.courses[0].events[0];
    expect(lecture).toMatchObject({ kind: "lecture", number: 9, topic: { full: "Binary search trees", short: "Binary" } });
    expect(local(lecture)).toBe("2026-10-28 10–11am");
    expect(local(p.other[0])).toBe("2026-10-29 9–10am");
  });

  it("turns all-day items into notes and all-day coursework into end-of-day deadlines", () => {
    const p = parse(
      wrap(`
BEGIN:VEVENT
UID:h1
SUMMARY:Thanksgiving · no class
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261013
END:VEVENT
BEGIN:VEVENT
UID:d1
SUMMARY:ECO101 Assignment 2
DTSTART;VALUE=DATE:20261030
DTEND;VALUE=DATE:20261031
END:VEVENT`),
    );
    expect(p.other).toMatchObject([{ kind: "note", text: "Thanksgiving · no class", start: zone.startOfDay("2026-10-12" as never) }]);
    expect(p.courses[0].events[0]).toMatchObject({ kind: "deadline", label: "Assignment 2", short: "A2", effort: "large", start: Date.parse("2026-10-30T23:59:00-04:00") });
  });

  it("says how to recover from a file it cannot use", () => {
    expect(() => parse("this is not a calendar")).toThrow(ImportError);
    expect(() => parse("this is not a calendar")).toThrow("Couldn't read that file. Try a PDF or an .ics file.");
    expect(() => parse(wrap(""))).toThrow(/has no classes or events/);
  });
});

describe("course detection", () => {
  it("finds course codes and drops section codes", () => {
    expect(detectCourse("CSC148H5 LEC0101")).toEqual({ id: "CSC148", rest: "" });
    expect(detectCourse("LEC0101 AST101H1 The Sun")).toEqual({ id: "AST101", rest: "The Sun" });
    expect(detectCourse("MATH 135 Lecture")).toEqual({ id: "MATH135", rest: "Lecture" });
    expect(detectCourse("Lunch with Sam")).toBeNull();
    expect(detectCourse("Room 101 booking")).toBeNull();
  });

  it("classifies by the words in the title", () => {
    expect(classify("A2 due", false)).toBe("deadline");
    expect(classify("Problem Set 4", true)).toBe("deadline");
    expect(classify("Term Test 2", false)).toBe("test");
    expect(classify("TUT0101", false)).toBe("lab");
    expect(classify("Practical", false)).toBe("lab");
    expect(classify("The Sun and Its Neighbours", false)).toBe("lecture");
  });
});
