"use client";

import { db } from "@/lib/db";
import {
  ids,
  lectureElapsedMs,
  parseId,
  type AudioChunk,
  type CourseId,
  type EngineId,
  type EpochMs,
  type EventId,
  type Lecture,
  type LectureId,
  type LectureNotes,
  type RelatedLink,
  type Segment,
  type Topic,
} from "@/lib/domain";
import { readPrefs } from "@/lib/prefs";
import { cardKey } from "./hints";

const MIN = 60_000;

/** The id of the calendar event behind `lec.<eventId>`, or null for an ad hoc lecture. */
export function eventIdOf(id: LectureId): EventId | null {
  return id.startsWith("lec.adhoc.") ? null : (id.slice(4) as EventId);
}

/** A lecture with no row yet, read from its calendar event: what the ready screen shows before Start. */
export async function draftLecture(id: LectureId, now: EpochMs): Promise<Lecture | null> {
  const eventId = eventIdOf(id);
  if (!eventId || !parseId.lecture(id)) return null;
  const event = await db.events.get(eventId);
  if (!event || event.kind !== "lecture") return null;
  const [course, prefs] = await Promise.all([db.courses.get(event.courseId), readPrefs("foundation")]);
  return {
    id,
    courseId: event.courseId,
    eventId,
    ...(event.number !== undefined ? { number: event.number } : {}),
    ...(event.topic ? { topic: event.topic } : {}),
    ...(course?.instructor ? { professor: course.instructor } : {}),
    scheduledMs: Math.max(MIN, event.end - event.start - prefs.plan.lectureStartsPastMin * MIN),
    state: { status: "ready" },
    updatedAt: now,
  };
}

/** The row for `id`, created from its event the first time it is needed. Idempotent. */
export async function ensureLecture(id: LectureId, now: EpochMs): Promise<Lecture | null> {
  const existing = await db.lectures.get(id);
  if (existing) return existing;
  const draft = await draftLecture(id, now);
  if (!draft) return null;
  await db.lectures.add(draft).catch(() => undefined);
  return (await db.lectures.get(id)) ?? null;
}

/** "Record a lecture" for a course with no event: 50 minutes, like a scheduled slot. */
export async function createAdhocLecture(courseId: CourseId, topic: Topic | null, now: EpochMs): Promise<LectureId> {
  const id = ids.adhocLecture();
  const course = await db.courses.get(courseId);
  await db.lectures.put({
    id,
    courseId,
    ...(topic ? { topic } : {}),
    ...(course?.instructor ? { professor: course.instructor } : {}),
    scheduledMs: 50 * MIN,
    state: { status: "ready" },
    updatedAt: now,
  });
  return id;
}

/** Recording from any earlier state; the clock continues from what was captured before. */
export async function markRecording(id: LectureId, engine: EngineId, now: EpochMs): Promise<number> {
  return db.transaction("rw", db.lectures, async () => {
    const l = await db.lectures.get(id);
    if (!l) throw new Error(`No lecture ${id}`);
    const capturedMs = lectureElapsedMs(l, now);
    await db.lectures.update(id, { state: { status: "recording", engine, since: now, capturedMs, heartbeatAt: now }, updatedAt: now });
    return capturedMs;
  });
}

export async function heartbeat(id: LectureId, now: EpochMs): Promise<void> {
  await db.transaction("rw", db.lectures, async () => {
    const l = await db.lectures.get(id);
    if (l?.state.status === "recording") await db.lectures.update(id, { state: { ...l.state, heartbeatAt: now } });
  });
}

/** Paused or saved, with the captured time frozen. Pausing a paused lecture changes nothing. */
export async function markStopped(id: LectureId, to: "paused" | "saved", now: EpochMs): Promise<void> {
  await db.transaction("rw", db.lectures, async () => {
    const l = await db.lectures.get(id);
    if (!l || l.state.status === to) return;
    const capturedMs = lectureElapsedMs(l, now);
    const engine = l.state.status === "recording" || l.state.status === "paused" ? l.state.engine : "demo";
    await db.lectures.update(id, {
      state: to === "paused" ? { status: "paused", engine, capturedMs } : { status: "saved", savedAt: now, capturedMs },
      updatedAt: now,
    });
  });
}

