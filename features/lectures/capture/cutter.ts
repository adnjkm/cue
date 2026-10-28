import { SAMPLE_RATE } from "./wav";

export interface CutterOptions {
  sampleRate?: number;
  minMs?: number;
  maxMs?: number;
  windowMs?: number;
  /** RMS under which a window counts as a pause and cuts early. About -44 dBFS. */
  silence?: number;
}

export interface AudioCut {
  /** Index of the chunk's first sample since the run began. */
  startSample: number;
  samples: Float32Array;
}

/**
 * Cuts a live 16 kHz stream into chunks Parakeet can decode on their own. A chunk ends at the middle of
 * the first 200 ms pause after 12 s; if none comes, it ends at the quietest 200 ms between 12 and 18 s
 * once 18 s have arrived. Cutting inside a pause keeps words whole across chunks.
 */
export class Cutter {
  private readonly rate: number;
  private readonly min: number;
  private readonly max: number;
  private readonly win: number;
  private readonly step: number;
  private readonly silence: number;
  private buf: Float32Array;
  private len = 0;
  private start = 0;
  private checkedTo = 0;

  constructor(opts: CutterOptions = {}) {
    this.rate = opts.sampleRate ?? SAMPLE_RATE;
    this.min = Math.round(((opts.minMs ?? 12_000) * this.rate) / 1000);
    this.max = Math.round(((opts.maxMs ?? 18_000) * this.rate) / 1000);
    this.win = Math.round(((opts.windowMs ?? 200) * this.rate) / 1000);
    this.step = Math.round(this.rate / 100);
    this.silence = opts.silence ?? 0.006;
    this.buf = new Float32Array(this.max + this.rate);
  }

  /** Samples since the run began, including the open buffer. */
  get totalSamples(): number {
    return this.start + this.len;
  }

  /** The audio after the last cut, for partial decodes. */
  open(): { startSample: number; samples: Float32Array } {
    return { startSample: this.start, samples: this.buf.slice(0, this.len) };
  }

  push(frame: Float32Array): AudioCut[] {
    if (this.len + frame.length > this.buf.length) {
      const next = new Float32Array(Math.max(this.buf.length * 2, this.len + frame.length));
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    this.buf.set(frame, this.len);
    this.len += frame.length;
    const cuts: AudioCut[] = [];
    for (let at = this.findCut(); at !== null; at = this.findCut()) cuts.push(this.cutAt(at));
    return cuts;
  }

  /** Whatever is left when the run stops. Null when nothing is buffered. */
  flush(): AudioCut | null {
    if (this.len === 0) return null;
    return this.cutAt(this.len);
  }

  private rms(from: number): number {
    let sum = 0;
    for (let i = from; i < from + this.win; i++) sum += this.buf[i] * this.buf[i];
    return Math.sqrt(sum / this.win);
  }

  private findCut(): number | null {
    for (let w = Math.max(this.min, this.checkedTo); w + this.win <= Math.min(this.len, this.max); w += this.step) {
      this.checkedTo = w + this.step;
      if (this.rms(w) < this.silence) return w + Math.floor(this.win / 2);
    }
    if (this.len < this.max) return null;
    let best = this.min;
    let quietest = Infinity;
    for (let w = this.min; w + this.win <= this.max; w += this.step) {
      const r = this.rms(w);
      if (r < quietest) {
        quietest = r;
        best = w;
      }
    }
    return best + Math.floor(this.win / 2);
  }

  private cutAt(at: number): AudioCut {
    const cut = { startSample: this.start, samples: this.buf.slice(0, at) };
    this.buf.copyWithin(0, at, this.len);
    this.len -= at;
    this.start += at;
    this.checkedTo = 0;
    return cut;
  }
}

/** Where a chunk sits on the lecture clock: a run that resumed at 37:30 puts its first sample at 37:30, not at 0:00. */
export function chunkSpan(resumeAtMs: number, startSample: number, length: number, sampleRate = SAMPLE_RATE): { startMs: number; durationMs: number } {
  return { startMs: Math.round(resumeAtMs + (startSample * 1000) / sampleRate), durationMs: Math.round((length * 1000) / sampleRate) };
}
