import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { extractJson, parseChunkOutput, parseResponseJsonSchema, parseSolutionOutput } from "./schema";
import type { ApiError, AskRequest, ParseRequest, ParseResult, Solution, SolveRequest } from "./types";
import * as mock from "./mock";
import { BudgetExceeded, estimateInputTokens, reserve } from "./spend";

// The one place provider details live. Token Factory wins when its key is set; OpenRouter's free tier is the fallback.
const tokenFactoryKey = process.env.NEBIUS_API_KEY?.trim() || "";
const config = tokenFactoryKey
  ? {
      provider: "token-factory" as const,
      baseURL: "https://api.tokenfactory.nebius.com/v1",
      apiKey: tokenFactoryKey,
      models: {
        parse: "nvidia/Nemotron-3.5-Super-VL",
        solve: "nvidia/Nemotron-3-Ultra-550b-a55b",
        fast: "nvidia/Nemotron-3_5-Lightning",
      },
      // Measured: with thinking on, Super VL spent 1,927 tokens and 22s to read one heading; off, 4 tokens and 1.7s.
      noThinking: { chat_template_kwargs: { enable_thinking: false } },
    }
  : {
      provider: "openrouter" as const,
      baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
      apiKey: process.env.LLM_API_KEY?.trim() || "",
      models: {
        parse: process.env.MODEL_PARSE || "nvidia/nemotron-3.5-super-vl:free",
        solve: process.env.MODEL_SOLVE || "nvidia/nemotron-3-ultra-550b-a55b:free",
        fast: process.env.MODEL_FAST || "nvidia/nemotron-3.5-lightning:free",
      },
      noThinking: { reasoning: { enabled: false } },
    };

const useMock = !config.apiKey && process.env.NODE_ENV !== "production";

let client: OpenAI | undefined;
function llm(): OpenAI {
  if (!config.apiKey) throw new LlmError({ kind: "missing_key", message: "NEBIUS_API_KEY is not set on the server." });
  // The SDK retries 429 and 5xx with exponential backoff and honors Retry-After.
  client ??= new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, maxRetries: 4, timeout: 280_000 });
  return client;
}

/** OpenRouter's :free models cost nothing, so only Token Factory calls go through the spending cap. */
async function budgeted<T extends { usage?: { prompt_tokens?: number; completion_tokens?: number } | null }>(
  model: string,
  inputTokens: number,
  maxTokens: number,
  call: () => Promise<T>,
): Promise<T> {
  if (config.provider !== "token-factory") return call();
  let hold;
  try {
    hold = await reserve(model, inputTokens, maxTokens);
  } catch (e) {
    if (e instanceof BudgetExceeded) throw new LlmError({ kind: "budget", message: e.message });
    throw e;
  }
  try {
    const res = await call();
    await hold.settle(res.usage);
    return res;
  } catch (e) {
    await hold.settle(null);
    throw e;
  }
}

export class LlmError extends Error {
  constructor(readonly api: ApiError) {
    super(api.message);
  }
}

