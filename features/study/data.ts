"use client";

import { useSyncExternalStore } from "react";
import { ai, AiError } from "@/lib/ai";
import { db, useLive } from "@/lib/db";
import {
  focusMinutes,
  ids,
  sessionTransitions,
  type AskMode,
  type BlockId,
  type EpochMs,
  type Interval,
  type LectureId,
  type PomodoroPrefs,
  type SessionPlan,
  type StudyBlock,
  type StudySession,
  type Zone,
} from "@/lib/domain";
import { usePlan } from "@/lib/plan";
import { buildPlan, finishSession, type Advance, type ViewerState } from "./model";
import { blockMinutes, gatherSources, planContext, planInput, type SessionSources } from "./sources";

export type Job<T> = { status: "pending" } | { status: "ready"; value: T } | { status: "error"; error: AiError };

/**
 * In-flight work keyed by block id, outside React so a remount or a second tab of the same screen joins the
 * running call instead of starting another. Nothing here is persisted: a reload restarts it.
 */
function jobStore<T>() {
  const jobs = new Map<string, Job<T>>();
  const promises = new Map<string, Promise<T>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: (key: string): Job<T> | undefined => jobs.get(key),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    run(key: string, fn: () => Promise<T>, opts?: { retry?: boolean }): Promise<T> {
      const running = promises.get(key);
      if (running && !(opts?.retry && jobs.get(key)?.status === "error")) return running;
      const p = fn();
      promises.set(key, p);
      jobs.set(key, { status: "pending" });
      emit();
      p.then(
        (value) => {
          if (promises.get(key) !== p) return;
          jobs.set(key, { status: "ready", value });
          emit();
        },
        (e: unknown) => {
          if (promises.get(key) !== p) return;
          jobs.set(key, { status: "error", error: e instanceof AiError ? e : new AiError("upstream", e instanceof Error ? e.message : String(e)) });
          emit();
        },
      );
      return p;
    },
  };
}

const sourcesJobs = jobStore<SessionSources>();
const planJobs = jobStore<SessionPlan>();

export function useSourcesJob(blockId: BlockId): Job<SessionSources> | undefined {
  return useSyncExternalStore(sourcesJobs.subscribe, () => sourcesJobs.get(blockId), () => undefined);
}

export function usePlanJob(blockId: BlockId): Job<SessionPlan> | undefined {
  return useSyncExternalStore(planJobs.subscribe, () => planJobs.get(blockId), () => undefined);
}

export function loadSources(block: StudyBlock): Promise<SessionSources> {
  return sourcesJobs.run(block.id, () => gatherSources(block));
}

/** Generates the plan in memory; a started session without a plan gets it written once it settles. */
export function loadPlan(block: StudyBlock, pomodoro: PomodoroPrefs, opts?: { retry?: boolean }): void {
  planJobs
    .run(
      block.id,
      async () => {
        const sources = await loadSources(block);
        const draft = await ai("study.plan", planInput(block, sources, pomodoro));
        const plan = buildPlan(draft, planContext(sources, Math.max(3, focusMinutes(blockMinutes(block), pomodoro))));
        await db.transaction("rw", db.sessions, async () => {
          const row = await db.sessions.get(block.id);
          if (row && !row.plan) await db.sessions.put({ ...row, plan, updatedAt: Date.now() as EpochMs });
        });
        return plan;
      },
      opts,
    )
    .catch(() => undefined);
}

const EVERYTHING: Interval = { start: 0 as EpochMs, end: 8_640_000_000_000_000 as EpochMs };

/** The block from the derived plan; a session whose anchor left the calendar still opens from its snapshot. */
export function useStudyBlock(id: BlockId, session: StudySession | null | undefined): { block: StudyBlock; zone: Zone } | null | undefined {
  const plan = usePlan(EVERYTHING);
  if (!plan || session === undefined) return undefined;
  const block = plan.blocks.find((b) => b.id === id);
  if (block) return { block, zone: plan.zone };
  return session ? { zone: plan.zone, block: blockFromSession(session) } : null;
}

