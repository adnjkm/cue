import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CourseId, EpochMs, ImportId, TimeZone } from "@/lib/domain";
import { blockTitle, loadPlanInput, schedule } from "@/lib/plan";
import { seedSampleSemester } from "@/lib/sample";
import { zoneOf } from "@/lib/time";
import { commitImport } from "./commit";
import { parseIcs } from "./ics";

const ZONE = "America/Toronto" as TimeZone;
const zone = zoneOf(ZONE);
const NOW = Date.parse("2026-10-27T10:40:00-04:00") as EpochMs;
const ics = fs.readFileSync(path.resolve(import.meta.dirname, "../../scripts/fixtures/calendar/timetable.ics"), "utf8");
const AST = "AST101" as CourseId;

const snapshot = async () => ({
  events: (await db.events.toArray()).sort((a, b) => (a.id < b.id ? -1 : 1)),
  imports: await db.imports.toArray(),
  courses: await db.courses.toArray(),
});

beforeEach(async () => {
  await seedSampleSemester({ now: NOW, zone: ZONE });
});

describe("commitImport", () => {
  it("adds the chosen course, plans around it and undoes exactly that import", async () => {
    const before = await snapshot();
    const proposal = parseIcs(ics, { zone, importId: "imp_ics1" as ImportId, fileName: "timetable.ics" });
    const done = await commitImport(proposal, { courses: new Set([AST]), other: true }, NOW);

    expect(done.courses).toBe(1);
    expect(done.planned).toBeGreaterThan(0);
    expect(await db.events.where("importId").equals("imp_ics1").count()).toBe(26 + 12);
    expect(await db.imports.get("imp_ics1" as ImportId)).toMatchObject({ planFrom: NOW, source: { kind: "ics", fileName: "timetable.ics" }, courses: ["AST101"] });
    expect(await db.courses.get(AST)).toMatchObject({ title: "The Sun and Its Neighbours", sources: ["imp_ics1"] });

    const { blocks } = schedule(await loadPlanInput());
    const tuesday = blocks.filter((b) => b.courseId === AST && zone.dayOf(b.start) === "2026-10-27").map((b) => `${blockTitle(b, "calendar")} ${b.start >= Date.parse("2026-10-27T16:15:00-04:00")}`);
    expect(tuesday).toEqual(["Review · Lec 15 true"]);
    expect(blocks.some((b) => b.courseId === AST && b.start < NOW)).toBe(false);

    await done.undo();
    await done.undo();
    expect(await snapshot()).toEqual(before);
  });

  it("leaves unchecked courses and personal events out", async () => {
    const proposal = parseIcs(ics, { zone, importId: "imp_ics2" as ImportId, fileName: "timetable.ics" });
    const done = await commitImport(proposal, { courses: new Set(), other: false }, NOW);
    expect(done).toMatchObject({ courses: 0, planned: 0 });
    expect(await db.events.where("importId").equals("imp_ics2").count()).toBe(0);
    expect(await db.courses.get(AST)).toBeUndefined();
  });

  it("restores the rows a re-import replaced when that re-import is undone", async () => {
    const first = await commitImport(parseIcs(ics, { zone, importId: "imp_one" as ImportId, fileName: "timetable.ics" }), { courses: new Set([AST]), other: false }, NOW);
    const afterFirst = await snapshot();
    const second = await commitImport(parseIcs(ics, { zone, importId: "imp_two" as ImportId, fileName: "timetable.ics" }), { courses: new Set([AST]), other: false }, NOW);
    expect(second.planned).toBe(0);
    expect(await db.events.where("importId").equals("imp_one").count()).toBe(0);
    await second.undo();
    expect(await snapshot()).toEqual(afterFirst);
    expect(first.courses).toBe(1);
  });
});
