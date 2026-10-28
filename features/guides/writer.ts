"use client";

import { useSyncExternalStore } from "react";
import { ai, AiError, aiItems } from "@/lib/ai";
import { db } from "@/lib/db";
import type { CourseId, EpochMs, GuideDraft, Passage, SectionId } from "@/lib/domain";
import { guidePlainText } from "./plain-text";
import { numberFootnotes } from "./cites";
import { courseMaterials, outlineInput, sectionInput } from "./inputs";
import { joinNames, outlineRows, sourceNames } from "./model";
import type { GuideBlockDraft } from "./schema";

/** In-flight work lives here, keyed by row id; rows only ever hold settled drafts (architecture 4.2 rule 2). */
export type SectionJob =
  | { status: "reading" }
  | { status: "writing"; from: string; passages: Passage[]; drafts: GuideBlockDraft[] }
  | { status: "saved"; draft: GuideDraft }
  | { status: "failed"; error: AiError };
export type OutlineJob = { status: "planning"; from: string } | { status: "failed"; error: AiError };

const sectionJobs = new Map<SectionId, SectionJob>();
const outlineJobs = new Map<CourseId, OutlineJob>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function setSection(id: SectionId, job: SectionJob | null) {
  if (job) sectionJobs.set(id, job);
  else sectionJobs.delete(id);
  emit();
}
function setOutline(id: CourseId, job: OutlineJob | null) {
  if (job) outlineJobs.set(id, job);
  else outlineJobs.delete(id);
  emit();
}

export function useSectionJob(id: SectionId | undefined): SectionJob | undefined {
  return useSyncExternalStore(subscribe, () => (id ? sectionJobs.get(id) : undefined), () => undefined);
}
export function useOutlineJob(id: CourseId): OutlineJob | undefined {
  return useSyncExternalStore(subscribe, () => outlineJobs.get(id), () => undefined);
}

const asAiError = (e: unknown) => (e instanceof AiError ? e : new AiError("upstream", e instanceof Error ? e.message : String(e)));
const busy = (job: SectionJob | undefined) => job?.status === "reading" || job?.status === "writing";

/**
 * Writes one section block by block. Idempotent: a second call while one runs is a no-op, and without
 * `rewrite` a section that already has a draft is left alone, so the view's effect can call it freely.
 */
export async function writeSection(id: SectionId, opts: { rewrite?: boolean } = {}): Promise<void> {
  if (busy(sectionJobs.get(id))) return;
  setSection(id, { status: "reading" });
  try {
    const row = await db.guideSections.get(id);
    if (!row || (row.draft && !opts.rewrite)) return setSection(id, null);
    const chapter = (await db.guides.get(row.courseId))?.chapters.find((c) => c.id === row.chapterId)?.title ?? "";
    const { input, stamp } = await sectionInput(row, chapter);
    const writing = { status: "writing", from: sourceNames(input.passages), passages: input.passages, drafts: [] as GuideBlockDraft[] } as const;
    setSection(id, writing);
    const drafts: GuideBlockDraft[] = [];
    for await (const block of aiItems("guide.section", input)) {
      drafts.push(block);
      setSection(id, { ...writing, drafts: [...drafts] });
    }
    const { blocks, footnotes } = numberFootnotes(drafts, input.passages);
    const draft: GuideDraft = { blocks, footnotes, plainText: guidePlainText(blocks), generatedAt: Date.now() as EpochMs, sourceStamp: stamp };
    await db.guideSections.update(id, { draft, lastError: undefined });
    const saved: SectionJob = { status: "saved", draft };
    setSection(id, saved);
    // The live query shows the new row a moment later; until then the saved job keeps the text on screen.
    setTimeout(() => sectionJobs.get(id) === saved && setSection(id, null), 2000);
  } catch (e) {
    const error = asAiError(e);
    await db.guideSections.update(id, { lastError: { kind: error.kind, at: Date.now() as EpochMs } }).catch(() => undefined);
    setSection(id, { status: "failed", error });
  }
}

/** Plans a course's chapters and sections. Returns the first section, or null when it failed or already exists. */
export async function writeGuide(courseId: CourseId): Promise<SectionId | null> {
  if (outlineJobs.get(courseId)?.status === "planning") return null;
  setOutline(courseId, { status: "planning", from: "" });
  try {
    setOutline(courseId, { status: "planning", from: joinNames((await courseMaterials(courseId)).map((m) => m.title)) });
    const outline = await ai("guide.outline", await outlineInput(courseId));
    const { guide, sections } = outlineRows(courseId, outline, Date.now() as EpochMs);
    const first = await db.transaction("rw", db.guides, db.guideSections, async () => {
      if (await db.guides.get(courseId)) return null;
      await db.guides.put(guide);
      await db.guideSections.bulkPut(sections);
      return sections[0]?.id ?? null;
    });
    setOutline(courseId, null);
    return first;
  } catch (e) {
    setOutline(courseId, { status: "failed", error: asAiError(e) });
    return null;
  }
}

/** Remembers the section a course was last read at, which /guides and the course switch open. */
export async function markRead(courseId: CourseId, sectionId: SectionId): Promise<void> {
  await db.guides.update(courseId, { lastRead: { sectionId, at: Date.now() as EpochMs } });
}
