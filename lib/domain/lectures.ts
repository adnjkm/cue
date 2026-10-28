import type { Topic } from "./calendar";
import type { CourseId, EpochMs, EventId, LectureId, LinkId } from "./ids";
import type { LectureNotes } from "./payload/lectures";
import type { SourceRef } from "./sources";

export type EngineId = "parakeet" | "demo";

/** Written only by Lectures. `capturedMs` is audio captured before the current run began. */
export type LectureState =
  | { status: "ready" }
  | { status: "recording"; engine: EngineId; since: EpochMs; capturedMs: number; heartbeatAt: EpochMs }
  | { status: "paused"; engine: EngineId; capturedMs: number }
  | { status: "saved"; savedAt: EpochMs; capturedMs: number };

export interface Lecture {
  id: LectureId;
  courseId: CourseId;
  eventId?: EventId;
  number?: number;
  topic?: Topic;
  professor?: string;
  /** Slot length minus prefs.lectureStartsPastMin: "of 50:00". */
  scheduledMs: number;
  state: LectureState;
  /** Missing after save = the notes pass is pending. */
  notes?: LectureNotes;
  updatedAt: EpochMs;
}

/** The recorder writes heartbeatAt every 5 s, so 15 s of silence means the tab closed or crashed. */
export const HEARTBEAT_STALE_MS = 15_000;

export type LectureLive = LectureState["status"] | "interrupted";

export function lectureLive(l: Lecture, now: EpochMs): LectureLive {
  if (l.state.status === "recording" && now - l.state.heartbeatAt > HEARTBEAT_STALE_MS) return "interrupted";
  return l.state.status;
}

export function lectureElapsedMs(l: Lecture, now: EpochMs): number {
  const s = l.state;
  switch (s.status) {
    case "ready":
      return 0;
    case "paused":
    case "saved":
      return s.capturedMs;
    case "recording": {
      const until = lectureLive(l, now) === "interrupted" ? s.heartbeatAt : now;
      return s.capturedMs + Math.max(0, until - s.since);
    }
  }
}

export interface AssessmentMention {
  /** "Term Test 2". */
  label: string;
  eventId?: EventId;
}

export interface Segment {
  lectureId: LectureId;
  seq: number;
  /** The audio chunk it came from. */
  chunkSeq: number;
  atMs: number;
  endMs: number;
  /** Engine output, lower case for CTC. */
  raw: string;
  /** Missing = cleanup pending or failed; the line shows `raw`. */
  text?: string;
  flag?: { by: "model"; assessment: AssessmentMention | null } | { by: "user" };
}

export interface RelatedLink {
  /** Hash of (lectureId, target), so a repeated mention dedupes. */
  id: LinkId;
  lectureId: LectureId;
  atMs: number;
  target: SourceRef;
  /** "Problem Set 5, Q3–Q6". */
  title: string;
  /** "Due Thursday · same technique". */
  meta: string;
  why: "hint" | "mention" | "similar";
}

/** Durable transcription queue: 16 kHz mono 16-bit WAV per cut. Deleted once the lecture is saved and fully transcribed. */
export interface AudioChunk {
  lectureId: LectureId;
  seq: number;
  startMs: number;
  durationMs: number;
  wav: Blob;
  transcribedAt?: EpochMs;
}

export interface DemoScript {
  lines: readonly { atMs: number; raw: string }[];
  partialEveryMs: number;
}

export type EngineSource =
  | { kind: "mic"; stream: MediaStream; resumeAtMs: number }
  | { kind: "script"; script: DemoScript; resumeAtMs: number };

export type EngineEvent =
  /** Only when capabilities.partials: Parakeet re-decodes the open buffer every 3 s on WebGPU; never on WASM. */
  | { type: "partial"; atMs: number; text: string }
  | { type: "final"; chunkSeq: number; atMs: number; endMs: number; raw: string }
  | { type: "audio"; chunk: Omit<AudioChunk, "lectureId" | "transcribedAt"> }
  | { type: "level"; rms: number };

/** Pause aborts run(); resume calls run() again with resumeAtMs, so there are no pause methods to keep in sync. */
export interface TranscriptionEngine {
  readonly id: EngineId;
  readonly capabilities: { partials: boolean; needsDownloadBytes: number };
  prepare(onProgress: (p: { loadedBytes: number; totalBytes: number }) => void, signal: AbortSignal): Promise<void>;
  run(source: EngineSource, signal: AbortSignal): AsyncIterable<EngineEvent>;
  /** Re-transcribe a stored chunk (queue drain after a reload or a slow WASM backlog). */
  transcribeStored(chunk: AudioChunk, signal: AbortSignal): Promise<{ raw: string }>;
}

export type EngineState =
  | { status: "idle" }
  | { status: "preparing"; loadedBytes: number; totalBytes: number }
  | { status: "ready" }
  | { status: "running" }
  | { status: "stopped" }
  | { status: "failed"; reason: "noBackend" | "download" | "runtime" | "micDenied" };
