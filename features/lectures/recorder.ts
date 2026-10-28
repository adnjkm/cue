"use client";

import { useSyncExternalStore } from "react";
import { AiError } from "@/lib/ai";
import type { EngineId, EngineSource, EpochMs, LectureId, Segment } from "@/lib/domain";
import { reindexSource, sourceKey } from "@/lib/retrieval";
import { fmtStamp } from "@/lib/time";
import { closeMic, MicError, openMic, type MicFailure } from "./capture/mic";
import {
  addAudio,
  addSegment,
  audioBacklog,
  clearNotes,
  ensureLecture,
  heartbeat,
  markRecording,
  markStopped,
  markTranscribed,
  nextAudio,
  nextAudioSeq,
  nextSeq,
  pruneAudio,
  setFlag,
} from "./data";
import { demoScriptFor, ENGINES } from "./engine";
import { EngineError, parakeetEngine, type EngineFailure } from "./engine/parakeet";
import type { Backend } from "./engine/protocol";
import { flagLabel } from "./hints";
import { cleanSegment, scanHints, writeNotes } from "./pipeline";

export type RecorderPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "preparing"; loadedBytes: number; totalBytes: number }
  | { kind: "running" }
  | { kind: "stopping"; to: "paused" | "saved" }
  | { kind: "failed"; reason: MicFailure | EngineFailure };

export type NotesJob = { status: "writing" } | { status: "failed"; error: AiError };

export interface RecorderState {
  lectureId: LectureId | null;
  engine: EngineId | null;
  phase: RecorderPhase;
  /** The live line while an engine runs: empty text means listening. */
  partial: { atMs: number; text: string } | null;
  backend: Backend | null;
  /** Stored audio chunks still waiting for Parakeet. */
  backlog: number;
  /** The last failure of cleanup or hints. The transcript keeps the engine's words meanwhile. */
  aiError: AiError | null;
  /** Read by the polite live region: flags only. State changes speak through the visible status, and lines never do. */
  announcement: string;
  notes: Readonly<Record<string, NotesJob>>;
}

const INITIAL: RecorderState = { lectureId: null, engine: null, phase: { kind: "idle" }, partial: null, backend: null, backlog: 0, aiError: null, announcement: "", notes: {} };

let state = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<RecorderState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

interface Run {
  lectureId: LectureId;
  engine: EngineId;
  controller: AbortController;
  loop: Promise<void>;
  stream: MediaStream | null;
  timer: ReturnType<typeof setInterval>;
  wakeLock: { release(): Promise<void> } | null;
}

let run: Run | null = null;
/** Cleanup and hints run one segment at a time, in transcript order, so each cleanup sees the line before it. */
let work: Promise<void> = Promise.resolve();
const seqs = new Map<LectureId, Promise<number>>();
const dismissed = new Map<LectureId, Set<number>>();
const draining = new Set<LectureId>();
let capped = false;

const now = () => Date.now() as EpochMs;
const dismissedFor = (id: LectureId) => dismissed.get(id) ?? dismissed.set(id, new Set()).get(id)!;

async function allocSeq(lectureId: LectureId): Promise<number> {
  const prev = seqs.get(lectureId) ?? nextSeq(lectureId);
  const next = prev.then((n) => n + 1);
  seqs.set(lectureId, next);
  return prev;
}

function noteAiError(e: unknown) {
  if (!(e instanceof AiError) || e.kind === "aborted") return;
  if (e.kind === "budget") capped = true;
  set({ aiError: e });
}

async function processSegment(segment: Segment) {
  if (capped) return;
  try {
    await cleanSegment(segment);
    if (state.aiError) set({ aiError: null });
  } catch (e) {
    noteAiError(e);
    if (capped) return;
  }
  try {
    const flagged = await scanHints(segment.lectureId, segment.endMs, dismissedFor(segment.lectureId));
    for (const f of flagged) set({ announcement: `Exam hint flagged at ${fmtStamp(f.atMs)}, ${flagLabel(f.flag, "saved")}` });
  } catch (e) {
    noteAiError(e);
  }
}

function enqueue(segment: Segment) {
  work = work.then(() => processSegment(segment));
}

/** Transcribes stored chunks in order with Parakeet. Runs on after a pause, so a WASM backlog keeps shrinking. */
async function drain(lectureId: LectureId) {
  if (draining.has(lectureId)) return;
  draining.add(lectureId);
  const controller = new AbortController();
  try {
    for (let chunk = await nextAudio(lectureId); chunk; chunk = await nextAudio(lectureId)) {
      set({ backlog: await audioBacklog(lectureId) });
      const { raw } = await parakeetEngine.transcribeStored(chunk, controller.signal);
      if (raw.trim()) {
        const segment: Segment = { lectureId, seq: await allocSeq(lectureId), chunkSeq: chunk.seq, atMs: chunk.startMs, endMs: chunk.startMs + chunk.durationMs, raw: raw.trim() };
        await addSegment(segment);
        enqueue(segment);
      }
      await markTranscribed(lectureId, chunk.seq, now());
    }
    set({ backlog: 0 });
    await pruneAudio(lectureId);
  } catch (e) {
    set({ phase: { kind: "failed", reason: e instanceof EngineError ? e.reason : "runtime" } });
  } finally {
    draining.delete(lectureId);
  }
}

function warnOnLeave(e: BeforeUnloadEvent) {
  e.preventDefault();
}

async function stopRun(): Promise<Run | null> {
  const r = run;
  if (!r) return null;
  run = null;
  r.controller.abort();
  clearInterval(r.timer);
  window.removeEventListener("beforeunload", warnOnLeave);
  void r.wakeLock?.release().catch(() => undefined);
  await r.loop;
  closeMic(r.stream);
  return r;
}

