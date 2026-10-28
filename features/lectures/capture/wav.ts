/** Parakeet reads 16 kHz mono, and every stored chunk is kept at that rate. */
export const SAMPLE_RATE = 16_000;

/** 16-bit PCM mono WAV. About 1.9 MB per minute at 16 kHz. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Reads a 16-bit PCM WAV (any channel count, extra chunks allowed) into mono samples. */
export function decodeWav(buffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(buffer);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file.");
  let channels = 1;
  let sampleRate = SAMPLE_RATE;
  let bits = 16;
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === "data") {
      if (bits !== 16) throw new Error(`Only 16-bit WAV is supported, got ${bits}-bit.`);
      const frames = Math.floor(Math.min(size, buffer.byteLength - offset - 8) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += view.getInt16(offset + 8 + (i * channels + c) * 2, true) / 0x8000;
        samples[i] = sum / channels;
      }
      return { samples, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("The WAV file has no data chunk.");
}

/** Box-filter resampling: each output sample averages the input it covers, which is enough to keep speech clean when going down to 16 kHz. */
export function resample(input: Float32Array, fromRate: number, toRate = SAMPLE_RATE): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = i * ratio;
    const b = Math.min(input.length, a + Math.max(1, ratio));
    let sum = 0;
    let n = 0;
    for (let j = Math.floor(a); j < b; j++, n++) sum += input[j];
    out[i] = n ? sum / n : 0;
  }
  return out;
}
