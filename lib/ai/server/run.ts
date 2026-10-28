import "server-only";
import { z } from "zod";
import { ids, type EpochMs, type HoldId, type MicroUsd } from "@/lib/domain";
import type { AnyTask, ContentPart, EmbedTask, JsonTask, ListTask, Prompt, StreamTask } from "../define";
import { AiError, STATUS_OF } from "../errors";
import { extractJson, ItemSplitter } from "../json";
import { costMicro, HOLD_TTL_MS, IMAGE_TOKENS, PROFILES, ROUTE_BUDGET_MS, type ChatProfileKey, type ModelKey } from "../models";
import { encodeLine, encodeVectors, NDJSON, type WireError, type WireLine } from "../wire";
import { openAiBackend, UpstreamError, type Backend, type ChatRequest, type Usage } from "./backend";
import { aiModeFromEnv, capFromEnv, ledgerFromEnv, throttleFromEnv } from "./env";
import type { LedgerStore } from "./ledger";
import type { ClientThrottle } from "./throttle";

export interface RunContext {
  signal: AbortSignal;
  clientKey: string;
  origin: string | null;
  host: string;
}

export interface RunDeps {
  env: Record<string, string | undefined>;
  registry: Record<string, AnyTask>;
  now: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  ledger: () => LedgerStore | null;
  throttle: ClientThrottle;
  backend: (mode: "token-factory" | "openrouter") => Backend;
}

const RETRY_FLOOR_MS = 30_000;
const MAX_RETRY_WAIT_MS = 20_000;
export const QUERY_PREFIX = "Instruct: Given a student question, retrieve relevant course material\nQuery: ";

function errorResponse(e: AiError, status?: number): Response {
  const body: { error: WireError } = {
    error: { kind: e.kind, message: e.message, ...(e.retryAfterMs !== undefined ? { retryAfterMs: e.retryAfterMs } : {}), ...(e.capUsd !== undefined ? { capUsd: e.capUsd } : {}) },
  };
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (e.retryAfterMs !== undefined) headers["retry-after"] = String(Math.ceil(e.retryAfterMs / 1000));
  return Response.json(body, { status: status ?? (e.kind === "offline" || e.kind === "aborted" ? 499 : STATUS_OF[e.kind]), headers });
}

function toWireError(e: unknown): WireError {
  if (e instanceof AiError) return { kind: e.kind, message: e.message, ...(e.capUsd !== undefined ? { capUsd: e.capUsd } : {}), ...(e.retryAfterMs !== undefined ? { retryAfterMs: e.retryAfterMs } : {}) };
  return { kind: "upstream", message: e instanceof Error ? e.message : String(e) };
}

function ndjson(run: (send: (line: WireLine) => void) => Promise<void>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: WireLine) => controller.enqueue(encodeLine(line));
      try {
        await run(send);
      } catch (e) {
        send({ t: "error", error: toWireError(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": NDJSON, "cache-control": "no-store" } });
}

function promptText(prompt: Prompt): { chars: number; images: number } {
  const parts: readonly (ContentPart | { type: "text"; text: string })[] = typeof prompt.user === "string" ? [{ type: "text", text: prompt.user }] : prompt.user;
  const history = (prompt.history ?? []).reduce((n, h) => n + h.content.length, 0);
  return {
    chars: prompt.system.length + history + parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0),
    images: parts.filter((p) => p.type === "image").length,
  };
}

/** Characters / 3 plus a worst-case image cost. */
export function estimateInputTokens(prompt: Prompt): number {
  const { chars, images } = promptText(prompt);
  return Math.ceil(chars / 3) + images * IMAGE_TOKENS;
}

/** Keywords Token Factory's grammar compiler rejects with a 400 (measured: z.record emits propertyNames). */
const UNSUPPORTED = new Set(["$schema", "propertyNames"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).filter(([k]) => !UNSUPPORTED.has(k)).map(([k, v]) => [k, strip(v)]));
  return node;
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })) as Record<string, unknown>;
}

