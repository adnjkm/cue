"use client";

import { ai } from "@/lib/ai";
import type { Figure, PageImage, RenderedPage } from "@/lib/domain";
import { cropFigure, saveBlob, toPageImage } from "@/lib/materials";
import type { ExamDraft, ParsedPaper } from "./exam";
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

/** Crops each figure box out of its rendered page and stores it as a Blob. A box on a page that was not rendered is dropped. */
export async function attachFigures(exam: ExamDraft, pages: readonly RenderedPage[]): Promise<ParsedPaper> {
  const questions: ParsedPaper["questions"] = [];
  for (const { figureAt, ...q } of exam.questions) {
    const page = figureAt ? pages.find((p) => p.index === figureAt.page) : undefined;
    const figure: Figure | undefined = figureAt && page ? { kind: "crop", blob: await saveBlob(await cropFigure(page.image, figureAt.box)), page: figureAt.page, box: figureAt.box } : undefined;
    questions.push({ ...q, ...(figure ? { figure } : {}) });
  }
  return { ...exam, questions };
}

export { toPageImage };
