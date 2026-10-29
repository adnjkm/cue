"use client";

import type { DemoScript, EngineId, LectureId, PrefsByOwner, TimeZone, TranscriptionEngine } from "@/lib/domain";
import { sampleRows } from "@/lib/sample";
import { demoEngine, FIXTURE_LEAD_IN_MS, FIXTURE_MS_PER_WORD, FIXTURE_SCRIPT, scriptFromText, SPEECH_MS_PER_WORD } from "./demo";
import { FIXTURE_TEXT } from "./fixture";
import { parakeetEngine } from "./parakeet";

export const ENGINES: Record<EngineId, TranscriptionEngine> = { demo: demoEngine, parakeet: parakeetEngine };

export type EngineChoice = { engine: "demo"; why: "chosen" | "sample" } | { engine: "parakeet"; consented: boolean };

/**
 * Parakeet is the default, but its first start downloads the model, which needs a yes. With the sample
 * semester loaded and no yes yet, the note taker replays a recorded lecture instead, so a fresh browser
 * shows the whole flow without a 454 MB download.
 */
export function chooseEngine(prefs: PrefsByOwner["lectures"], sampleLoaded: boolean): EngineChoice {
  if (prefs.engine === "demo") return { engine: "demo", why: "chosen" };
  if (prefs.parakeetConsentAt !== undefined) return { engine: "parakeet", consented: true };
  return sampleLoaded ? { engine: "demo", why: "sample" } : { engine: "parakeet", consented: false };
}

const FIXTURE_END_MS = (() => {
  const last = FIXTURE_SCRIPT.lines.at(-1)!;
  return last.atMs + (last.raw.match(/\S+/g)?.length ?? 0) * FIXTURE_MS_PER_WORD;
})();

/**
 * What the demo engine replays from `resumeAtMs`: a sample lecture's own remaining lines when it has any
 * (the Paper live state resumes into them), else lecture.txt from 0:02, or a fresh replay 2 s after a
 * resume that comes after the fixture has ended.
 */
export function demoScriptFor(lectureId: LectureId, resumeAtMs: number): DemoScript {
  const own = sampleRows({ now: Date.now(), zone: "UTC" as TimeZone, scenario: "default" })
    .rows.segments.filter((s) => s.lectureId === lectureId)
    .sort((a, b) => a.atMs - b.atMs)
    .map((s) => ({ atMs: s.atMs, raw: s.text ?? s.raw }));
  if (own.some((l) => l.atMs >= resumeAtMs)) return { lines: own, partialEveryMs: SPEECH_MS_PER_WORD };
  if (resumeAtMs < FIXTURE_END_MS) return FIXTURE_SCRIPT;
  return scriptFromText(FIXTURE_TEXT, { startMs: resumeAtMs + FIXTURE_LEAD_IN_MS, msPerWord: FIXTURE_MS_PER_WORD });
}
