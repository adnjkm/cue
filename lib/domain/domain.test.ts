import { describe, expect, it } from "vitest";
import {
  DEFAULT_POMODORO,
  focusMinutes,
  gradeOf,
  ingestStatus,
  lectureElapsedMs,
  lectureLive,
  sectionStale,
  sessionClock,
  sessionTransitions,
  type BlockId,
  type CourseId,
  type EpochMs,
  type EventId,
  type Lecture,
  type LectureId,
  type Material,
  type MaterialId,
  type SessionPlan,
  type StudyBlock,
  type GuideSection,
  type SectionId,
  type ChapterId,
} from "@/lib/domain";

const T0 = Date.parse("2026-10-27T14:30:00Z") as EpochMs;
const min = (n: number) => n * 60_000;
const sec = (n: number) => n * 1000;
const at = (ms: number) => (T0 + ms) as EpochMs;

const block: StudyBlock = {
  id: "review.evt_sample_csc148_l08.2" as BlockId,
  anchor: { kind: "review", lecture: "evt_sample_csc148_l08" as EventId, n: 2 },
  courseId: "CSC148" as CourseId,
  topic: { full: "Recursion & tree traversal", short: "Recursion" },
  start: T0,
  end: at(min(45)),
  why: { offsetDays: 1 },
  placement: "authored",
};
const plan: SessionPlan = {
  steps: [
    { title: "Cold recall", kind: "recall", minutes: 5 },
    { title: "Re-read key slides", kind: "reread", minutes: 8 },
    { title: "Explain it back", kind: "explain", minutes: 10 },
    { title: "Practice questions", kind: "practice", minutes: 10 },
    { title: "Flag what’s fuzzy", kind: "reflect", minutes: 7 },
  ],
};

describe("study session clock", () => {
  const started = sessionTransitions.start(block, T0, { plan, mode: "quick" });

  it("derives time left and the bar fraction from timestamps", () => {
    const c = sessionClock(started, at(min(13) + sec(12)), DEFAULT_POMODORO);
    expect(c.leftMs).toBe(min(31) + sec(48));
    expect(Math.round(c.fraction * 100)).toBe(29);
    expect(c.phase).toBe("focus");
    expect(c.phaseLeftMs).toBe(min(11) + sec(48));
  });

  it("derives Pomodoro breaks inside the block and the over state", () => {
    expect(sessionClock(started, at(min(27)), DEFAULT_POMODORO)).toMatchObject({ phase: "break", phaseLeftMs: min(3) });
    expect(sessionClock(started, at(min(46)), DEFAULT_POMODORO)).toMatchObject({ phase: "over", leftMs: -min(1) });
    expect(focusMinutes(45, DEFAULT_POMODORO)).toBe(40);
    expect(focusMinutes(120, DEFAULT_POMODORO)).toBe(100);
  });

  it("does not count paused time, and pausing twice is a no-op", () => {
    const paused = sessionTransitions.pause(started, at(min(10)));
    expect(sessionTransitions.pause(paused, at(min(11)))).toBe(paused);
    const resumed = sessionTransitions.resume(paused, at(min(15)));
    expect(sessionTransitions.resume(resumed, at(min(16)))).toBe(resumed);
    expect(sessionClock(resumed, at(min(20)), DEFAULT_POMODORO).elapsedMs).toBe(min(15));
    expect(sessionClock(paused, at(min(40)), DEFAULT_POMODORO).elapsedMs).toBe(min(10));
  });

  it("reports step overrun and clamps step moves", () => {
    const step2 = sessionTransitions.nextStep(started, at(min(5)));
    expect(step2).toMatchObject({ step: 1, stepsDone: [0], stepSince: min(5) });
    expect(sessionClock(step2, at(min(14)), DEFAULT_POMODORO).stepOverMs).toBe(min(1));
    expect(sessionTransitions.gotoStep(step2, 99, at(min(6))).step).toBe(4);
    expect(sessionTransitions.gotoStep(step2, 1, at(min(6)))).toBe(step2);
  });

  it("completes after the last step and ends early otherwise", () => {
    let s = started;
    for (let i = 0; i < 5; i++) s = sessionTransitions.nextStep(s, at(min(8 * (i + 1))));
    expect(s.state).toMatchObject({ status: "completed", endedAt: at(min(40)) });
    expect(sessionTransitions.end(s, at(min(41)))).toBe(s);
    expect(sessionTransitions.end(started, at(min(3))).state.status).toBe("ended");
  });
});

describe("lecture liveness", () => {
  const lecture: Lecture = {
    id: "lec.evt_sample_mat137_tue" as LectureId,
    courseId: "MAT137" as CourseId,
    scheduledMs: min(50),
    state: { status: "recording", engine: "demo", since: T0, capturedMs: min(37) + sec(30), heartbeatAt: at(sec(40)) },
    updatedAt: T0,
  };

  it("reads a stale heartbeat as interrupted and freezes elapsed time there", () => {
    expect(lectureLive(lecture, at(sec(42)))).toBe("recording");
    expect(lectureElapsedMs(lecture, at(sec(42)))).toBe(min(38) + sec(12));
    expect(lectureLive(lecture, at(sec(56)))).toBe("interrupted");
    expect(lectureElapsedMs(lecture, at(min(5)))).toBe(min(38) + sec(10));
  });
});

describe("derived grades, staleness and ingest status", () => {
  it("grades from the answer key", () => {
    expect(gradeOf({ key: { source: "model", answer: "B" } }, undefined)).toEqual({ status: "unanswered" });
    expect(gradeOf({ key: { source: "none" } }, { choice: "C" })).toEqual({ status: "checking", choice: "C" });
    expect(gradeOf({ key: { source: "document", answer: "B" } }, { choice: "B" })).toEqual({ status: "answered", choice: "B", correct: true });
  });

  it("marks a guide section stale when newer material exists", () => {
    const section: GuideSection = {
      id: "ECO101.price-elasticity-of-demand" as SectionId,
      courseId: "ECO101" as CourseId,
      chapterId: "elasticity" as ChapterId,
      order: 1,
      title: "Price elasticity of demand",
      draft: { blocks: [], footnotes: [], plainText: "", generatedAt: T0, sourceStamp: T0 },
    };
    expect(sectionStale(section, { stamp: T0 })).toEqual({ stale: false });
    expect(sectionStale(section, { stamp: at(1), newest: { label: "Lecture 8 slides", at: at(1) } })).toEqual({ stale: true, because: "Lecture 8 slides added" });
  });

  it("derives ingest status from page rows", () => {
    const material = { id: "mat_x" as MaterialId, pageCount: 3 } as Material;
    expect(ingestStatus(material, [{ index: 1, readBy: "textLayer" }])).toEqual({ status: "pending", read: 1, total: 3 });
    expect(ingestStatus(material, [1, 2, 3].map((index) => ({ index, readBy: index === 2 ? "failed" : "vision" })))).toEqual({ status: "partial", read: 2, failed: 1, total: 3 });
    expect(ingestStatus(material, [1, 2, 3].map((index) => ({ index, readBy: "sample" })))).toEqual({ status: "ready" });
  });
});
