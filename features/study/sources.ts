"use client";

import { db } from "@/lib/db";
import { focusMinutes, sourceKey, type LectureId, type MaterialId, type Passage, type PomodoroPrefs, type StudyBlock } from "@/lib/domain";
import { blockMaterials, blockReasonText } from "@/lib/plan";
import { retrieve } from "@/lib/retrieval";
import { fmtStamp } from "@/lib/time";
import type { FlaggedLine, PageRef, PlanContext, TranscriptRef } from "./model";
import type { StudyPlanInput } from "./shape";

export interface SessionSources {
  deck: { ref: PageRef; count: number; headings: string[] } | null;
  /** The transcript at 0:00, carrying the facts its labels need. */
  lecture: { id: LectureId; ref: TranscriptRef } | null;
  reading: PageRef | null;
  handout: PageRef | null;
  flagged: FlaggedLine[];
  passages: Passage[];
  practiceCount: number;
}

const PASSAGE_BUDGET = 20_000;
const READING_KINDS = new Set(["textbook", "notes", "handout"]);

function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim())?.trim().slice(0, 120) ?? "";
}

async function deckOf(id: MaterialId | undefined): Promise<SessionSources["deck"]> {
  if (!id) return null;
  const material = await db.materials.get(id);
  if (!material) return null;
  const pages = await db.pages.where("materialId").equals(id).sortBy("index");
  const doc = { kind: material.kind, title: material.title, ...(material.short ? { short: material.short } : {}), ...(material.lecture ? { lectureNumber: material.lecture.number } : {}) };
  return {
    ref: { kind: "page", materialId: material.id, doc, page: 1 },
    count: Math.max(material.pageCount, pages.length),
    headings: pages.map((p) => p.slide?.heading ?? firstLine(p.text)),
  };
}

/** Each retrieval numbers from S1, so merged passages are renumbered; the budget keeps the request under the passage cap. */
function merge(groups: readonly Passage[][]): Passage[] {
  const out: Passage[] = [];
  let chars = 0;
  for (const p of groups.flat()) {
    if (chars + p.text.length > PASSAGE_BUDGET || out.length >= 40) break;
    chars += p.text.length;
    out.push({ ...p, id: `S${out.length + 1}` });
  }
  return out;
}

/**
 * The lecture's own material first (blockMaterials), then retrieval for blocks with no lecture anchor,
 * so a mid-week or prep block still opens on the slides and transcript that teach its topic.
 */
export async function gatherSources(block: StudyBlock): Promise<SessionSources> {
  const linked = await blockMaterials(block);
  const topic = [block.topic.full, block.note].filter(Boolean).join(" ");
  let deckId = linked.materials.find((m) => m.ref.kind === "page" && m.ref.doc.kind === "slides")?.materialId;
  let lectureId = linked.transcript?.lectureId;
  if (!deckId || !lectureId) {
    const hits = await retrieve({ courseId: block.courseId, text: topic, k: 12 });
    for (const h of hits) {
      if (!deckId && h.ref.kind === "page" && h.ref.doc.kind === "slides") deckId = h.ref.materialId;
      if (!lectureId && h.ref.kind === "transcript") lectureId = h.ref.lectureId;
    }
  }
  const handoutRef = linked.materials.find((m) => m.ref.kind === "page" && m.ref.doc.kind === "handout")?.ref;

  const lecture = lectureId ? await db.lectures.get(lectureId) : undefined;
  const segments = lecture ? await db.segments.where("lectureId").equals(lecture.id).sortBy("seq") : [];
  const lectureRef: TranscriptRef | null = lecture
    ? { kind: "transcript", lectureId: lecture.id, courseId: lecture.courseId, ...(lecture.number !== undefined ? { lectureNumber: lecture.number } : {}), atMs: 0 }
    : null;
  const flagged: FlaggedLine[] = lectureRef
    ? segments
        .filter((s) => s.flag)
        .slice(0, 12)
        .map((s, i) => ({ id: `F${i + 1}`, ref: { ...lectureRef, atMs: s.atMs }, quote: s.text ?? s.raw, examHint: s.flag?.by === "model" }))
    : [];

  const materials = block.courseId ? await db.materials.where("courseId").equals(block.courseId).toArray() : await db.materials.toArray();
  const readingKeys = materials.filter((m) => READING_KINDS.has(m.kind)).map((m) => sourceKey.material(m.id));
  const [readings, transcript] = await Promise.all([
    readingKeys.length ? retrieve({ courseId: block.courseId, text: topic, k: 6, within: readingKeys }) : Promise.resolve([]),
    lecture ? retrieve({ courseId: lecture.courseId, text: topic, k: 4, within: [sourceKey.lecture(lecture.id)] }) : Promise.resolve([]),
  ]);
  const reading = readings.find((p) => p.ref.kind === "page" && (p.ref.doc.kind === "textbook" || p.ref.doc.kind === "notes"))?.ref;

  return {
    deck: await deckOf(deckId),
    lecture: lecture && lectureRef ? { id: lecture.id, ref: lectureRef } : null,
    reading: reading?.kind === "page" ? reading : null,
    handout: handoutRef?.kind === "page" ? handoutRef : null,
    flagged,
    passages: merge([readings, transcript]),
    practiceCount: linked.practice.count,
  };
}

export function planContext(s: SessionSources, focus: number): PlanContext {
  return { focusMinutes: focus, deck: s.deck ? { ref: s.deck.ref, count: s.deck.count } : null, flagged: s.flagged, passages: s.passages };
}

export function blockMinutes(block: Pick<StudyBlock, "start" | "end">): number {
  return Math.max(5, Math.round((block.end - block.start) / 60_000));
}

export function planInput(block: StudyBlock, s: SessionSources, pomodoro: PomodoroPrefs): StudyPlanInput {
  const minutes = blockMinutes(block);
  return {
    block: {
      kind: block.anchor.kind,
      course: block.courseId,
      topic: block.topic.full,
      reason: blockReasonText(block, "sentence"),
      note: block.note ?? null,
      minutes,
      focusMinutes: Math.max(3, focusMinutes(minutes, pomodoro)),
    },
    deck: s.deck ? { title: s.deck.ref.doc.title, headings: s.deck.headings.slice(0, 150).map((h) => h.slice(0, 200)) } : null,
    flagged: s.flagged.map((f) => ({ id: f.id, at: fmtStamp(f.ref.atMs), quote: f.quote.slice(0, 600) })),
    passages: s.passages,
    practiceCount: s.practiceCount,
  };
}
