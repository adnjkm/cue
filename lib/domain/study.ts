import type { Topic } from "./calendar";
import type { BlockAnchor, BlockId, CourseId, EpochMs, LectureId } from "./ids";
import type { SessionPlan } from "./payload/study";
import type { StudyBlock } from "./plan";
import type { SourceRef } from "./sources";
import type { Interval } from "./time";

export type AskMode = "quick" | "deep";
export type StepKind = "recall" | "reread" | "explain" | "practice" | "reflect";
export type ViewerTab = "slides" | "transcript" | "textbook" | "handout";

/** Timer as timestamps. Time left is derived, so nothing ticks into the database. */
export type SessionState =
  | { status: "running"; startedAt: EpochMs; pausedMs: number }
  | { status: "paused"; startedAt: EpochMs; pausedAt: EpochMs; pausedMs: number }
  | { status: "completed"; startedAt: EpochMs; endedAt: EpochMs; pausedMs: number }
  | { status: "ended"; startedAt: EpochMs; endedAt: EpochMs; pausedMs: number };

/** Exists only once a block is started. Written only by Study. Opening /study/[blockId] twice finds this row. */
export interface StudySession {
  id: BlockId;
  /** Snapshot of the block, so history survives calendar changes and schedule() can lock it in place. */
  anchor: BlockAnchor;
  planned: Interval;
  courseId: CourseId | null;
  topic: Topic;
  minutes: number;
  lectureId?: LectureId;
  /** Missing = not generated yet. Generation runs in memory and restarts after a reload. */
  plan?: SessionPlan;
  state: SessionState;
  /** Index into plan.steps; transitions clamp it to the plan's length. */
  step: number;
  /** Elapsed ms when the current step began, for "Over by 1 min". */
  stepSince: number;
  stepsDone: readonly number[];
  mode: AskMode;
  viewer: { tab: ViewerTab; ref?: SourceRef };
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface PomodoroPrefs {
  focusMin: number;
  breakMin: number;
}

export const DEFAULT_POMODORO: PomodoroPrefs = { focusMin: 25, breakMin: 5 };

export interface SessionClock {
  elapsedMs: number;
  /** Negative when over. */
  leftMs: number;
  /** 0..1, the 160px bar. */
  fraction: number;
  phase: "focus" | "break" | "over";
  /** "Break · 4:12 left". */
  phaseLeftMs: number;
  /** > 0: "Over by 1 min". */
  stepOverMs: number;
}

const MIN = 60_000;

export function sessionElapsedMs(state: SessionState, now: EpochMs): number {
  switch (state.status) {
    case "running":
      return Math.max(0, now - state.startedAt - state.pausedMs);
    case "paused":
      return Math.max(0, state.pausedAt - state.startedAt - state.pausedMs);
    case "completed":
    case "ended":
      return Math.max(0, state.endedAt - state.startedAt - state.pausedMs);
  }
}

/** Focus minutes inside a block of `minutes`: 45 with 25/5 cycles is 25 + 15 = 40. Plan steps sum to this. */
export function focusMinutes(minutes: number, pomodoro: PomodoroPrefs): number {
  const cycle = pomodoro.focusMin + pomodoro.breakMin;
  const full = Math.floor(minutes / cycle);
  return full * pomodoro.focusMin + Math.min(pomodoro.focusMin, minutes - full * cycle);
}

/** Pure. Pomodoro phase from elapsed time: focus/break cycles inside the block. */
export function sessionClock(s: StudySession, now: EpochMs, pomodoro: PomodoroPrefs): SessionClock {
  const totalMs = s.minutes * MIN;
  const elapsedMs = sessionElapsedMs(s.state, now);
  const leftMs = totalMs - elapsedMs;
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalMs)) : 1;
  const stepMs = (s.plan?.steps[s.step]?.minutes ?? 0) * MIN;
  const stepOverMs = stepMs > 0 ? Math.max(0, elapsedMs - s.stepSince - stepMs) : 0;
  if (leftMs <= 0) return { elapsedMs, leftMs, fraction, phase: "over", phaseLeftMs: 0, stepOverMs };
  const focusMs = pomodoro.focusMin * MIN;
  const cycleMs = focusMs + pomodoro.breakMin * MIN;
  const pos = cycleMs > 0 ? elapsedMs % cycleMs : 0;
  const phase = pos < focusMs ? "focus" : "break";
  const phaseLeftMs = Math.min(leftMs, phase === "focus" ? focusMs - pos : cycleMs - pos);
  return { elapsedMs, leftMs, fraction, phase, phaseLeftMs, stepOverMs };
}