export function toApiError(e: unknown): { error: ApiError; status: number } {
  if (e instanceof LlmError) return { error: e.api, status: e.api.kind === "missing_key" ? 500 : e.api.kind === "budget" ? 402 : 502 };
  if (e instanceof OpenAI.APIError) {
    const status = e.status ?? 502;
    if (status === 429) return { error: { kind: "rate_limited", message: e.message }, status: 429 };
    if (status === 401 || status === 403)
      return { error: { kind: "missing_key", message: "The provider rejected the API key." }, status: 500 };
    if (status === 413) return { error: { kind: "too_large", message: e.message }, status: 413 };
    return { error: { kind: "upstream", message: e.message }, status: 502 };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { error: { kind: "upstream", message }, status: 502 };
}

const PARSE_SYSTEM = `You convert scanned or digital exam pages into structured multiple-choice practice questions.

You receive up to three page images, each preceded by "Page N" and the page's extracted text layer (which may be empty for scans). Use the image as the source of truth and the text layer to get exact spelling, code and symbols.

Return one JSON object:
{
  "title": short exam title such as "2024 Midterm" or null,
  "course": course code such as "CSC148" or null,
  "questions": [ ... ],
  "answerKey": [ { "number": "3", "answer": "B" } ]
}

Each question:
- "number": the question number as printed ("3", "4b").
- "topic": a 1 to 3 word topic label in Title Case, e.g. "Recursion", "Big-O", "Linked Lists". Reuse the same label for related questions.
- "prompt": the full question stem. Plain text with Markdown. Put all code in fenced code blocks (\`\`\`python ... \`\`\`) with a language tag, preserving indentation exactly. Leave a blank line between the stem text and each code fence, and never put stem text inside a fence. Write math with Unicode (x², ≤, Θ(n log n)), not LaTeX. Do not include the options in the prompt.
- "options": every choice in order, [{ "label": "A", "text": "..." }]. Use the printed labels (A, B, C, D...). If choices are unlabeled, label them A, B, C... in order. Do not include the label inside "text".
- "answer": the correct option label ONLY if the document itself marks it (answer key, circled or highlighted choice, "Answer: C"). Never guess. Otherwise null.
- "figure": if the question depends on a diagram, graph, table, or image that you cannot faithfully reproduce as text, give { "page": N, "box": [x0, y0, x1, y1] } where the box is the figure's bounding box on that page as fractions of the page width and height (0 to 1, origin top-left). Otherwise null. Code that you transcribed into the prompt does not need a figure.

Include only multiple-choice questions (two or more options). Skip free-response, true/false without options, cover pages and instructions.
If a page is an answer key listing answers for questions, put those in "answerKey" instead of "questions".
If a question is cut off at the end of the last page, include what is visible.
Output JSON only.`;

export async function parseChunk(req: ParseRequest): Promise<ParseResult> {
  if (useMock) return mock.parseChunk(req);
  const content: ChatCompletionContentPart[] = [
    { type: "text", text: `This chunk contains pages ${req.pages.map((p) => p.page).join(", ")} of ${req.totalPages}.` },
  ];
  for (const p of req.pages) {
    content.push({ type: "text", text: `Page ${p.page}\nText layer:\n${p.text.trim() || "(none, scanned page)"}` });
    content.push({ type: "image_url", image_url: { url: p.image } });
  }
  const inputTokens = estimateInputTokens([PARSE_SYSTEM, ...req.pages.map((p) => p.text)], req.pages.length);
  const res = await budgeted(config.models.parse, inputTokens, 12000, () => llm().chat.completions.create({
    model: config.models.parse,
    temperature: 0.1,
    max_tokens: 12000,
    ...(config.noThinking as object),
    response_format: {
      type: "json_schema",
      json_schema: { name: "exam_chunk", strict: false, schema: parseResponseJsonSchema as Record<string, unknown> },
    },
    messages: [
      { role: "system", content: PARSE_SYSTEM },
      { role: "user", content },
    ],
  }));
  const text = res.choices[0]?.message?.content ?? "";
  try {
    return parseChunkOutput(extractJson(text));
  } catch (e) {
    throw new LlmError({ kind: "upstream", message: `Could not read the model's output: ${(e as Error).message}` });
  }
}

const SOLVE_SYSTEM = `You are a patient teaching assistant writing the worked solution to one multiple-choice exam question.
Think it through carefully, then output only this JSON object:
{
  "answer": the correct option label,
  "explanation": 2 to 4 plain sentences on why that answer is right,
  "steps": 2 to 5 short imperative steps a student could follow to get there,
  "whyNot": { "<label of each wrong option>": one short line on the specific mistake that leads to it }
}
Use plain text with inline code in backticks. Write math with Unicode, not LaTeX. If an official answer is given, explain that answer.`;

function formatQuestion(q: SolveRequest["question"]): string {
  const opts = q.options.map((o) => `${o.label}. ${o.text}`).join("\n");
  return `Question ${q.number} (${q.topic})\n\n${q.prompt}\n\nOptions:\n${opts}`;
}

export async function solve(req: SolveRequest): Promise<Solution> {
  if (useMock) return mock.solve(req);
  const q = req.question;
  const user = formatQuestion(q) + (q.answer ? `\n\nOfficial answer: ${q.answer}` : "");
  const res = await budgeted(config.models.solve, estimateInputTokens([SOLVE_SYSTEM, user]), 8000, () => llm().chat.completions.create({
    model: config.models.solve,
    reasoning_effort: "medium",
    max_tokens: 8000,
    messages: [
      { role: "system", content: SOLVE_SYSTEM },
      { role: "user", content: user },
    ],
  }));
  const text = res.choices[0]?.message?.content ?? "";
  try {
    return parseSolutionOutput(
      extractJson(text),
      q.options.map((o) => o.label),
    );
  } catch (e) {
    throw new LlmError({ kind: "upstream", message: `Could not read the solution: ${(e as Error).message}` });
  }
}

function askSystem(req: AskRequest): string {
  const q = req.question;
  const opts = q.options.map((o) => `${o.label}. ${o.text}`).join("\n");
  const context = `Question:\n${q.prompt}\n\nOptions:\n${opts}`;
  const style = "Answer in at most 4 short sentences of plain text, with inline code in backticks and math in Unicode.";
  if (!req.choice || !q.answer) {
    return `You are a tutor helping a student with a multiple-choice question they have not answered yet. Give hints and explain concepts, but never state or strongly imply which option is correct. ${style}\n\n${context}`;
  }
  const s = req.solution;
  const worked = s ? `\n\nWorked solution:\n${s.explanation}\n${s.steps.map((st, i) => `${i + 1}. ${st}`).join("\n")}` : "";
  return `You are a tutor. The student answered ${req.choice}; the correct answer is ${q.answer}. Answer their follow-up directly. ${style}\n\n${context}${worked}`;
}

export async function askStream(req: AskRequest): Promise<ReadableStream<Uint8Array>> {
  if (useMock) return mock.askStream(req);
  const system = askSystem(req);
  const maxTokens = 1500;
  const hold =
    config.provider === "token-factory"
      ? await reserve(config.models.fast, estimateInputTokens([system, ...req.messages.map((m) => m.content)]), maxTokens).catch((e) => {
          throw e instanceof BudgetExceeded ? new LlmError({ kind: "budget", message: e.message }) : e;
        })
      : null;
  let stream;
  try {
    stream = await llm().chat.completions.create({
      model: config.models.fast,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...req.messages],
      // Lightning thinks by default and spends the whole token budget before any visible text.
      ...(config.noThinking as object),
    });
  } catch (e) {
    await hold?.settle(null);
    throw e;
  }
  const encoder = new TextEncoder();
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.usage) usage = chunk.usage;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      } finally {
        await hold?.settle(usage);
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });
}
