import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkSpan, Cutter, type AudioCut } from "./cutter";
import { decodeWav, encodeWav, resample } from "./wav";

const file = fs.readFileSync(path.resolve(import.meta.dirname, "../../../scripts/fixtures/audio/lecture.wav"));
const lecture = decodeWav(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

/** Feeds the file in 128-sample render quanta, the size an AudioWorklet delivers. */
function cutAll(samples: Float32Array, cutter = new Cutter()): AudioCut[] {
  const cuts: AudioCut[] = [];
  for (let i = 0; i < samples.length; i += 128) cuts.push(...cutter.push(samples.subarray(i, i + 128)));
  const rest = cutter.flush();
  return rest ? [...cuts, rest] : cuts;
}

const rms = (s: Float32Array, from: number, to: number) => Math.sqrt(s.subarray(from, to).reduce((a, x) => a + x * x, 0) / (to - from));
const seconds = (n: number) => Math.round((n / 16_000) * 100) / 100;

describe("the audio cutter on scripts/fixtures/audio/lecture.wav", () => {
  const cuts = cutAll(lecture.samples);

  it("reads the fixture as 78.59 s of 16 kHz mono", () => {
    expect(lecture.sampleRate).toBe(16_000);
    expect(seconds(lecture.samples.length)).toBe(78.59);
  });

  it("cuts inside the pauses at 14.3, 26.9, 39.8, 53.4 and 67.7 s", () => {
    expect(cuts.slice(1).map((c) => seconds(c.startSample))).toEqual([14.36, 27, 39.89, 53.45, 67.74]);
  });

  it("keeps every chunk between 12 and 18 s except the last, and loses no sample", () => {
    for (const c of cuts.slice(0, -1)) {
      expect(c.samples.length).toBeGreaterThanOrEqual(12 * 16_000);
      expect(c.samples.length).toBeLessThanOrEqual(18 * 16_000);
    }
    expect(cuts.reduce((n, c) => n + c.samples.length, 0)).toBe(lecture.samples.length);
    cuts.forEach((c, i) => i > 0 && expect(c.startSample).toBe(cuts[i - 1].startSample + cuts[i - 1].samples.length));
  });

  it("never splits a word: 50 ms either side of each cut is quiet", () => {
    for (const c of cuts.slice(1)) expect(rms(lecture.samples, c.startSample - 800, c.startSample + 800)).toBeLessThan(0.006);
  });

  it("falls back to the quietest 200 ms once 18 s arrive without a pause", () => {
    const tone = new Float32Array(20 * 16_000).map((_, i) => 0.3 * Math.sin(i / 3) * (i >= 15.5 * 16_000 && i < 15.7 * 16_000 ? 0.1 : 1));
    const [first] = cutAll(tone);
    expect(seconds(first.samples.length)).toBe(15.6);
  });

  it("exposes the open buffer for partial decodes", () => {
    const cutter = new Cutter();
    cutter.push(lecture.samples.subarray(0, 5 * 16_000));
    expect([cutter.open().startSample, seconds(cutter.open().samples.length), seconds(cutter.totalSamples)]).toEqual([0, 5, 5]);
  });
});

describe("segment timestamps", () => {
  it("places chunks on the lecture clock, continuing after a pause", () => {
    expect(chunkSpan(0, 14.36 * 16_000, 12.64 * 16_000)).toEqual({ startMs: 14_360, durationMs: 12_640 });
    expect(chunkSpan(37 * 60_000 + 30_000, 15 * 16_000, 16_000)).toEqual({ startMs: 37 * 60_000 + 45_000, durationMs: 1000 });
  });
});

describe("wav codec", () => {
  it("round-trips a chunk to 16-bit PCM and back", () => {
    const chunk = lecture.samples.subarray(16_000, 32_000);
    const back = decodeWav(encodeWav(chunk));
    expect([back.sampleRate, back.samples.length]).toEqual([16_000, 16_000]);
    expect(Math.max(...back.samples.map((x, i) => Math.abs(x - chunk[i])))).toBeLessThan(1 / 16_000);
  });

  it("downsamples a 48 kHz capture to 16 kHz without moving a tone", () => {
    const hz = 440;
    const input = new Float32Array(48_000).map((_, i) => Math.sin((2 * Math.PI * hz * i) / 48_000));
    const out = resample(input, 48_000);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 && out[i] >= 0) crossings++;
    expect(out.length).toBe(16_000);
    expect(crossings).toBe(hz - 1);
  });
});
