"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { lectureLive, sessionElapsedMs, type EpochMs, type Lecture, type LectureLive, type StudySession } from "@/lib/domain";
import { db } from "./db";

/** Dexie liveQuery as a hook; undefined until the first answer. */
export function useLive<T>(query: () => Promise<T> | T, deps: readonly unknown[]): T | undefined {
  return useLiveQuery(query, [...deps]);
}

export interface LiveActivity {
  recording?: { lecture: Lecture; live: LectureLive };
  session?: { session: StudySession; leftMs: number };
}

/** Shell badges read the database, never feature code. */
export function useLiveActivity(now: EpochMs): LiveActivity | undefined {
  const rows = useLive(
    async () => ({
      lectures: await db.lectures.where("state.status").equals("recording").toArray(),
      sessions: await db.sessions.where("state.status").anyOf("running", "paused").toArray(),
    }),
    [],
  );
  if (!rows) return undefined;
  const activity: LiveActivity = {};
  const lecture = rows.lectures.find((l) => lectureLive(l, now) === "recording") ?? rows.lectures[0];
  if (lecture) activity.recording = { lecture, live: lectureLive(lecture, now) };
  const session = rows.sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (session) activity.session = { session, leftMs: session.minutes * 60_000 - sessionElapsedMs(session.state, now) };
  return activity;
}