function withSchemaNote(prompt: Prompt, schema: Record<string, unknown>): Prompt {
  // With thinking on, the grammar constrains only `content`; describing the JSON keeps the reasoning aimed at it (measured).
  return { ...prompt, system: `${prompt.system}\n\nReply with one JSON object that matches this JSON schema:\n${JSON.stringify(schema)}` };
}

function isAbort(e: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (e instanceof Error && e.name === "AbortError" && signal.aborted);
}

function mapUpstream(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof UpstreamError) {
    if (e.status === 429) return new AiError("rate_limited", "Nemotron is rate limiting requests.", e.retryAfterMs);
    if (e.status === 401 || e.status === 403) return new AiError("missing_key", "The provider rejected the API key.");
    if (e.status === 413) return new AiError("too_large", e.message);
    return new AiError("upstream", e.message);
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return new AiError("upstream", "Nemotron took too long to answer.");
  return new AiError("upstream", e instanceof Error ? e.message : String(e));
}

function retryable(e: unknown): boolean {
  if (e instanceof UpstreamError) return e.status === null || e.status === 429 || e.status >= 500;
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

interface Call {
  ctx: RunContext;
  deps: RunDeps;
  deadline: number;
  model: ModelKey;
  /** Null outside Token Factory: OpenRouter :free calls are not reserved. */
  ledger: { store: LedgerStore; cap: MicroUsd } | null;
}

/**
 * One upstream attempt loop. Every attempt reserves its own worst case and settles to real usage (or the worst
 * case when usage is missing). Retries 429, 5xx and timeouts while more than 30 s of the shared deadline remain.
 */
async function attempts<T>(call: Call, worst: MicroUsd, run: (signal: AbortSignal, settle: (usage?: Usage) => Promise<void>) => Promise<T>): Promise<T> {
  const { deps, ctx } = call;
  for (let n = 0; ; n++) {
    const remaining = call.deadline - deps.now();
    if (remaining <= 0) throw new AiError("upstream", "Nemotron took too long to answer.");
    let holdId: HoldId | null = null;
    if (call.ledger) {
      holdId = ids.hold();
      const now = deps.now() as EpochMs;
      const r = await call.ledger.store.reserve({ id: holdId, amount: worst, expiresAt: (now + HOLD_TTL_MS) as EpochMs }, call.ledger.cap, now);
      if (!r.ok) throw new AiError("budget", "The spending cap is reached.", undefined, call.ledger.cap / 1e6);
    }
    let settled = false;
    const settle = async (usage?: Usage) => {
      if (settled || !holdId || !call.ledger) return;
      settled = true;
      const actual = usage?.prompt_tokens !== undefined ? costMicro(call.model, usage.prompt_tokens, usage.completion_tokens ?? 0) : worst;
      await call.ledger.store.settle(holdId, actual);
    };
    try {
      return await run(AbortSignal.any([ctx.signal, AbortSignal.timeout(remaining)]), settle);
    } catch (e) {
      // A 4xx answer is a refusal before any generation, so it bills nothing; anything else may have billed.
      const refused = e instanceof UpstreamError && e.status !== null && e.status >= 400 && e.status < 500 && e.status !== 408;
      await settle(refused ? { prompt_tokens: 0, completion_tokens: 0 } : undefined);
      if (isAbort(e, ctx.signal)) throw new AiError("aborted", "The request was cancelled.");
      const left = call.deadline - deps.now();
      if (!(e instanceof AiError) && retryable(e) && left > RETRY_FLOOR_MS) {
        const hinted = e instanceof UpstreamError ? e.retryAfterMs : undefined;
        await deps.sleep(Math.min(hinted ?? 1000 * 2 ** n, MAX_RETRY_WAIT_MS, left - RETRY_FLOOR_MS), ctx.signal);
        continue;
      }
      throw mapUpstream(e);
    }
  }
}

function chatProfile(task: JsonTask<unknown, unknown> | ListTask<unknown, unknown> | StreamTask<unknown>, input: unknown) {
  const key: ChatProfileKey = typeof task.profile === "function" ? task.profile(input) : task.profile;
  return PROFILES[key];
}

const maxTokensOf = (task: AnyTask, input: unknown) => (typeof task.maxTokens === "function" ? (task.maxTokens as (i: unknown) => number)(input) : task.maxTokens);

async function runJson(call: Call, task: JsonTask<unknown, unknown>, input: unknown, backend: Backend): Promise<Response> {
  const profile = chatProfile(task, input);
  const schema = jsonSchemaOf(task.output);
  const prompt = withSchemaNote(task.prompt(input), schema);
  const maxTokens = maxTokensOf(task, input);
  const req: ChatRequest = { model: profile.model, prompt, maxTokens, temperature: task.temperature ?? profile.temperature, thinking: profile.thinking, schema };
  const worst = costMicro(profile.model, estimateInputTokens(prompt), maxTokens);
  const parse = (content: string): { ok: true; value: unknown } | { ok: false; why: string } => {
    if (!content.trim()) return { ok: false, why: "The reply was empty." };
    let raw: unknown;
    try {
      raw = extractJson(content);
    } catch (e) {
      return { ok: false, why: `The reply was not JSON: ${(e as Error).message}` };
    }
    const r = task.output.safeParse(raw);
    return r.success ? { ok: true, value: r.data } : { ok: false, why: z.prettifyError(r.error) };
  };
  const first = await attempts(call, worst, async (signal, settle) => {
    const res = await backend.complete(req, signal);
    await settle(res.usage);
    return res.content;
  });
  const parsed = parse(first);
  if (parsed.ok) return Response.json(parsed.value, { headers: { "cache-control": "no-store" } });
  const repair: ChatRequest = {
    ...req,
    extra: [
      { role: "assistant", content: first },
      { role: "user", content: `That reply did not match the schema. ${parsed.why}\nReply with the corrected JSON object only.` },
    ],
  };
  const second = await attempts(call, costMicro(profile.model, estimateInputTokens(prompt) + Math.ceil(first.length / 3), maxTokens), async (signal, settle) => {
    const res = await backend.complete(repair, signal);
    await settle(res.usage);
    return res.content;
  });
  const repaired = parse(second);
  if (repaired.ok) return Response.json(repaired.value, { headers: { "cache-control": "no-store" } });
  return errorResponse(new AiError("bad_output", `Nemotron's JSON did not match the schema. ${repaired.why}`));
}

/**
 * Opens the upstream stream inside the attempt loop and reads until the first delta worth forwarding, so a
 * retry can never duplicate text the browser already has.
 */
async function openStream(call: Call, req: ChatRequest, backend: Backend, worst: MicroUsd, wants: (d: { text?: string; thinking?: string }) => boolean) {
  return attempts(call, worst, async (signal, settle) => {
    const it = (await backend.stream(req, signal))[Symbol.asyncIterator]();
    const head: { text?: string; thinking?: string; usage?: Usage }[] = [];
    for (;;) {
      const r = await it.next();
      if (r.done) {
        await settle(head.find((h) => h.usage)?.usage);
        return { head, rest: null, settle };
      }
      head.push(r.value);
      if (wants(r.value)) return { head, rest: it, settle };
    }
  });
}

async function runStream(call: Call, task: StreamTask<unknown>, input: unknown, backend: Backend): Promise<Response> {
  const profile = chatProfile(task, input);
  const prompt = task.prompt(input);
  const maxTokens = maxTokensOf(task, input);
  const req: ChatRequest = { model: profile.model, prompt, maxTokens, temperature: task.temperature ?? profile.temperature, thinking: profile.thinking };
  const worst = costMicro(profile.model, estimateInputTokens(prompt), maxTokens);
  const opened = await openStream(call, req, backend, worst, (d) => Boolean(d.text || d.thinking));
  return ndjson(async (send) => {
    let usage: Usage | undefined;
    let text = "";
    const forward = (d: { text?: string; thinking?: string; usage?: Usage }) => {
      if (d.usage) usage = d.usage;
      if (d.thinking) send({ t: "thinking", d: d.thinking });
      if (d.text) {
        text += d.text;
        send({ t: "text", d: d.text });
      }
    };
    try {
      opened.head.forEach(forward);
      if (opened.rest) for (let r = await opened.rest.next(); !r.done; r = await opened.rest.next()) forward(r.value);
      if (!text.trim()) throw new AiError("bad_output", "Nemotron returned an empty answer.");
      send({ t: "done" });
    } finally {
      await opened.settle(usage);
    }
  });
}

async function runList(call: Call, task: ListTask<unknown, unknown>, input: unknown, backend: Backend): Promise<Response> {
  const profile = chatProfile(task, input);
  const schema = { type: "object", properties: { items: { type: "array", items: jsonSchemaOf(task.item), maxItems: task.maxItems } }, required: ["items"] };
  const prompt = withSchemaNote(task.prompt(input), schema);
  const maxTokens = maxTokensOf(task, input);
  const req: ChatRequest = { model: profile.model, prompt, maxTokens, temperature: task.temperature ?? profile.temperature, thinking: profile.thinking, schema };
  const worst = costMicro(profile.model, estimateInputTokens(prompt), maxTokens);
  const opened = await openStream(call, req, backend, worst, (d) => Boolean(d.text));
  return ndjson(async (send) => {
    let usage: Usage | undefined;
    let sent = 0;
    let dropped = 0;
    const splitter = new ItemSplitter();
    const feed = (d: { text?: string; usage?: Usage }) => {
      if (d.usage) usage = d.usage;
      if (!d.text) return;
      for (const raw of splitter.push(d.text)) {
        if (sent >= task.maxItems) return;
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          dropped++;
          continue;
        }
        const r = task.item.safeParse(value);
        if (r.success) {
          sent++;
          send({ t: "item", v: r.data });
        } else dropped++;
      }
    };
    try {
      opened.head.forEach(feed);
      if (opened.rest) for (let r = await opened.rest.next(); !r.done; r = await opened.rest.next()) feed(r.value);
      if (sent === 0) throw new AiError("bad_output", "Nemotron returned no valid items.");
      send({ t: "done", ...(dropped ? { dropped } : {}) });
    } finally {
      await opened.settle(usage);
    }
  });
}

