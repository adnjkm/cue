export type Box = [x0: number, y0: number, x1: number, y1: number];

export type Option = { label: string; text: string };

export type Solution = {
  answer: string;
  explanation: string;
  steps: string[];
  whyNot: Record<string, string>;
};

export type Question = {
  id: string;
  number: string;
  topic: string;
  prompt: string;
  options: Option[];
  answer?: string;
  answerSource: "document" | "model" | "none";
  figure?: { page: number; box: Box };
};

export type Exam = {
  id: string;
  title: string;
  course?: string;
  sourceName: string;
  pages: number;
  questions: Question[];
};

// "checking" covers a choice made before the model's answer arrived for a question with no key.
export type AttemptState =
  | { status: "unanswered" }
  | { status: "checking"; choice: string }
  | { status: "answered"; choice: string; correct: boolean };

export type SolutionState =
  | { status: "loading" }
  | { status: "ready"; solution: Solution }
  | { status: "error"; message: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ErrorKind =
  | "missing_key"
  | "rate_limited"
  | "unreadable"
  | "no_questions"
  | "too_large"
  | "upstream";

export type ApiError = { kind: ErrorKind; message: string };

/** One rendered page sent to /api/parse. `page` is 1-based across the whole document. */
export type PageInput = { page: number; image: string; text: string };

export type ParseRequest = { pages: PageInput[]; totalPages: number };

export type ParsedQuestion = Omit<Question, "id" | "answerSource"> & { answer?: string };

export type ParseResult = {
  title?: string;
  course?: string;
  questions: ParsedQuestion[];
  /** Answer-key entries found in this chunk, possibly for questions printed in other chunks. */
  answerKey: { number: string; answer: string }[];
};

export type SolveRequest = { question: Pick<Question, "number" | "topic" | "prompt" | "options" | "answer"> };

export type AskRequest = {
  question: Pick<Question, "prompt" | "options" | "answer">;
  choice?: string;
  solution?: Solution;
  messages: ChatMessage[];
};
