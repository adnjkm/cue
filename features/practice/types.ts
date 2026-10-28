import type { z } from "zod";
import type { Box, Option, Passage } from "@/lib/domain";
import type { generatedQuestion, solveOutput } from "./schema";

export type { Box, Option };

/** One parsed chunk of a paper, before buildExam merges chunks into a set. */
export interface PaperChunkRead {
  title?: string;
  course?: string;
  questions: readonly { number: string; topic: string; prompt: string; options: readonly Option[]; answer?: string; marks?: number; figure?: { page: number; box: Box } }[];
  answerKey: readonly { number: string; answer: string }[];
}

/**
 * What practice.generate is asked. The client resolves a GenerationScope (a guide section, a chat answer,
 * a topic in a paper) into words and passages, so the prompt never needs database lookups.
 */
export interface GenerateInput {
  /** "CSC148"; also picks the mock's question bank. */
  course?: string;
  /** The tile group the questions land in. */
  topic: string;
  /** What to write about, as a phrase: `the study guide section “Price elasticity of demand” (passage S1)`. */
  focus: string;
  /** Up to 6 questions to match in style; `missed` marks ones the student got wrong. */
  style: readonly { prompt: string; options: readonly Option[]; missed?: true }[];
  passages: readonly Passage[];
  count: number;
  note?: string;
}

export type SolveOutput = z.output<typeof solveOutput>;
export type GeneratedQuestion = z.output<typeof generatedQuestion>;
