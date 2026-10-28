import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { EpochMs, TimeZone } from "@/lib/domain";
import { blockMaterials, blockStatus, blockTitle, loadPlanInput, schedule } from "@/lib/plan";
import { zoneOf } from "@/lib/time";
import { resetAll, SAMPLE, seedSampleSemester } from ".";

const ZONE = "America/Toronto" as TimeZone;
const NOW = Date.parse("2026-10-27T10:12:00-04:00") as EpochMs;

describe("seedSampleSemester", () => {
  it("writes every fragment, indexes the sources and is idempotent", async () => {
    const first = await seedSampleSemester({ now: NOW, zone: ZONE });
    const counts = async () => Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.count()])));
    const once = await counts();
    expect(await seedSampleSemester({ now: NOW, zone: ZONE })).toEqual(first);
    expect(await counts()).toEqual(once);
    expect(first).toEqual({ courses: 4, events: expect.any(Number), authoredBlocks: 37 });
    expect(once).toMatchObject({ courses: 4, practiceSets: 3, attempts: 8, solutions: 1, guides: 1, messages: 2 });
    expect(once.chunks).toBeGreaterThan(80);
    expect(await db.questions.where("setId").equals(SAMPLE.sets.csc148Midterm2024).count()).toBe(15);
  });

  it("gives Today its Paper day: three sessions, the recursion review next, its materials and 12 practice Qs", async () => {
    await seedSampleSemester({ now: NOW, zone: ZONE });
    const zone = zoneOf(ZONE);
    const { blocks } = schedule(await loadPlanInput());
    const today = blocks.filter((b) => zone.dayOf(b.start) === "2026-10-27");
    expect(today.map((b) => blockTitle(b, "timeline"))).toEqual(["Review — Recursion & tree traversal", "Mid-week review — Memory & learning", "Work block — Problem Set 4"]);
    const review = today[0];
    expect(review.id).toBe(SAMPLE.blocks.recursionReview);
    const sessions = await db.sessions.toArray();
    const monday = blocks.find((b) => b.id === "review.evt_sample_csc148_l08.1")!;
    expect(blockStatus(monday, { now: NOW, session: sessions.find((s) => s.id === monday.id) })).toBe("done");
    expect(blockStatus(review, { now: NOW })).toBe("upcoming");
    const m = await blockMaterials(review);
    expect(m.materials.map((x) => x.label)).toEqual(["Lecture 8 slides", "Lab 6 handout"]);
    expect(m.transcript?.label).toBe("Lecture 8 transcript");
    expect(m.practice).toEqual({ count: 12, setId: SAMPLE.sets.csc148Midterm2024, topic: "Recursion & tree traversal" });
  });

  it("pauses the MAT137 lecture at 37:30 in the liveLecture scenario", async () => {
    await seedSampleSemester({ now: Date.parse("2026-10-27T09:47:30-04:00"), zone: ZONE, scenario: "liveLecture" });
    expect((await db.lectures.get(SAMPLE.lectures.mat137Tue))?.state).toEqual({ status: "paused", engine: "demo", capturedMs: 37 * 60_000 + 30_000 });
    await resetAll();
    expect(await db.events.count()).toBe(0);
  });
});