async function runEmbed(call: Call, task: EmbedTask, input: { texts: readonly string[]; as: "document" | "query" }, backend: Backend): Promise<Response> {
  const texts = input.as === "query" ? input.texts.map((t) => QUERY_PREFIX + t) : input.texts;
  const worst = costMicro("qwenEmbed", Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 3) + texts.length, 0);
  const res = await attempts(call, worst, async (signal, settle) => {
    const r = await backend.embed({ texts }, signal);
    await settle(r.usage);
    return r;
  });
  void task;
  return Response.json({ vectors: encodeVectors(res.vectors) }, { headers: { "cache-control": "no-store" } });
}

async function runMock(task: AnyTask, input: never): Promise<Response> {
  switch (task.kind) {
    case "json":
      return Response.json(await task.mock(input), { headers: { "cache-control": "no-store" } });
    case "embed":
      return Response.json({ vectors: encodeVectors([...task.mock(input).vectors]) }, { headers: { "cache-control": "no-store" } });
    case "list":
      return ndjson(async (send) => {
        // Paced like a real stream, so the screens that fill in item by item can be seen doing it.
        for (const v of task.mock(input)) {
          await new Promise((r) => setTimeout(r, 300));
          send({ t: "item", v });
        }
        send({ t: "done" });
      });
    case "stream":
      return ndjson(async (send) => {
        for await (const e of task.mock(input)) {
          if (e.type === "text") send({ t: "text", d: e.delta });
          else if (e.type === "thinking") send({ t: "thinking", d: e.delta });
        }
        send({ t: "done" });
      });
  }
}

