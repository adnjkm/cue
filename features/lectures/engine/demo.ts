import type { DemoScript, EngineEvent, EngineSource, TranscriptionEngine } from "@/lib/domain";
import { FIXTURE_TEXT } from "./fixture";

const WORD = /\S+/g;

/** lecture.wav holds 259 words in 78.59 s, so the replay speaks at the fixture's own pace. */
export const FIXTURE_MS_PER_WORD = Math.round(78_590 / 259);

/** The professor in the fixture starts 2 s into the recording, so a fresh recording shows `Listening…` only briefly. */
export const FIXTURE_LEAD_IN_MS = 2_000;

/** One line per sentence, timed by word count from `startMs`. */
export function scriptFromText(text: string, opts: { startMs: number; msPerWord: number }): DemoScript {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  let words = 0;
  const lines = sentences.map((raw) => {
    const line = { atMs: opts.startMs + words * opts.msPerWord, raw };
    words += raw.match(WORD)?.length ?? 0;
    return line;
  });
  return { lines, partialEveryMs: opts.msPerWord };
}

export const FIXTURE_SCRIPT = scriptFromText(FIXTURE_TEXT, { startMs: FIXTURE_LEAD_IN_MS, msPerWord: FIXTURE_MS_PER_WORD });

/** A lecturer's pace, 150 words a minute, for replaying a lecture's own remaining lines. */
export const SPEECH_MS_PER_WORD = 400;

/** The words heard so far, as an engine would show them mid-sentence: lower-case start, no closing punctuation. */
export function partialText(raw: string, words: number): string {
  const heard = (raw.match(WORD) ?? []).slice(0, words).join(" ");
  return heard.replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase()).replace(/[.,;:!?…]+$/u, "");
}

interface Timed {
  atMs: number;
  endMs: number;
  raw: string;
  words: number;
  index: number;
}

function timeLines(script: DemoScript): Timed[] {
  return script.lines.map((line, index) => {
    const words = line.raw.match(WORD)?.length ?? 0;
    const next = script.lines[index + 1]?.atMs ?? Infinity;
    return { atMs: line.atMs, endMs: Math.min(line.atMs + Math.max(1, words) * script.partialEveryMs, next), raw: line.raw, words, index };
  });
}

/** Every event the script produces from `resumeAtMs` on, with the lecture time it is due at. Pure, so timing is testable without timers. */
export function scheduleOf(script: DemoScript, resumeAtMs: number): { dueMs: number; event: EngineEvent }[] {
  const out: { dueMs: number; event: EngineEvent }[] = [];
  for (const line of timeLines(script)) {
    if (line.endMs <= resumeAtMs) continue;
    for (let k = 1; k <= line.words; k++) {
      const due = line.atMs + (k - 1) * script.partialEveryMs;
      if (due >= line.endMs) break;
      const nextDue = line.atMs + k * script.partialEveryMs;
      if (nextDue <= resumeAtMs && k < line.words) continue;
      out.push({ dueMs: Math.max(due, resumeAtMs), event: { type: "partial", atMs: line.atMs, text: partialText(line.raw, k) } });
    }
    out.push({ dueMs: line.endMs, event: { type: "final", chunkSeq: line.index, atMs: line.atMs, endMs: line.endMs, raw: line.raw } });
    out.push({ dueMs: line.endMs, event: { type: "partial", atMs: line.endMs, text: "" } });
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve(true);
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

/**
 * Replays a script on the page clock, so Playwright's clock drives the walkthrough and the demo reads the
 * same every time. It never opens the microphone and stores no audio.
 */
export const demoEngine: TranscriptionEngine = {
  id: "demo",
  capabilities: { partials: true, needsDownloadBytes: 0 },
  async prepare() {},
  async *run(source: EngineSource, signal: AbortSignal): AsyncIterable<EngineEvent> {
    if (source.kind !== "script") throw new Error("The demo engine replays a script.");
    const t0 = Date.now();
    const lectureNow = () => source.resumeAtMs + (Date.now() - t0);
    for (const { dueMs, event } of scheduleOf(source.script, source.resumeAtMs)) {
      const wait = dueMs - lectureNow();
      if (wait > 0 ? !(await sleep(wait, signal)) : signal.aborted) return;
      yield event;
    }
    await new Promise<void>((resolve) => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));
  },
  async transcribeStored() {
    return { raw: "" };
  },
};
