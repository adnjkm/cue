import { z } from "zod";
import type { Box, ParsedQuestion, ParseResult, Solution } from "./types";

const text = z.string().trim().min(1);
const nullish = <T extends z.ZodType>(s: T) => s.nullish().transform((v) => v ?? undefined);

export function normalizeLabel(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Super VL often transcribes code without the fences the prompt asks for, sometimes in the same block as the stem.
const CODE_START = /^(def|class|for|while|if|return|import|from|function|const|let|public|private|int|void|#include)\b/;
const isCodeLine = (line: string) =>
  /^\s+\S/.test(line) || (CODE_START.test(line) && /[:;(){}=]|^(import|from|#include)\b/.test(line));

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

const optionSchema = z.object({ label: text.transform(normalizeLabel), text: text });

const boxSchema = z
  .array(z.number())
  .length(4)
  .transform((b) => b.map((n) => Math.min(1, Math.max(0, n))) as Box)
  .refine(([x0, y0, x1, y1]) => x1 - x0 > 0.02 && y1 - y0 > 0.02);

const questionSchema = z
  .object({
    number: z.union([z.string(), z.number()]).transform((n) => String(n).trim()),
    topic: nullish(z.string().trim()),
    prompt: text,
    options: z.array(optionSchema).min(2).max(8),
    answer: nullish(z.string()),
    figure: z.object({ page: z.number().int().min(1), box: boxSchema }).nullish().catch(undefined),
  })
  .transform((q): ParsedQuestion | null => {
    const labels = new Set(q.options.map((o) => o.label));
    if (labels.size !== q.options.length) return null;
    const answer = q.answer ? normalizeLabel(q.answer) : undefined;
    return {
      number: q.number,
      topic: q.topic || "General",
      prompt: fenceBareCode(q.prompt),
      options: q.options,
      answer: answer && labels.has(answer) ? answer : undefined,
      figure: q.figure ?? undefined,
    };
  });

const parseEnvelope = z.object({
  title: nullish(z.string().trim()),
  course: nullish(z.string().trim()),
  questions: z.array(z.unknown()).catch([]),
  answerKey: z.array(z.unknown()).nullish().catch([]),
});

const keyEntry = z.object({
  number: z.union([z.string(), z.number()]).transform((n) => String(n).trim()),
  answer: text.transform(normalizeLabel),
});

/** Parses one chunk of model output, dropping malformed questions instead of failing the chunk. */
export function parseChunkOutput(raw: unknown): ParseResult {
  const env = parseEnvelope.parse(raw);
  const questions = env.questions.flatMap((q) => {
    const r = questionSchema.safeParse(q);
    return r.success && r.data ? [r.data] : [];
  });
  const answerKey = (env.answerKey ?? []).flatMap((k) => {
    const r = keyEntry.safeParse(k);
    return r.success ? [r.data] : [];
  });
  return { title: env.title || undefined, course: env.course || undefined, questions, answerKey };
}

export function parseSolutionOutput(raw: unknown, labels: string[]): Solution {
  const s = z
    .object({
      answer: text.transform(normalizeLabel),
      explanation: text,
      steps: z.array(z.string().trim()).catch([]),
      whyNot: z.record(z.string(), z.string()).catch({}),
    })
    .parse(raw);
  if (!labels.includes(s.answer)) throw new Error(`Model answered "${s.answer}", not one of ${labels.join(", ")}`);
  const whyNot: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.whyNot)) {
    const label = normalizeLabel(k);
    if (labels.includes(label) && label !== s.answer && v.trim()) whyNot[label] = v.trim();
  }
  return { answer: s.answer, explanation: s.explanation, steps: s.steps.filter(Boolean), whyNot };
}

/** Extracts the first JSON object from model text, tolerating code fences and reasoning preambles. */
export function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : content;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model response contained no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

const dataUrl = z.string().regex(/^data:image\/(jpeg|png|webp);base64,/);

export const parseRequestSchema = z.object({
  totalPages: z.number().int().min(1).max(30),
  pages: z
    .array(z.object({ page: z.number().int().min(1), image: dataUrl, text: z.string().max(20000) }))
    .min(1)
    .max(3),
});

const questionInput = z.object({
  number: z.string(),
  topic: z.string(),
  prompt: z.string().min(1).max(8000),
  options: z.array(z.object({ label: z.string(), text: z.string() })).min(2).max(8),
  answer: z.string().optional(),
});

export const solveRequestSchema = z.object({ question: questionInput });

export const askRequestSchema = z.object({
  question: questionInput.pick({ prompt: true, options: true, answer: true }),
  choice: z.string().optional(),
  solution: z
    .object({
      answer: z.string(),
      explanation: z.string(),
      steps: z.array(z.string()),
      whyNot: z.record(z.string(), z.string()),
    })
    .optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(20),
});

/** JSON schema handed to the vision model as response_format. Loose on purpose; zod above is the real gate. */
export const parseResponseJsonSchema = {
  type: "object",
  properties: {
    title: { type: ["string", "null"] },
    course: { type: ["string", "null"] },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "string" },
          topic: { type: "string" },
          prompt: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, text: { type: "string" } },
              required: ["label", "text"],
            },
          },
          answer: { type: ["string", "null"] },
          figure: {
            type: ["object", "null"],
            properties: {
              page: { type: "integer" },
              box: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
            },
            required: ["page", "box"],
          },
        },
        required: ["number", "topic", "prompt", "options"],
      },
    },
    answerKey: {
      type: "array",
      items: {
        type: "object",
        properties: { number: { type: "string" }, answer: { type: "string" } },
        required: ["number", "answer"],
      },
    },
  },
  required: ["questions", "answerKey"],
} as const;