async function start(lectureId: LectureId, engineId: EngineId): Promise<void> {
  const busy = state.phase.kind === "starting" || state.phase.kind === "preparing" || state.phase.kind === "stopping";
  if (busy || (run?.lectureId === lectureId && state.phase.kind === "running")) return;
  if (run) await pause();
  capped = false;
  set({ lectureId, engine: engineId, phase: { kind: "starting" }, partial: null, aiError: null, backlog: 0 });
  const lecture = await ensureLecture(lectureId, now());
  if (!lecture) {
    set({ phase: { kind: "failed", reason: "runtime" } });
    return;
  }
  const engine = ENGINES[engineId];
  const controller = new AbortController();
  let stream: MediaStream | null = null;
  try {
    if (engineId === "parakeet") {
      stream = await openMic();
      set({ phase: { kind: "preparing", loadedBytes: 0, totalBytes: engine.capabilities.needsDownloadBytes } });
      await engine.prepare((p) => set({ phase: { kind: "preparing", ...p } }), controller.signal);
      set({ backend: parakeetEngine.backend });
    }
  } catch (e) {
    closeMic(stream);
    set({ phase: { kind: "failed", reason: e instanceof MicError || e instanceof EngineError ? e.reason : "download" } });
    return;
  }
  if (lecture.state.status === "saved") await clearNotes(lectureId);
  const resumeAtMs = await markRecording(lectureId, engineId, now());
  const audioBase = await nextAudioSeq(lectureId);
  const source: EngineSource = engineId === "demo" ? { kind: "script", script: demoScriptFor(lectureId, resumeAtMs), resumeAtMs } : { kind: "mic", stream: stream!, resumeAtMs };
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  const wakeLock = await nav.wakeLock?.request("screen").catch(() => null);
  window.addEventListener("beforeunload", warnOnLeave);

  const loop = (async () => {
    try {
      for await (const ev of engine.run(source, controller.signal)) {
        if (ev.type === "partial") {
          if (!controller.signal.aborted) set({ partial: { atMs: ev.atMs, text: ev.text } });
        } else if (ev.type === "final") {
          const segment: Segment = { lectureId, seq: await allocSeq(lectureId), chunkSeq: ev.chunkSeq, atMs: ev.atMs, endMs: ev.endMs, raw: ev.raw };
          await addSegment(segment);
          enqueue(segment);
        } else if (ev.type === "audio") {
          await addAudio({ ...ev.chunk, seq: audioBase + ev.chunk.seq, lectureId });
          void drain(lectureId);
        }
      }
    } catch {
      if (!controller.signal.aborted) set({ phase: { kind: "failed", reason: "runtime" } });
    }
  })();
  run = { lectureId, engine: engineId, controller, loop, stream, timer: setInterval(() => void heartbeat(lectureId, now()), 5_000), wakeLock: wakeLock ?? null };
  set({ phase: { kind: "running" }, partial: { atMs: resumeAtMs, text: "" } });
}

async function pause(): Promise<void> {
  const r = run;
  if (!r || state.phase.kind !== "running") return;
  set({ phase: { kind: "stopping", to: "paused" } });
  await stopRun();
  await markStopped(r.lectureId, "paused", now());
  set({ phase: { kind: "idle" }, partial: null });
}

/**
 * Stops capture, keeps the half-heard demo line, lets pending cleanups land (at most 6 s), then saves.
 * The notes pass runs after, so the saved view opens at once and shows `Writing summary…`.
 */
async function end(lectureId: LectureId): Promise<void> {
  if (state.phase.kind === "stopping") return;
  set({ lectureId, phase: { kind: "stopping", to: "saved" } });
  const partial = state.partial;
  const r = run?.lectureId === lectureId ? await stopRun() : null;
  await markStopped(lectureId, "paused", now());
  if (r?.engine === "demo" && partial?.text) {
    const segment: Segment = { lectureId, seq: await allocSeq(lectureId), chunkSeq: -1, atMs: partial.atMs, endMs: partial.atMs + 1000, raw: partial.text };
    await addSegment(segment);
    enqueue(segment);
  }
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 6_000))]);
  await markStopped(lectureId, "saved", now());
  set({ phase: { kind: "idle" }, partial: null });
  void reindexSource(sourceKey.lecture(lectureId));
  void pruneAudio(lectureId);
  void ensureNotes(lectureId);
}

/** Idempotent: a second call while the pass runs, or once notes exist, does nothing. */
async function ensureNotes(lectureId: LectureId): Promise<void> {
  if (state.notes[lectureId]?.status === "writing") return;
  set({ notes: { ...state.notes, [lectureId]: { status: "writing" } } });
  try {
    await writeNotes(lectureId);
    const { [lectureId]: _done, ...rest } = state.notes;
    set({ notes: rest });
  } catch (e) {
    const error = e instanceof AiError ? e : new AiError("upstream", e instanceof Error ? e.message : String(e));
    set({ notes: { ...state.notes, [lectureId]: { status: "failed", error } } });
  }
}

async function toggleFlag(segment: Segment): Promise<void> {
  const at = fmtStamp(segment.atMs);
  if (segment.flag) {
    dismissedFor(segment.lectureId).add(segment.seq);
    await setFlag(segment.lectureId, segment.seq, undefined);
    set({ announcement: `Unflagged ${at}` });
  } else {
    await setFlag(segment.lectureId, segment.seq, { by: "user" });
    set({ announcement: `Flagged ${at}` });
  }
}

export const recorder = {
  start,
  pause,
  end,
  ensureNotes,
  toggleFlag,
  /** Clears a failure so the screen offers Start again. */
  reset: () => set({ phase: { kind: "idle" } }),
  isRunning: (lectureId: LectureId) => run?.lectureId === lectureId && state.phase.kind === "running",
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRecorder(): RecorderState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
