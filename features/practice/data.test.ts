import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CourseId, TimeZone } from "@/lib/domain";
import { retrieve } from "@/lib/retrieval";
import { SAMPLE, seedSampleSemester } from "@/lib/sample";
import { sourceLabel } from "@/lib/sources";
import { retrieveMaterial } from "./data";

const CSC148 = "CSC148" as CourseId;

beforeAll(async () => {
  await seedSampleSemester({ now: Date.parse("2026-10-27T10:12:00-04:00"), zone: "America/Toronto" as TimeZone });
});

describe("retrieveMaterial", () => {
  it("grounds a question in slides, notes and transcripts, never in practice questions", async () => {
    const q8 = (await db.questions.where("setId").equals(SAMPLE.sets.csc148Midterm2024).sortBy("order"))[7];
    const text = `${q8.topic} ${q8.prompt}`;
    const everything = await retrieve({ courseId: CSC148, text, k: 6 });
    expect(everything.some((p) => p.ref.kind === "question")).toBe(true);

    const material = await retrieveMaterial(CSC148, text, 6);
    expect(material.length).toBe(6);
    expect(material.filter((p) => p.ref.kind === "question")).toEqual([]);
    expect(material.map((p) => p.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
  });

  it("finds nothing rather than practice questions when a course has no material", async () => {
    const before = await db.chunks.toArray();
    await db.chunks.filter((c) => !c.sourceKey.startsWith("set:")).delete();
    try {
      expect(await retrieveMaterial(CSC148, "postorder traversal", 6)).toEqual([]);
    } finally {
      await db.chunks.bulkPut(before);
    }
  });

  it("gives question 8 lecture slides for its three resource rows", async () => {
    const q8 = (await db.questions.where("setId").equals(SAMPLE.sets.csc148Midterm2024).sortBy("order"))[7];
    const top = (await retrieveMaterial(CSC148, `${q8.topic} ${q8.prompt}`, 6)).slice(0, 3);
    expect(top.map((p) => sourceLabel(p.ref, "meta"))).toEqual([expect.stringMatching(/^Lecture 8 slides · Slide \d+$/), expect.stringMatching(/^Lecture 8 slides · Slide \d+$/), expect.stringMatching(/^Lecture 8 slides · Slide \d+$/)]);
  });
});
