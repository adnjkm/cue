"use client";

import type { AudioChunk, EngineEvent, EngineSource, TranscriptionEngine } from "@/lib/domain";
import { chunkSpan, Cutter } from "../capture/cutter";
import { micFrames } from "../capture/mic";
import { decodeWav, encodeWav, SAMPLE_RATE } from "../capture/wav";
import { PARAKEET_WEIGHTS, type Backend, type FromWorker, type ToWorker } from "./protocol";

export type EngineFailure = "noBackend" | "download" | "runtime";

export class EngineError extends Error {
  constructor(
    readonly reason: EngineFailure,
    message: string,
  ) {
    super(message);
  }
}

/** WebGPU when the browser hands out an adapter, else WASM. Null means this browser cannot run the model at all. */
export async function detectBackend(): Promise<Backend | null> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      if (await gpu.requestAdapter()) return "webgpu";
    } catch {
      // No usable adapter: fall through to WASM.
    }
  }
  return typeof WebAssembly === "object" ? "wasm" : null;
}

/** Partials re-decode the open buffer this often, on WebGPU only: on WASM a decode takes longer than the speech it covers. */
const PARTIAL_EVERY_SAMPLES = 3 * SAMPLE_RATE;

class Parakeet implements TranscriptionEngine {
  readonly id = "parakeet" as const;
  backend: Backend | null = null;
  private worker: Worker | null = null;
  private loading: Promise<void> | null = null;
  private progress: ((p: { loadedBytes: number; totalBytes: number }) => void) | null = null;
  private calls = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>();
  private nextCall = 0;

  get capabilities() {
    return { partials: this.backend === "webgpu", needsDownloadBytes: PARAKEET_WEIGHTS[this.backend ?? "webgpu"].bytes };
  }

  /** Loads the model once per page. The weights stay in Cache Storage, so later visits skip the download. */
  prepare(onProgress: (p: { loadedBytes: number; totalBytes: number }) => void, signal: AbortSignal): Promise<void> {
    this.progress = onProgress;
    this.loading ??= this.load().catch((e: unknown) => {
      this.reset();
      throw e;
    });
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Stopped", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      this.loading!.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }

  private async load(): Promise<void> {
    this.backend = await detectBackend();
    if (!this.backend) throw new EngineError("noBackend", "This browser can run neither WebGPU nor WebAssembly.");
    const worker = new Worker(new URL("./parakeet.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === "progress") this.progress?.({ loadedBytes: m.loaded, totalBytes: m.total });
        else if (m.type === "ready") resolve();
        else if (m.type === "result") this.settle(m.id, m.text);
        else if (m.id === undefined) reject(new EngineError(m.stage, m.message));
        else this.settle(m.id, new EngineError(m.stage, m.message));
      };
      worker.onerror = (e) => {
        const err = new EngineError("runtime", e.message || "The speech worker stopped.");
        reject(err);
        for (const id of [...this.calls.keys()]) this.settle(id, err);
      };
      this.send({ type: "load", backend: this.backend! });
    });
  }

  private reset() {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
  }

  private send(m: ToWorker, transfer: Transferable[] = []) {
    this.worker?.postMessage(m, transfer);
  }

  private settle(id: number, result: string | Error) {
    const call = this.calls.get(id);
    this.calls.delete(id);
    if (!call) return;
    if (typeof result === "string") call.resolve(result);
    else call.reject(result);
  }

  private transcribe(samples: Float32Array): Promise<string> {
    if (!this.worker) return Promise.reject(new EngineError("runtime", "The speech model is not loaded."));
    const id = this.nextCall++;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.send({ type: "transcribe", id, samples }, [samples.buffer]);
    });
  }

  /**
   * Captures, cuts and stores; it does not wait for text. Each cut leaves as an `audio` event, the recorder
   * stores it, and the queue drain transcribes stored chunks in order. So a slow WASM decode delays lines
   * but never drops audio, and the tail cut on pause is kept the same way.
   */
  async *run(source: EngineSource, signal: AbortSignal): AsyncIterable<EngineEvent> {
    if (source.kind !== "mic") throw new Error("Parakeet transcribes the microphone.");
    const cutter = new Cutter();
    let seq = 0;
    let partialAt = 0;
    const audio = (startSample: number, samples: Float32Array): EngineEvent => {
      const { startMs, durationMs } = chunkSpan(source.resumeAtMs, startSample, samples.length);
      return { type: "audio", chunk: { seq: seq++, startMs, durationMs, wav: new Blob([encodeWav(samples)], { type: "audio/wav" }) } };
    };
    for await (const frame of micFrames(source.stream, signal)) {
      for (const cut of cutter.push(frame)) {
        partialAt = cutter.totalSamples;
        yield audio(cut.startSample, cut.samples);
      }
      if (this.capabilities.partials && !signal.aborted && cutter.totalSamples - partialAt >= PARTIAL_EVERY_SAMPLES) {
        partialAt = cutter.totalSamples;
        const open = cutter.open();
        if (open.samples.length >= SAMPLE_RATE) {
          const text = await this.transcribe(open.samples).catch(() => null);
          if (text !== null) yield { type: "partial", atMs: chunkSpan(source.resumeAtMs, open.startSample, 0).startMs, text };
        }
      }
    }
    const tail = cutter.flush();
    if (tail && tail.samples.length >= SAMPLE_RATE / 2) yield audio(tail.startSample, tail.samples);
  }

  async transcribeStored(chunk: AudioChunk, signal: AbortSignal): Promise<{ raw: string }> {
    const { samples } = decodeWav(await chunk.wav.arrayBuffer());
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    return { raw: await this.transcribe(samples) };
  }
}

export const parakeetEngine = new Parakeet();
