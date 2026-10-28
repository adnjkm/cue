import { ids, isTimed, type CourseId, type EventId, type StudySession } from "@/lib/domain";
import type { SampleFragment } from "./context";
import { sampleAuthoredBlocks, sampleEvents } from "./calendar";

/** Every authored block that ended before now has a completed session, so October reads as done, not missed. */
export const studySample: SampleFragment<"sessions"> = (ctx) => {
  const courseOf = new Map<EventId, CourseId>();
  for (const e of sampleEvents(ctx)) if ("courseId" in e && (isTimed(e) || e.kind === "deadline")) courseOf.set(e.id, e.courseId);
  const sessions: StudySession[] = sampleAuthoredBlocks(ctx)
    .filter((b) => b.at.end <= ctx.now)
    .map((b) => {
      const a = b.anchor;
      const courseId =
        a.kind === "review" ? (courseOf.get(a.lecture) ?? null) : a.kind === "testPrep" ? (courseOf.get(a.test) ?? null) : a.kind === "work" ? (courseOf.get(a.deadline) ?? null) : a.kind === "midweek" ? a.course : a.kind === "custom" ? a.course : null;
      return {
        id: ids.block(a),
        anchor: a,
        planned: b.at,
        courseId,
        topic: b.topic,
        minutes: Math.round((b.at.end - b.at.start) / 60_000),
        ...(a.kind === "review" ? { lectureId: ids.lectureForEvent(a.lecture) } : {}),
        state: { status: "completed", startedAt: b.at.start, endedAt: b.at.end, pausedMs: 0 },
        step: 0,
        stepSince: 0,
        stepsDone: [],
        mode: "quick",
        viewer: { tab: "slides" },
        createdAt: b.at.start,
        updatedAt: b.at.end,
      };
    });
  return { sessions };
};
