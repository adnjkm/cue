import { describe, expect, it } from "vitest";
import type { EpochMs, TimeZone } from "@/lib/domain";
import { sampleRows } from "@/lib/sample";
import { checkGenerated, keyAgrees } from "./checks";
import { mockCheck, mockGenerate } from "./mocks";

const { rows } = sampleRows({ now: Date.parse("2026-10-27T10:12:00-04:00") as EpochMs, zone: "America/Toronto" as TimeZone });
const samplePrompts = (rows.questions ?? []).map((q) => q.prompt);

describe("the mock question banks", () => {
  it("are checked against all 25 sample paper questions", () => {
    expect(samplePrompts).toHaveLength(25);
  });

  for (const [label, input] of [
    ["CSC148 trees", { course: "CSC148", topic: "Recursion & trees", focus: "the topic “Recursion & trees”" }],
    ["CSC148 Big-O", { course: "CSC148", topic: "Big-O & efficiency", focus: "the topic “Big-O & efficiency”" }],
    ["ECO101 guide section", { course: "ECO101", topic: "Price elasticity of demand", focus: "the study guide section “Price elasticity of demand” (passage S1)" }],
  ] as const) {
    it(`${label}: all five pass the checks against the sample papers and the re-answer agrees`, () => {
      const items = mockGenerate({ ...input, style: [], passages: [], count: 5 });
      expect(items).toHaveLength(5);
      const kept: string[] = [];
      for (const item of items) {
        const verdict = checkGenerated(item, [...samplePrompts, ...kept]);
        expect(verdict).toMatchObject({ ok: true });
        expect(keyAgrees(item.answer, mockCheck(item.prompt))).toBe(true);
        kept.push(item.prompt);
      }
    });
  }

  it("writes the same questions again on a second run, which the duplicate check then drops", () => {
    const input = { course: "CSC148", topic: "Big-O & efficiency", focus: "the topic", style: [], passages: [], count: 3 };
    const first = mockGenerate(input).map((q) => q.prompt);
    expect(mockGenerate(input).map((q) => checkGenerated(q, first))).toEqual(Array(3).fill({ ok: false, reason: "duplicateStem" }));
  });
});
