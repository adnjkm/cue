import type { Box, Option, Passage, PassageId, GenerationScope } from "@/lib/domain";

export type { Box, Option };

/** One parsed chunk of a paper, before buildExam merges chunks into a set. */
export interface PaperChunkRead {
  title?: string;
  course?: string;
  questions: readonly { number: string; topic: string; prompt: string; options: readonly Option[]; answer?: string; marks?: number; figure?: { page: number; box: Box } }[];
  answerKey: readonly { number: string; answer: string }[];
}

export interface SolveOutput {
  answer: string;
  explanation: string;
  steps: readonly { label: string; text: string }[];
  conclusion?: string;
  whyNot: Readonly<Record<string, string>>;
  resources: readonly string[];
}

export interface GenerateInput {
  scope: GenerationScope;
  style: readonly { prompt: string; options: readonly Option[] }[];
  passages: readonly Passage[];
  count: number;
  note?: string;
}

export interface GeneratedQuestion {
  topic: string;
  prompt: string;
  options: readonly Option[];
  answer: string;
  whyNot: Readonly<Record<string, string>>;
  steps: readonly { label: string; text: string }[];
  sources: readonly (PassageId | string)[];
}
