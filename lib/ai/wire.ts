import type { AiErrorKind } from "@/lib/domain";

/** What a stream task yields on the client. */
export type StreamEvent = { type: "text"; delta: string } | { type: "thinking"; delta: string } | { type: "done" };

export interface WireError {
  kind: AiErrorKind;
  message: string;
  retryAfterMs?: number;
  capUsd?: number;
}

/** One NDJSON line. Private to lib/ai: features see StreamEvent, items and AiError only. */
export type WireLine =
  | { t: "text"; d: string }
  | { t: "thinking"; d: string }
  | { t: "item"; v: unknown }
  | { t: "done"; dropped?: number }
  | { t: "error"; error: WireError };

export const NDJSON = "application/x-ndjson";

const encoder = new TextEncoder();
export function encodeLine(line: WireLine): Uint8Array {
  return encoder.encode(`${JSON.stringify(line)}\n`);
}

/** Splits a byte stream into parsed lines, holding back a partial last line until it completes. */
export async function* decodeLines(body: ReadableStream<Uint8Array>): AsyncGenerator<WireLine> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line) as WireLine;
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield JSON.parse(rest) as WireLine;
  } finally {
    reader.releaseLock();
  }
}

export function encodeVectors(vectors: readonly Float32Array[]): string[] {
  return vectors.map((v) => {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  });
}

export function decodeVectors(encoded: readonly string[]): Float32Array[] {
  return encoded.map((b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  });
}
