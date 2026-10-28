"use client";

import { useSyncExternalStore } from "react";
import { EMBEDDER, type AiMode, type EmbedderId } from "@/lib/domain";
import { AiError } from "./errors";
import type { JsonTaskName, ListTaskName, StreamTaskName, TaskInput, TaskItem, TaskOutput } from "./types";
import { decodeLines, decodeVectors, type StreamEvent, type WireError } from "./wire";

export interface AiStatus {
  mode: AiMode;
  /** null: lexical retrieval only. */
  embedder: EmbedderId | null;
  /** Token Factory only. */
  spend?: { spentUsd: number; capUsd: number };
}

function fromWire(e: WireError | undefined, status: number): AiError {
  if (!e) return new AiError(status === 429 ? "rate_limited" : "upstream", `The AI route answered ${status}.`);
  return new AiError(e.kind, e.message, e.retryAfterMs, e.capUsd);
}

async function post(name: string, input: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
  } catch (e) {
    if (signal?.aborted) throw new AiError("aborted", "Stopped.");
    throw new AiError("offline", e instanceof Error ? e.message : "Network error");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: WireError } | null;
    throw fromWire(body?.error, res.status);
  }
  return res;
}

async function* lines(name: string, input: unknown, signal?: AbortSignal) {
  const res = await post(name, input, signal);
  if (!res.body) throw new AiError("upstream", "Empty response.");
  try {
    for await (const line of decodeLines(res.body)) {
      if (line.t === "error") throw fromWire(line.error, 502);
      yield line;
      if (line.t === "done") return;
    }
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (signal?.aborted) throw new AiError("aborted", "Stopped.");
    throw new AiError("offline", e instanceof Error ? e.message : "The stream broke.");
  } finally {
    scheduleStatusRefresh();
  }
  throw new AiError("upstream", "The stream ended before it finished.");
}

/** One JSON task. Rejects with AiError; `errorCopy(e)` gives the UI line. */
export async function ai<N extends JsonTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): Promise<TaskOutput<N>> {
  try {
    const res = await post(name, input, opts?.signal);
    const body = (await res.json()) as unknown;
    if (name === "embed") return { vectors: decodeVectors((body as { vectors: string[] }).vectors) } as TaskOutput<N>;
    return body as TaskOutput<N>;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (opts?.signal?.aborted) throw new AiError("aborted", "Stopped.");
    throw new AiError("upstream", e instanceof Error ? e.message : String(e));
  } finally {
    scheduleStatusRefresh();
  }
}

/** A list task: each validated item as it arrives. */
export async function* aiItems<N extends ListTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): AsyncGenerator<TaskItem<N>> {
  for await (const line of lines(name, input, opts?.signal)) if (line.t === "item") yield line.v as TaskItem<N>;
}

/** A stream task: text and thinking deltas, then done. */
export async function* aiStream<N extends StreamTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): AsyncGenerator<StreamEvent> {
  for await (const line of lines(name, input, opts?.signal)) {
    if (line.t === "text") yield { type: "text", delta: line.d };
    else if (line.t === "thinking") yield { type: "thinking", delta: line.d };
    else if (line.t === "done") yield { type: "done" };
  }
}

let status: AiStatus | undefined;
const listeners = new Set<() => void>();
let pending: ReturnType<typeof setTimeout> | null = null;

export async function refreshAiStatus(): Promise<AiStatus | undefined> {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (res.ok) {
      status = (await res.json()) as AiStatus;
      listeners.forEach((l) => l());
    }
  } catch {
    // Offline: keep the last known status.
  }
  return status;
}

function scheduleStatusRefresh() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    void refreshAiStatus();
  }, 300);
}

/** GET /api/status, revalidated after each settled call. Undefined until the first answer. */
export function useAiStatus(): AiStatus | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (!status) void refreshAiStatus();
      return () => listeners.delete(l);
    },
    () => status,
    () => undefined,
  );
}

export function embedderFor(mode: AiMode): EmbedderId | null {
  return mode === "token-factory" ? EMBEDDER : null;
}