export async function saveNotes(id: LectureId, notes: LectureNotes, topic: Topic | null): Promise<void> {
  await db.transaction("rw", db.lectures, async () => {
    const l = await db.lectures.get(id);
    if (!l) return;
    await db.lectures.update(id, { notes, ...(topic && !l.topic ? { topic } : {}), updatedAt: notes.generatedAt });
  });
}

/** Continue recording drops the old notes: the next save writes them for the whole lecture. */
export async function clearNotes(id: LectureId): Promise<void> {
  await db.lectures.where("id").equals(id).modify((l) => {
    delete l.notes;
  });
}

export async function nextSeq(lectureId: LectureId): Promise<number> {
  const keys = (await db.segments.where("lectureId").equals(lectureId).primaryKeys()) as unknown as [LectureId, number][];
  return keys.reduce((n, [, seq]) => Math.max(n, seq + 1), 0);
}

export async function addSegment(segment: Segment): Promise<void> {
  await db.segments.put(segment);
}

export async function setSegmentText(lectureId: LectureId, seq: number, text: string): Promise<void> {
  await db.segments.update([lectureId, seq], { text });
}

export async function setFlag(lectureId: LectureId, seq: number, flag: Segment["flag"]): Promise<void> {
  await db.segments
    .where("[lectureId+seq]")
    .equals([lectureId, seq])
    .modify((s) => {
      if (flag) s.flag = flag;
      else delete s.flag;
    });
}

export async function lectureSegments(lectureId: LectureId): Promise<Segment[]> {
  return db.segments.where("[lectureId+seq]").between([lectureId, 0], [lectureId, Infinity]).toArray();
}

/** Adds cards whose id is new; a repeated mention of the same target keeps its first moment. */
export async function addLinks(links: readonly RelatedLink[]): Promise<void> {
  if (links.length === 0) return;
  await db.transaction("rw", db.links, async () => {
    const have = new Set((await db.links.bulkGet(links.map((l) => l.id))).flatMap((l) => (l ? [l.id] : [])));
    const fresh = links.filter((l) => !have.has(l.id));
    if (fresh.length) await db.links.bulkPut(fresh);
  });
}

/** The lecture's cards so far, by id and by what a student reads as the same card. */
export async function knownLinks(lectureId: LectureId): Promise<{ ids: Set<string>; cards: Set<string> }> {
  const links = await db.links.where("lectureId").equals(lectureId).toArray();
  return { ids: new Set(links.map((l) => l.id)), cards: new Set(links.map(cardKey)) };
}

export async function addAudio(chunk: AudioChunk): Promise<void> {
  await db.audio.put(chunk);
}

export async function nextAudio(lectureId: LectureId): Promise<AudioChunk | undefined> {
  return db.audio
    .where("[lectureId+seq]")
    .between([lectureId, 0], [lectureId, Infinity])
    .filter((c) => c.transcribedAt === undefined)
    .first();
}

export async function audioBacklog(lectureId: LectureId): Promise<number> {
  return db.audio
    .where("lectureId")
    .equals(lectureId)
    .filter((c) => c.transcribedAt === undefined)
    .count();
}

export async function nextAudioSeq(lectureId: LectureId): Promise<number> {
  const keys = (await db.audio.where("lectureId").equals(lectureId).primaryKeys()) as unknown as [LectureId, number][];
  return keys.reduce((n, [, seq]) => Math.max(n, seq + 1), 0);
}

export async function markTranscribed(lectureId: LectureId, seq: number, now: EpochMs): Promise<void> {
  await db.audio.update([lectureId, seq], { transcribedAt: now });
}

/** Saved and fully transcribed: the audio queue has done its job, so its WAVs go. */
export async function pruneAudio(lectureId: LectureId): Promise<void> {
  await db.transaction("rw", db.lectures, db.audio, async () => {
    const l = await db.lectures.get(lectureId);
    if (l?.state.status !== "saved") return;
    const pending = await db.audio
      .where("lectureId")
      .equals(lectureId)
      .filter((c) => c.transcribedAt === undefined)
      .count();
    if (pending === 0) await db.audio.where("lectureId").equals(lectureId).delete();
  });
}
