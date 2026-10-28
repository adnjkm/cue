import type { AnswerKey, Box, Question } from "@/lib/domain";
import type { PaperChunkRead } from "./types";

type ReadQuestion = PaperChunkRead["questions"][number];
type ExamQuestion = Omit<Question, "id" | "setId" | "order">;

/** A paper merged from its chunks. Figures are still page boxes; attachFigures crops them. */
export interface ExamDraft {
  title: string;
  course?: string;
  questions: (Omit<ExamQuestion, "figure"> & { figureAt?: { page: number; box: Box } })[];
}

export interface ParsedPaper {
  title: string;
  course?: string;
  questions: ExamQuestion[];
}

/** A question split by a chunk boundary comes back twice with one number: the stem from one chunk, the options from the next. */
function joinContinuations(chunks: readonly PaperChunkRead[]): ReadQuestion[] {
  const out: ReadQuestion[] = [];
  for (const chunk of chunks) {
    for (const [i, q] of chunk.questions.entries()) {
      const prev = out.at(-1);
      if (i === 0 && prev && prev.number === q.number) {
        const options = new Map(prev.options.map((o) => [o.label, o]));
        for (const o of q.options) options.set(o.label, o);
        out[out.length - 1] = {
          ...prev,
          prompt: q.prompt.length > prev.prompt.length ? q.prompt : prev.prompt,
          options: [...options.values()].sort((a, b) => a.label.localeCompare(b.label)),
          ...(prev.answer ?? q.answer ? { answer: prev.answer ?? q.answer } : {}),
          ...(prev.figure ?? q.figure ? { figure: prev.figure ?? q.figure } : {}),
        };
        continue;
      }
      out.push(q);
    }
  }
  return out;
}

/**
 * Merges chunk results into one paper. Answer keys merge by printed number (first wins) before any
 * renumbering, and only keys that name one of the question's options are trusted. Numbers that still repeat
 * (two sections both starting at 1) are replaced by positions.
 */
export function buildExam(results: readonly PaperChunkRead[], fileName: string): ExamDraft {
  const parsed = joinContinuations(results);
  const keyed = new Map<string, string>();
  for (const r of results) for (const k of r.answerKey) if (!keyed.has(k.number)) keyed.set(k.number, k.answer);
  const numbers = parsed.map((q) => q.number);
  const renumber = new Set(numbers).size !== numbers.length;
  const questions = parsed.map((q, i): ExamDraft["questions"][number] => {
    const keyAnswer = keyed.get(q.number);
    const answer = q.answer ?? (keyAnswer && q.options.some((o) => o.label === keyAnswer) ? keyAnswer : undefined);
    const key: AnswerKey = answer ? { source: "document", answer } : { source: "none" };
    return {
      number: renumber ? String(i + 1) : q.number,
      topic: q.topic,
      type: "multipleChoice",
      ...(q.marks ? { marks: q.marks } : {}),
      prompt: q.prompt,
      options: q.options.map((o) => ({ ...o })),
      key,
      ...(q.figure ? { figureAt: { page: q.figure.page, box: q.figure.box } } : {}),
      origin: { kind: "paper" },
    };
  });
  const course = results.find((r) => r.course)?.course;
  return { title: results.find((r) => r.title)?.title ?? fileName.replace(/\.[a-z0-9]+$/i, ""), ...(course ? { course } : {}), questions };
}
