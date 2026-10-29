import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoScript, EngineEvent } from "@/lib/domain";
import { demoEngine, FIXTURE_SCRIPT, partialText, scheduleOf, scriptFromText, SPEECH_MS_PER_WORD } from "./demo";
import { FIXTURE_TEXT } from "./fixture";

const ms = (m: number, s: number) => (m * 60 + s) * 1000;

describe("the fixture script", () => {
  it("is scripts/fixtures/audio/lecture.txt verbatim", () => {
    expect(FIXTURE_TEXT).toBe(fs.readFileSync(path.resolve(import.meta.dirname, "../../../scripts/fixtures/audio/lecture.txt"), "utf8"));
  });

  it("starts at 0:02 and keeps lecture.wav's pace, so Term Test 2 comes about 55 s in, where lecture.wav says it (53.6 s)", () => {
    expect(FIXTURE_SCRIPT.partialEveryMs).toBe(303);
    expect(FIXTURE_SCRIPT.lines.slice(0, 3)).toEqual([
      { atMs: 2_000, raw: "Okay everyone, let's get started." },
      { atMs: 3_515, raw: "Today we are continuing with techniques of integration, and the main topic is integration by parts." },
      { atMs: 8_363, raw: "If you remember the product rule for derivatives, integration by parts is really just the product rule run backwards." },
    ]);
    const termTest = FIXTURE_SCRIPT.lines.find((l) => l.raw.includes("Term Test 2"))!;
    expect(termTest.atMs - 2_000).toBe(54_843);
  });
});

describe("demo engine timing", () => {
  const script: DemoScript = scriptFromText("One two three. Four five.", { startMs: 10_000, msPerWord: 400 });

  it("reveals one word per beat, finalizes at the end of the line, then clears the live line", () => {
    expect(scheduleOf(script, 0).map((e) => [e.dueMs, e.event.type, e.event.type === "partial" ? e.event.text : e.event.type === "final" ? e.event.raw : ""])).toEqual([
      [10_000, "partial", "one"],
      [10_400, "partial", "one two"],
      [10_800, "partial", "one two three"],
      [11_200, "final", "One two three."],
      [11_200, "partial", ""],
      [11_200, "partial", "four"],
      [11_600, "partial", "four five"],
      [12_000, "final", "Four five."],
      [12_000, "partial", ""],
    ]);
  });

  it("resumes mid-line with the words already heard, and skips lines that ended before the pause", () => {
    expect(scheduleOf(script, 11_700).map((e) => [e.dueMs, e.event.type === "partial" ? e.event.text : e.event.type])).toEqual([
      [11_700, "four five"],
      [12_000, "final"],
      [12_000, ""],
    ]);
  });

  it("gives finals the line's lecture time, which the transcript shows as its stamp", () => {
    const finals = scheduleOf(script, 0).flatMap((e) => (e.event.type === "final" ? [e.event] : []));
    expect(finals).toEqual([
      { type: "final", chunkSeq: 0, atMs: 10_000, endMs: 11_200, raw: "One two three." },
      { type: "final", chunkSeq: 1, atMs: 11_200, endMs: 12_000, raw: "Four five." },
    ]);
  });

  it("shows partials the way an engine hears them", () => {
    expect(partialText("The same trick comes back, we just apply it a second time to the leftover integral.", 14)).toBe("the same trick comes back, we just apply it a second time to the");
    expect(partialText("The same trick comes back, we", 5)).toBe("the same trick comes back");
    expect(partialText("LIATE is the rule.", 1)).toBe("LIATE");
  });

  it("puts Paper's partial on the live line at 38:12 when the sample lecture resumes at 37:30", () => {
    const rest: DemoScript = { lines: [{ atMs: ms(38, 6) + 600, raw: "The same trick comes back, we just apply it a second time to the leftover integral." }], partialEveryMs: SPEECH_MS_PER_WORD };
    const heard = scheduleOf(rest, ms(37, 30)).filter((e) => e.dueMs <= ms(38, 12));
    expect(heard.at(-1)?.event).toEqual({ type: "partial", atMs: ms(38, 6) + 600, text: "the same trick comes back, we just apply it a second time to the" });
    expect(heard.some((e) => e.event.type === "final")).toBe(false);
  });

  describe("on the page clock", () => {
    beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
    afterEach(() => vi.useRealTimers());

    it("emits each event when the clock reaches it and stops on abort", async () => {
      const controller = new AbortController();
      const seen: [number, EngineEvent["type"]][] = [];
      const done = (async () => {
        for await (const e of demoEngine.run({ kind: "script", script, resumeAtMs: 9_000 }, controller.signal)) seen.push([Date.now() - 1_000_000, e.type]);
      })();
      await vi.advanceTimersByTimeAsync(999);
      expect(seen).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_201);
      expect(seen).toEqual([
        [1_000, "partial"],
        [1_400, "partial"],
        [1_800, "partial"],
        [2_200, "final"],
        [2_200, "partial"],
        [2_200, "partial"],
        [2_600, "partial"],
        [3_000, "final"],
        [3_000, "partial"],
      ]);
      controller.abort();
      await done;
      expect(seen).toHaveLength(9);
    });
  });
});
