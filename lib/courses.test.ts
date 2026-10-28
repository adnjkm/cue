import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CourseId, EpochMs, ImportId, MaterialId } from "@/lib/domain";
import { courseActions } from "@/lib/courses";
import { readPrefs, setPrefs } from "@/lib/prefs";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("courseActions", () => {
  it("merges by normalized code and records who asserted the course", async () => {
    const a = "imp_a" as ImportId;
    expect(await courseActions.ensure("csc 148", a, { title: "Intro CS II" })).toBe("CSC148");
    await courseActions.ensure("CSC-148", a);
    await courseActions.ensure("CSC148", "manual", { instructor: "Prof. Liu" });
    expect(await db.courses.get("CSC148" as CourseId)).toEqual({
      id: "CSC148",
      code: "CSC148",
      short: "CSC",
      title: "Intro CS II",
      instructor: "Prof. Liu",
      sources: ["imp_a", "manual"],
    });
  });

  it("releases an import, deleting only courses nothing else asserts or uses", async () => {
    const a = "imp_a" as ImportId;
    await courseActions.ensure("AST101", a);
    await courseActions.ensure("ECO101", a);
    await courseActions.ensure("PSY100", a);
    await courseActions.ensure("PSY100", "manual");
    await db.materials.put({ id: "mat_x" as MaterialId, courseId: "ECO101" as CourseId, kind: "textbook", title: "Textbook", pageCount: 1, addedAt: 1 as EpochMs });
    expect(await courseActions.release(a)).toEqual(["AST101"]);
    expect((await db.courses.get("ECO101" as CourseId))?.sources).toEqual(["manual"]);
    expect((await db.courses.get("PSY100" as CourseId))?.sources).toEqual(["manual"]);
    expect(await courseActions.release(a)).toEqual([]);
  });
});

describe("prefs", () => {
  it("merges each owner's slice over its defaults", async () => {
    expect((await readPrefs("study")).pomodoro).toEqual({ focusMin: 25, breakMin: 5 });
    await setPrefs("lectures", { parakeetConsentAt: 5 as EpochMs });
    await setPrefs("lectures", { engine: "demo" });
    expect(await readPrefs("lectures")).toEqual({ engine: "demo", parakeetConsentAt: 5 });
    expect((await readPrefs("foundation")).plan.bufferMin).toBe(15);
  });
});
