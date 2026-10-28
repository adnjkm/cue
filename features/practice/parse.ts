"use client";

import { ai } from "@/lib/ai";
import type { AnswerKey, Box, Figure, PageImage, Question, RenderedPage } from "@/lib/domain";
import { cropFigure, saveBlob, toPageImage } from "@/lib/materials";
import type { PaperChunkRead } from "./types";

const MAX_CHUNK_PAGES = 3;
const MAX_CHUNK_CHARS = 3_600_000;

/** Groups pages into requests of at most 3 pages that stay well under Vercel's 4.5 MB body limit. */
export function chunkPages(pages: readonly PageImage[]): PageImage[][] {
  const chunks: PageImage[][] = [];
  let current: PageImage[] = [];
  let size = 0;
  for (const p of pages) {
    const s = p.image.length + p.text.length;
    if (current.length && (current.length === MAX_CHUNK_PAGES || size + s > MAX_CHUNK_CHARS)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += s;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Parses every chunk that has no result yet, three at a time. Writes into `results` in place, so a retry
 * after a failure resends only the chunks still missing.
 */
export async function parseChunks(
  chunks: readonly PageImage[][],
  totalPages: number,
  results: (PaperChunkRead | undefined)[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<PaperChunkRead[]> {
  const pending = chunks.map((_, i) => i).filter((i) => !results[i]);
  let failure: unknown;
  const report = () => onProgress(results.filter(Boolean).length, chunks.length);
  report();
  const worker = async () => {
    while (pending.length && !failure) {
      const i = pending.shift()!;
      try {
        results[i] = await ai("practice.parse", { pages: chunks[i].map((p) => ({ ...p })), totalPages }, { signal });
        report();
      } catch (e) {
        failure ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  if (failure) throw failure;
  return results as PaperChunkRead[];
}

export interface ParsedPaper {
  title: string;
  course?: string;
  questions: Omit<Question, "id" | "setId" | "order">[];
}

/**
 * Merges chunk results into one paper. Answer keys merge by printed number (first wins) before any
 * renumbering, and only keys that name one of the question's options are trusted.
 */
export async function buildPaper(results: readonly PaperChunkRead[], fileName: string, pages: readonly RenderedPage[]): Promise<ParsedPaper> {
  const parsed = results.flatMap((r) => r.questions);
  const keyed = new Map<string, string>();
  for (const r of results) for (const k of r.answerKey) if (!keyed.has(k.number)) keyed.set(k.number, k.answer);
  const numbers = parsed.map((q) => q.number);
  const renumber = new Set(numbers).size !== numbers.length;
  const questions: ParsedPaper["questions"] = [];
  for (const [i, q] of parsed.entries()) {
    const keyAnswer = keyed.get(q.number);
    const answer = q.answer ?? (keyAnswer && q.options.some((o) => o.label === keyAnswer) ? keyAnswer : undefined);
    const key: AnswerKey = answer ? { source: "document", answer } : { source: "none" };
    let figure: Figure | undefined;
    const page = q.figure ? pages.find((p) => p.index === q.figure!.page) : undefined;
    if (q.figure && page) {
      const box = q.figure.box as Box;
      figure = { kind: "crop", blob: await saveBlob(await cropFigure(page.image, box)), page: q.figure.page, box };
    }
    questions.push({
      number: renumber ? String(i + 1) : q.number,
      topic: q.topic,
      type: "multipleChoice",
      ...(q.marks ? { marks: q.marks } : {}),
      prompt: q.prompt,
      options: q.options.map((o) => ({ ...o })),
      key,
      ...(figure ? { figure } : {}),
      origin: { kind: "paper" },
    });
  }
  return {
    title: results.find((r) => r.title)?.title ?? fileName.replace(/\.[a-z0-9]+$/i, ""),
    course: results.find((r) => r.course)?.course,
    questions,
  };
}

export { toPageImage };
