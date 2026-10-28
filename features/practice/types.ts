import type { z } from "zod";
import type { Box, Option, Passage, GenerationScope } from "@/lib/domain";
import type { generatedQuestion, solveOutput } from "./schema";

export type { Box, Option };

/** One parsed chunk of a paper, before buildExam merges chunks into a set. */
export interface PaperChunkRead {
  title?: string;
  course?: string;
  questions: readonly { number: string; topic: string; prompt: string; options: readonly Option[]; answer?: string; marks?: number; figure?: { page: number; box: Box } }[];
  answerKey: readonly { number: string; answer: string }[];
}

export interface GenerateInput {
  scope: GenerationScope;
  style: readonly { prompt: string; options: readonly Option[] }[];
  passages: readonly Passage[];
  count: number;
  note?: string;
}


export type SolveOutput = z.output<typeof solveOutput>;
export type GeneratedQuestion = z.output<typeof generatedQuestion>;
