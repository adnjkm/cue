"use client";

import { ai } from "@/lib/ai";
import { db } from "@/lib/db";
import type { EpochMs, Lecture, LectureId, Segment } from "@/lib/domain";
import { readPrefs } from "@/lib/prefs";
import { reindexSource, sourceKey } from "@/lib/retrieval";
import { fmtStamp } from "@/lib/time";
import { addLinks, lectureSegments, linkIds, saveNotes, setFlag, setSegmentText } from "./data";
import { applyHints, catalogInput, coursework, notesFrom, transcriptForNotes, type Coursework } from "./hints";
import { latexToUnicode } from "./latex";

const HINT_WINDOW_MS = 60_000;

async function courseLabel(lecture: Lecture): Promise<string> {
  const course = await db.courses.get(lecture.courseId);
  return course?.title ? `${lecture.courseId} · ${course.title}` : lecture.courseId;
}

/** `lecture.clean` on one segment; on failure the line keeps showing the engine's words. */
export async function cleanSegment(segment: Segment, signal?: AbortSignal): Promise<void> {
  const before = await db.segments.get([segment.lectureId, segment.seq - 1]);
  const context = (before?.text ?? before?.raw ?? "").slice(-1000);
  const { sentences } = await ai("lecture.clean", { raw: segment.raw.slice(0, 4000), before: context }, { signal });
  if (sentences.length) await setSegmentText(segment.lectureId, segment.seq, latexToUnicode(sentences.join(" ")));
}

async function loadCoursework(lecture: Lecture, now: EpochMs): Promise<Coursework> {
  const [events, materials, sets] = await Promise.all([
    db.events.where("courseId").equals(lecture.courseId).toArray(),
    db.materials.where("courseId").equals(lecture.courseId).toArray(),
    db.practiceSets.where("courseId").equals(lecture.courseId).toArray(),
  ]);
  const textbooks = materials.filter((m) => m.kind === "textbook");
  const pages = new Map(
    await Promise.all(
      textbooks.map(async (m) => [m.id as string, (await db.pages.where("materialId").equals(m.id).toArray()).map((p) => ({ page: p.index, label: p.label, section: p.section }))] as const),
    ),
  );
  const withQuestions = await Promise.all(
    sets.map(async (set) => ({ set, questions: (await db.questions.where("setId").equals(set.id).toArray()).map((q) => ({ id: q.id, number: q.number })) })),
  );
  return coursework({ events, materials, pages, sets: withQuestions, now });
}

/**
 * `lecture.hints` over the minute that ends at `untilMs`. Flags go on segments, mentions become cards.
 * `dismissed` holds lines the student unflagged, which a later window must not flag again.
 */
export async function scanHints(lectureId: LectureId, untilMs: number, dismissed: ReadonlySet<number>, signal?: AbortSignal): Promise<{ atMs: number; flag: NonNullable<Segment["flag"]> }[]> {
  const lecture = await db.lectures.get(lectureId);
  if (!lecture) return [];
  const segments = (await lectureSegments(lectureId)).filter((s) => s.endMs > untilMs - HINT_WINDOW_MS && s.atMs <= untilMs);
  if (segments.length === 0) return [];
  const now = Date.now() as EpochMs;
  const [{ zone }, work, course, existing] = await Promise.all([readPrefs("foundation"), loadCoursework(lecture, now), courseLabel(lecture), linkIds(lectureId)]);
  const catalog = catalogInput(work, zone);
  const out = await ai(
    "lecture.hints",
    { course, window: segments.slice(-30).map((s) => ({ at: fmtStamp(s.atMs), text: (s.text ?? s.raw).slice(0, 2000) })), assessments: catalog.assessments, materials: catalog.materials },
    { signal },
  );
  const professor = lecture.professor ?? (await db.courses.get(lecture.courseId))?.instructor ?? null;
  const result = applyHints({ lectureId, timeZone: zone, professor }, work, segments, out, { dismissed, existingLinks: existing });
  const applied: { atMs: number; flag: NonNullable<Segment["flag"]> }[] = [];
  for (const { seq, flag } of result.flags) {
    const current = await db.segments.get([lectureId, seq]);
    if (!current || current.flag || dismissed.has(seq)) continue;
    await setFlag(lectureId, seq, flag);
    applied.push({ atMs: current.atMs, flag });
  }
  await addLinks(result.links);
  return applied;
}

/** `lecture.notes` once at save. Writes nothing when the transcript is empty. */
export async function writeNotes(lectureId: LectureId, signal?: AbortSignal): Promise<void> {
  const lecture = await db.lectures.get(lectureId);
  if (!lecture || lecture.notes) return;
  const segments = await lectureSegments(lectureId);
  const now = Date.now() as EpochMs;
  if (segments.length === 0) {
    await saveNotes(lectureId, { summary: "Nothing was transcribed in this recording.", keyPoints: [], generatedAt: now }, null);
    return;
  }
  const out = await ai("lecture.notes", { course: await courseLabel(lecture), topic: lecture.topic?.full ?? null, transcript: transcriptForNotes(segments) }, { signal });
  await saveNotes(lectureId, notesFrom(out, segments, Date.now() as EpochMs), out.topic);
  await reindexSource(sourceKey.lecture(lectureId));
}
