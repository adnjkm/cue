"use client";

import { resample, SAMPLE_RATE } from "./wav";

export type MicFailure = "micDenied" | "noMic";

export class MicError extends Error {
  constructor(readonly reason: MicFailure) {
    super(reason === "micDenied" ? "Microphone access was blocked." : "No microphone was found.");
  }
}

/** Asks for the microphone. Speech cleanup stays on so a lecture hall's hum does not swamp the voice. */
export async function openMic(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicError("noMic");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new MicError(name === "NotFoundError" || name === "OverconstrainedError" ? "noMic" : "micDenied");
  }
}

export function closeMic(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** 16 kHz mono frames from the stream until `signal` aborts. Chrome resamples in the AudioContext; other browsers are resampled here. */
export async function* micFrames(stream: MediaStream, signal: AbortSignal): AsyncGenerator<Float32Array> {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  } catch {
    ctx = new AudioContext();
  }
  const queue: Float32Array[] = [];
  let wake: (() => void) | null = null;
  try {
    await ctx.audioWorklet.addModule("/lectures/pcm-capture.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "cue-pcm-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      queue.push(ctx.sampleRate === SAMPLE_RATE ? e.data : resample(e.data, ctx.sampleRate));
      wake?.();
    };
    source.connect(node);
    signal.addEventListener("abort", () => wake?.(), { once: true });
    while (!signal.aborted) {
      const frame = queue.shift();
      if (frame) {
        yield frame;
        continue;
      }
      await new Promise<void>((resolve) => (wake = resolve));
      wake = null;
    }
    while (queue.length) yield queue.shift()!;
    source.disconnect();
    node.disconnect();
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
