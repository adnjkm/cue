import { z } from "zod";
import type { Box, PaperChunkRead } from "./types";

export function normalizeLabel(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Super VL often transcribes code without the fences the prompt asks for, sometimes in the same block as the stem.
const CODE_START = /^(def|class|for|while|if|return|import|from|function|const|let|public|private|int|void|#include)\b/;
const isCodeLine = (line: string) => /^\s+\S/.test(line) || (CODE_START.test(line) && /[:;(){}=]|^(import|from|#include)\b/.test(line));

export function fenceBareCode(prompt: string): string {
  if (prompt.includes("```")) return prompt;
  return prompt
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.replace(/\n+$/, "").split("\n");
      const start = lines.findIndex(isCodeLine);
      if (start < 0 || lines.length - start < 2) return block;
      const code = "```\n" + lines.slice(start).join("\n") + "\n```";
      return start === 0 ? code : lines.slice(0, start).join("\n") + "\n\n" + code;
    })
    .join("\n\n");
}

const num = z.union([z.string(), z.number()]).transform((n) => String(n).trim());
const option = z.object({ label: z.string().trim().min(1), text: z.string().trim().min(1) });
const question = z.object({
  number: num,
  topic: z.string().nullish(),
  prompt: z.string().trim().min(1),
  options: z.array(option).min(2).max(8),
  answer: z.string().nullish(),
  marks: z.number().nullish(),
  figure: z.object({ page: z.number().int().min(1), box: z.array(z.number()).length(4) }).nullish(),
});

const clampBox = (b: readonly number[]): Box | undefined => {
  const [x0, y0, x1, y1] = b.map((n) => Math.min(1, Math.max(0, n)));
  return x1 - x0 > 0.02 && y1 - y0 > 0.02 ? [x0, y0, x1, y1] : undefined;
};

/**
 * One chunk of a parsed paper. The input side is the response_format schema; the transform drops questions
 * with duplicate option labels, normalizes labels, fences bare code and clamps figure boxes.
 */
export const paperChunkRead = z
  .object({
    title: z.string().nullish(),
    course: z.string().nullish(),
    questions: z.array(question),
    answerKey: z.array(z.object({ number: num, answer: z.string().trim().min(1) })),
  })
  .transform((chunk): PaperChunkRead => {
    const questions = chunk.questions.flatMap((q) => {
      const options = q.options.map((o) => ({ label: normalizeLabel(o.label), text: o.text }));
      const labels = new Set(options.map((o) => o.label));
      if (labels.size !== options.length || labels.has("")) return [];
      const answer = q.answer ? normalizeLabel(q.answer) : undefined;
      const box = q.figure ? clampBox(q.figure.box) : undefined;
      return [
        {
          number: q.number,
          topic: q.topic?.trim() || "General",
          prompt: fenceBareCode(q.prompt),
          options,
          ...(answer && labels.has(answer) ? { answer } : {}),
          ...(q.marks ? { marks: q.marks } : {}),
          ...(q.figure && box ? { figure: { page: q.figure.page, box } } : {}),
        },
      ];
    });
    return {
      ...(chunk.title?.trim() ? { title: chunk.title.trim() } : {}),
      ...(chunk.course?.trim() ? { course: chunk.course.trim() } : {}),
      questions,
      answerKey: chunk.answerKey.map((k) => ({ number: k.number, answer: normalizeLabel(k.answer) })),
    };
  });

export const solveOutput = z.object({
  answer: z.string().trim().min(1).transform(normalizeLabel),
  explanation: z.string().trim().min(1),
  steps: z.array(z.object({ label: z.string().trim().min(1), text: z.string().trim().min(1) })).max(8),
  conclusion: z.string().nullish().transform((v) => v?.trim() || undefined),
  whyNot: z.record(z.string(), z.string()),
  resources: z.array(z.string()).max(6),
});

export const generatedQuestion = z.object({
  topic: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  options: z.array(option).length(4),
  answer: z.string().trim().min(1).transform(normalizeLabel),
  whyNot: z.record(z.string(), z.string()),
  steps: z.array(z.object({ label: z.string(), text: z.string() })).max(6),
  sources: z.array(z.string()).max(6),
});