function touch(s: StudySession, now: EpochMs, patch: Partial<StudySession>): StudySession {
  return { ...s, ...patch, updatedAt: now };
}

function isOpen(s: StudySession): boolean {
  return s.state.status === "running" || s.state.status === "paused";
}

/** Pure transitions; each returns the same object when it does not apply, so double clicks and retries are safe. */
export const sessionTransitions = {
  start: (block: StudyBlock, now: EpochMs, opts: { lectureId?: LectureId; plan?: SessionPlan; mode: AskMode }): StudySession => ({
    id: block.id,
    anchor: block.anchor,
    planned: { start: block.start, end: block.end },
    courseId: block.courseId,
    topic: block.topic,
    minutes: Math.round((block.end - block.start) / MIN),
    ...(opts.lectureId ? { lectureId: opts.lectureId } : {}),
    ...(opts.plan ? { plan: opts.plan } : {}),
    state: { status: "running", startedAt: now, pausedMs: 0 },
    step: 0,
    stepSince: 0,
    stepsDone: [],
    mode: opts.mode,
    viewer: { tab: "slides" },
    createdAt: now,
    updatedAt: now,
  }),
  pause: (s: StudySession, now: EpochMs): StudySession =>
    s.state.status === "running" ? touch(s, now, { state: { status: "paused", startedAt: s.state.startedAt, pausedAt: now, pausedMs: s.state.pausedMs } }) : s,
  resume: (s: StudySession, now: EpochMs): StudySession =>
    s.state.status === "paused"
      ? touch(s, now, { state: { status: "running", startedAt: s.state.startedAt, pausedMs: s.state.pausedMs + Math.max(0, now - s.state.pausedAt) } })
      : s,
  gotoStep: (s: StudySession, step: number, now: EpochMs): StudySession => {
    const last = (s.plan?.steps.length ?? 1) - 1;
    const next = Math.min(Math.max(0, Math.trunc(step)), Math.max(0, last));
    if (!isOpen(s) || next === s.step) return s;
    return touch(s, now, { step: next, stepSince: sessionElapsedMs(s.state, now) });
  },
  nextStep: (s: StudySession, now: EpochMs): StudySession => {
    if (!isOpen(s)) return s;
    const stepsDone = s.stepsDone.includes(s.step) ? s.stepsDone : [...s.stepsDone, s.step].sort((a, b) => a - b);
    const count = s.plan?.steps.length ?? 0;
    if (s.step >= count - 1) return sessionTransitions.end(touch(s, now, { stepsDone }), now);
    return touch(s, now, { step: s.step + 1, stepsDone, stepSince: sessionElapsedMs(s.state, now) });
  },
  /** Completed when every step is done, else ended. */
  end: (s: StudySession, now: EpochMs): StudySession => {
    if (!isOpen(s)) return s;
    const count = s.plan?.steps.length ?? 0;
    const allDone = count > 0 && s.stepsDone.length >= count;
    const pausedMs = s.state.status === "paused" ? s.state.pausedMs + Math.max(0, now - s.state.pausedAt) : s.state.pausedMs;
    return touch(s, now, { state: { status: allDone ? "completed" : "ended", startedAt: s.state.startedAt, endedAt: now, pausedMs } });
  },
} as const;
