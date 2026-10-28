import "server-only";
import OpenAI from "openai";
import type { AiMode } from "@/lib/domain";
import type { Prompt } from "../define";
import { EMBED_DIMENSIONS, MODELS, type ModelKey } from "../models";

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface ChatRequest {
  model: Exclude<ModelKey, "qwenEmbed">;
  prompt: Prompt;
  maxTokens: number;
  temperature: number;
  thinking: boolean;
  /** JSON schema for response_format; omitted for free text. */
  schema?: Record<string, unknown>;
  /** Extra turns appended after the prompt (the repair attempt). */
  extra?: readonly { role: "user" | "assistant"; content: string }[];
}

export interface StreamDelta {
  text?: string;
  thinking?: string;
  usage?: Usage;
}

/** What runTask needs from a provider. Tests swap in a fake to drive the deadline and retry rules. */
export interface Backend {
  complete(req: ChatRequest, signal: AbortSignal): Promise<{ content: string; usage?: Usage }>;
  stream(req: ChatRequest, signal: AbortSignal): Promise<AsyncIterable<StreamDelta>>;
  embed(req: { texts: readonly string[] }, signal: AbortSignal): Promise<{ vectors: Float32Array[]; usage?: Usage }>;
}

/** An upstream failure, classified once so the retry loop never inspects SDK error types. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

function messagesFor(req: ChatRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
  const { prompt } = req;
  const user: OpenAI.Chat.ChatCompletionMessageParam =
    typeof prompt.user === "string"
      ? { role: "user", content: prompt.user }
      : {
          role: "user",
          content: prompt.user.map((p) => (p.type === "text" ? { type: "text" as const, text: p.text } : { type: "image_url" as const, image_url: { url: p.dataUrl } })),
        };
  return [{ role: "system", content: prompt.system }, ...(prompt.history ?? []).map((h) => ({ role: h.role, content: h.content })), user, ...(req.extra ?? [])];
}

function retryAfter(headers: Headers | undefined): number | undefined {
  const raw = headers?.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

function classify(e: unknown): unknown {
  if (e instanceof OpenAI.APIError) {
    if (e instanceof OpenAI.APIConnectionError) return new UpstreamError(e.message, null);
    return new UpstreamError(e.message, e.status ?? null, retryAfter(e.headers as Headers | undefined));
  }
  return e;
}

export function openAiBackend(mode: Exclude<AiMode, "mock">, env: Record<string, string | undefined>): Backend {
  const tokenFactory = mode === "token-factory";
  const client = new OpenAI({
    baseURL: tokenFactory ? "https://api.tokenfactory.nebius.com/v1" : "https://openrouter.ai/api/v1",
    apiKey: (tokenFactory ? env.NEBIUS_API_KEY : env.LLM_API_KEY)?.trim() ?? "",
    maxRetries: 0,
  });
  const modelId = (model: ModelKey) => {
    const spec = MODELS[model];
    const id = tokenFactory ? spec.tokenFactory : spec.openRouter;
    if (!id) throw new UpstreamError(`${model} is not offered on ${mode}`, 400);
    return id;
  };
  const body = (req: ChatRequest) => ({
    model: modelId(req.model),
    messages: messagesFor(req),
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    ...(tokenFactory ? { chat_template_kwargs: { enable_thinking: req.thinking } } : { reasoning: { enabled: req.thinking } }),
    ...(req.schema ? { response_format: { type: "json_schema" as const, json_schema: { name: "output", strict: false, schema: req.schema } } } : {}),
  });

  return {
    async complete(req, signal) {
      try {
        const res = await client.chat.completions.create(body(req) as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, { signal });
        return { content: res.choices[0]?.message?.content ?? "", usage: res.usage ?? undefined };
      } catch (e) {
        throw classify(e);
      }
    },
    async stream(req, signal) {
      let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      try {
        stream = await client.chat.completions.create({ ...body(req), stream: true, stream_options: { include_usage: true } } as OpenAI.Chat.ChatCompletionCreateParamsStreaming, {
          signal,
        });
      } catch (e) {
        throw classify(e);
      }
      return (async function* () {
        try {
          for await (const chunk of stream) {
            // The usage chunk arrives last with choices: [], so choices[0] must not be assumed.
            const delta = chunk.choices[0]?.delta as { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } | undefined;
            const thinking = delta?.reasoning_content ?? delta?.reasoning ?? undefined;
            yield { text: delta?.content ?? undefined, thinking: thinking ?? undefined, usage: chunk.usage ?? undefined };
          }
        } catch (e) {
          throw classify(e);
        }
      })();
    },
    async embed(req, signal) {
      try {
        const res = await client.embeddings.create(
          { model: modelId("qwenEmbed"), input: [...req.texts], dimensions: EMBED_DIMENSIONS, encoding_format: "base64" },
          { signal },
        );
        const vectors = res.data.map((d) => {
          const raw = d.embedding as unknown;
          if (Array.isArray(raw)) return Float32Array.from(raw as number[]);
          const bytes = Buffer.from(raw as string, "base64");
          return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        });
        return { vectors, usage: res.usage ? { prompt_tokens: res.usage.prompt_tokens, completion_tokens: 0 } : undefined };
      } catch (e) {
        throw classify(e);
      }
    },
  };
}