export function blockFromSession(s: StudySession): StudyBlock {
  return { id: s.id, anchor: s.anchor, start: s.planned.start, end: s.planned.end, courseId: s.courseId, topic: s.topic, why: { offsetDays: 0 }, placement: "locked" };
}

/**
 * The number of the lecture a review follows, read before the screen paints so the chat's heading and
 * placeholder never switch under the student. undefined until it is known for this block.
 */
export function useReviewLecture(block: StudyBlock | undefined): { number: number | null } | undefined {
  const event = block?.anchor.kind === "review" ? block.anchor.lecture : null;
  const found = useLive(async () => {
    if (!event) return { event, number: null };
    const lecture = await db.lectures.get(ids.lectureForEvent(event));
    const calendar = lecture?.number === undefined ? await db.events.get(event) : undefined;
    return { event, number: lecture?.number ?? (calendar?.kind === "lecture" ? calendar.number : undefined) ?? null };
  }, [event]);
  return found && found.event === event ? { number: found.number } : undefined;
}

/** undefined while IndexedDB answers, null when the block was never started. */
export function useSessionRow(id: BlockId): StudySession | null | undefined {
  const found = useLive(async () => ({ row: (await db.sessions.get(id)) ?? null }), [id]);
  return found?.row;
}

/** On the whole second, the grid useNow ticks on, so a countdown never reads one second high. */
const now = () => (Math.floor(Date.now() / 1000) * 1000) as EpochMs;

async function change(id: BlockId, fn: (s: StudySession, at: EpochMs) => StudySession): Promise<StudySession | undefined> {
  return db.transaction("rw", db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return undefined;
    const next = fn(s, now());
    if (next !== s) await db.sessions.put(next);
    return next;
  });
}

function withViewer(s: StudySession, viewer: ViewerState | undefined, at: EpochMs): StudySession {
  if (!viewer) return s;
  const ref = viewer[viewer.tab];
  return { ...s, viewer: { tab: viewer.tab, ...(ref ? { ref } : {}) }, updatedAt: at };
}

/** The only writer of `sessions`. Every action is a pure transition in one transaction, so double clicks are no-ops. */
export const sessionActions = {
  start: async (block: StudyBlock, opts: { lectureId?: LectureId; plan?: SessionPlan; mode: AskMode }): Promise<void> => {
    await db.transaction("rw", db.sessions, async () => {
      if (await db.sessions.get(block.id)) return;
      await db.sessions.put(sessionTransitions.start(block, now(), opts));
    });
  },
  pause: (id: BlockId) => change(id, sessionTransitions.pause),
  resume: (id: BlockId) => change(id, sessionTransitions.resume),
  gotoStep: (id: BlockId, step: number, viewer?: ViewerState) =>
    change(id, (s, at) => {
      const next = sessionTransitions.gotoStep(s, step, at);
      return next === s ? s : withViewer(next, viewer, at);
    }),
  /** Takes the kind the button showed, so a click lands as labelled even on the second time runs out. */
  advance: (id: BlockId, kind: Advance, viewer?: ViewerState) =>
    change(id, (s, at) => {
      if (kind === "finish") return finishSession(s, at);
      const next = sessionTransitions.nextStep(s, at);
      return next === s ? s : withViewer(next, viewer, at);
    }),
  end: (id: BlockId) => change(id, sessionTransitions.end),
  setMode: (id: BlockId, mode: AskMode) => change(id, (s, at) => (s.mode === mode ? s : { ...s, mode, updatedAt: at })),
  setViewer: (id: BlockId, viewer: ViewerState) =>
    change(id, (s, at) => {
      const ref = viewer[viewer.tab];
      if (s.viewer.tab === viewer.tab && JSON.stringify(s.viewer.ref) === JSON.stringify(ref)) return s;
      return withViewer(s, viewer, at);
    }),
};