let defaults: RunDeps | null = null;

/** Lazily built so tests can import this module with their own deps. */
async function defaultDeps(): Promise<RunDeps> {
  if (defaults) return defaults;
  const { registry } = await import("../registry");
  const throttle = throttleFromEnv(process.env);
  let ledger: LedgerStore | null | undefined;
  defaults = {
    env: process.env,
    registry,
    now: () => Date.now(),
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
      }),
    ledger: () => (ledger === undefined ? (ledger = ledgerFromEnv(process.env)) : ledger),
    throttle,
    backend: (mode) => openAiBackend(mode, process.env),
  };
  return defaults;
}

/**
 * The gateway behind app/api/ai/[task]/route.ts: same-origin check and client throttle, input validation,
 * mock or provider call under one deadline, and errors mapped to { error } with their status codes.
 */
export async function runTask(name: string, body: unknown, ctx: RunContext, injected?: RunDeps): Promise<Response> {
  const deps = injected ?? (await defaultDeps());
  const started = deps.now();
  try {
    if (ctx.origin) {
      let host: string | null = null;
      try {
        host = new URL(ctx.origin).host;
      } catch {
        host = null;
      }
      if (host !== ctx.host) return errorResponse(new AiError("bad_input", "Cross-origin requests are refused."), 403);
    }
    const task = Object.hasOwn(deps.registry, name) ? deps.registry[name] : undefined;
    if (!task) return errorResponse(new AiError("bad_input", `Unknown task "${name}".`), 404);
    const parsed = task.input.safeParse(body);
    if (!parsed.success) return errorResponse(new AiError("bad_input", z.prettifyError(parsed.error)));
    const input = parsed.data as never;

    const mode = aiModeFromEnv(deps.env);
    if (typeof mode !== "string") return errorResponse(new AiError("missing_key", "No model provider is configured: set NEBIUS_API_KEY."));
    if (mode === "mock") return await runMock(task, input);

    const gate = await deps.throttle.take(ctx.clientKey, deps.now() as EpochMs);
    if (!gate.ok) return errorResponse(new AiError("rate_limited", "Too many requests from this browser.", gate.retryAfterMs));

    let ledger: Call["ledger"] = null;
    if (mode === "token-factory") {
      const cap = capFromEnv(deps.env);
      const store = deps.ledger();
      if (cap === null || store === null) return errorResponse(new AiError("budget", "The spending cap can't be checked, so paid calls are off."));
      ledger = { store, cap };
    } else if (task.kind === "embed") {
      return errorResponse(new AiError("bad_input", "Embeddings run on Token Factory only."));
    }
    const backend = deps.backend(mode);
    const model = task.kind === "embed" ? "qwenEmbed" : chatProfile(task, input).model;
    const call: Call = { ctx, deps, deadline: started + ROUTE_BUDGET_MS, model, ledger };
    switch (task.kind) {
      case "json":
        return await runJson(call, task, input, backend);
      case "list":
        return await runList(call, task, input, backend);
      case "stream":
        return await runStream(call, task, input, backend);
      case "embed":
        return await runEmbed(call, task, input, backend);
    }
  } catch (e) {
    return errorResponse(e instanceof AiError ? e : mapUpstream(e));
  }
}

/** For GET /api/ai: every task with its profile and example, which check-nemotron posts. */
export async function taskList(): Promise<{ name: string; kind: AnyTask["kind"]; profile: string; example: unknown }[]> {
  const { registry } = await defaultDeps();
  return Object.entries(registry).map(([name, task]) => ({
    name,
    kind: task.kind,
    profile: typeof task.profile === "function" ? "input-dependent" : task.profile,
    example: task.example,
  }));
}

export async function spendStatus(): Promise<{ spentUsd: number; capUsd: number } | null> {
  const deps = await defaultDeps();
  const cap = capFromEnv(deps.env);
  const store = deps.ledger();
  if (cap === null || store === null) return null;
  const s = await store.status(deps.now() as EpochMs);
  return { spentUsd: s.spent / 1e6, capUsd: cap / 1e6 };
}
