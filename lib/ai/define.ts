import type { z } from "zod";
import type { StreamEvent } from "./wire";
import type { ChatProfileKey } from "./models";

export type ContentPart = { type: "text"; text: string } | { type: "image"; dataUrl: string };
export interface Prompt {
  system: string;
  user: string | readonly ContentPart[];
  /** Earlier turns for chat tasks; trimmed to 12 by lib/chat. */
  history?: readonly { role: "user" | "assistant"; content: string }[];
}

interface TaskCommon<I> {
  input: z.ZodType<I>;
  /** Posted by scripts/check-nemotron.mjs against the live provider. */
  example: NoInfer<I>;
  maxTokens: number | ((input: I) => number);
  /** Overrides the profile's temperature. */
  temperature?: number;
}

/** One JSON object. response_format's JSON schema is derived from `output` with z.toJSONSchema. */
export interface JsonTask<I, O> extends TaskCommon<I> {
  kind: "json";
  profile: ChatProfileKey;
  output: z.ZodType<O>;
  prompt(input: I): Prompt;
  mock(input: I): NoInfer<O> | Promise<NoInfer<O>>;
}

/** A JSON object `{ items: T[] }` streamed item by item; an invalid item is dropped, zero valid items is bad_output. */
export interface ListTask<I, T> extends TaskCommon<I> {
  kind: "list";
  profile: ChatProfileKey;
  item: z.ZodType<T>;
  maxItems: number;
  prompt(input: I): Prompt;
  mock(input: I): readonly NoInfer<T>[];
}

/** Free text with optional thinking. `profile` may depend on the input (ask: Quick → chat, Deep → reason). */
export interface StreamTask<I> extends TaskCommon<I> {
  kind: "stream";
  profile: ChatProfileKey | ((input: I) => ChatProfileKey);
  prompt(input: I): Prompt;
  mock(input: I): AsyncIterable<StreamEvent>;
}

export interface EmbedInput {
  texts: readonly string[];
  as: "document" | "query";
}
export interface EmbedOutput {
  vectors: readonly Float32Array[];
}
export interface EmbedTask extends TaskCommon<EmbedInput> {
  kind: "embed";
  profile: "embed";
  /** Used by check-nemotron in mock mode only; the app never embeds in mock mode. */
  mock(input: EmbedInput): EmbedOutput;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance: the registry keeps each task's real types
export type AnyTask = JsonTask<any, any> | ListTask<any, any> | StreamTask<any> | EmbedTask;

export function jsonTask<I, O>(t: Omit<JsonTask<I, O>, "kind">): JsonTask<I, O> {
  return { ...t, kind: "json" };
}
export function listTask<I, T>(t: Omit<ListTask<I, T>, "kind">): ListTask<I, T> {
  return { ...t, kind: "list" };
}
export function streamTask<I>(t: Omit<StreamTask<I>, "kind">): StreamTask<I> {
  return { ...t, kind: "stream" };
}
export function embedTask(t: Omit<EmbedTask, "kind" | "profile">): EmbedTask {
  return { ...t, kind: "embed", profile: "embed" };
}

/** Prefixes every key, so `defineTasks("lecture", { clean })` registers `lecture.clean`. */
export function defineTasks<P extends string, T extends Record<string, AnyTask>>(prefix: P, tasks: T): { [K in keyof T & string as `${P}.${K}`]: T[K] } {
  return Object.fromEntries(Object.entries(tasks).map(([k, v]) => [`${prefix}.${k}`, v])) as never;
}
