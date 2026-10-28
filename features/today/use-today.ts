"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ai, type TaskInput } from "@/lib/ai";
import { db, useLive } from "@/lib/db";
import type { BlockId, BlockMaterials, CalendarEvent, EventId, Lecture, StudyBlock, StudySession } from "@/lib/domain";
import { blockMaterials } from "@/lib/plan";

export interface TodayFacts {
  /** The id set these facts were read for; a stale answer keeps rendering while the new one loads. */
  key: string;
  lectures: ReadonlyMap<EventId, Lecture>;
  sessions: ReadonlyMap<BlockId, StudySession>;
  materials: ReadonlyMap<BlockId, BlockMaterials>;
  tests: ReadonlyMap<EventId, Extract<CalendarEvent, { kind: "test" }>>;
}

/** Everything Today shows beside the plan, read in one live query keyed by the ids on screen. */
export function useTodayFacts(blocks: readonly StudyBlock[], lectureEvents: readonly EventId[]): TodayFacts | undefined {
  const blockIds = blocks.map((b) => b.id);
  const testIds = [...new Set(blocks.flatMap((b) => (b.why.boostedBy ? [b.why.boostedBy.test] : [])))];
  const key = JSON.stringify([blockIds, lectureEvents, testIds]);
  return useLive(async () => {
    const [lectures, sessions, materials, tests] = await Promise.all([
      lectureEvents.length ? db.lectures.where("eventId").anyOf(lectureEvents).toArray() : [],
      db.sessions.bulkGet(blockIds),
      Promise.all(blocks.map(async (b) => [b.id, await blockMaterials(b)] as const)),
      db.events.bulkGet(testIds),
    ]);
    return {
      key,
      lectures: new Map(lectures.flatMap((l) => (l.eventId ? [[l.eventId, l] as const] : []))),
      sessions: new Map(sessions.flatMap((s) => (s ? [[s.id, s] as const] : []))),
      materials: new Map(materials),
      tests: new Map(tests.flatMap((e) => (e?.kind === "test" ? [[e.id, e] as const] : []))),
    };
  }, [key]);
}

type BriefInput = TaskInput<"today.brief">;
type Entry = { state: "pending" } | { state: "ready"; subline: string } | { state: "failed" };

/** One answer per distinct input for the life of the tab, so returning to Today never asks again. */
const answers = new Map<string, Entry>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The model's rewording of the rule-based subline, or null while it is pending or after it failed.
 * Never blocks render and never shows an error: Today keeps the rule text.
 */
export function useBriefSubline(input: BriefInput | null): string | null {
  const key = input ? JSON.stringify(input) : "";
  const entry = useSyncExternalStore(
    subscribe,
    () => answers.get(key),
    () => undefined,
  );
  useEffect(() => {
    if (!input || answers.has(key)) return;
    answers.set(key, { state: "pending" });
    ai("today.brief", input)
      .then((out) => answers.set(key, { state: "ready", subline: out.subline }))
      .catch(() => answers.set(key, { state: "failed" }))
      .finally(notify);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized input
  }, [key]);
  return entry?.state === "ready" ? entry.subline : null;
}
