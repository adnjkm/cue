import type { BlockKind, Passage, StepKind } from "@/lib/domain";

/** What `study.plan` reads. Built in the browser by sources.ts; validated on the server by tasks.ts. */
export interface StudyPlanInput {
  block: {
    kind: BlockKind;
    course: string | null;
    topic: string;
    /** "Review 1 day after lecture". */
    reason: string;
    note: string | null;
    minutes: number;
    /** Block minus Pomodoro breaks; step minutes must add up to this. */
    focusMinutes: number;
  };
  /** The lecture's slide outline: slide n is headings[n - 1]. Ranges are picked by number, since one passage names one slide. */
  deck: { title: string; headings: string[] } | null;
  /** Exam hints and lines the student flagged, newest lecture first. A moment names one of these. */
  flagged: { id: `F${number}`; at: string; quote: string }[];
  /** Readings and transcript windows, cited as S#. */
  passages: Passage[];
  practiceCount: number;
}

/** What `study.plan` answers. Ids are resolved and minutes rescaled by model.ts, never trusted as given. */
export interface PlanDraft {
  steps: {
    title: string;
    kind: StepKind;
    minutes: number;
    slides: { from: number; to: number } | null;
    source: string | null;
    check: string;
  }[];
  moment: string | null;
}

/**
 * Whole minutes, each at least 1, that add up to `total` and keep the proportions of `weights`
 * (largest remainder; ties go to the earlier step, so the result is deterministic).
 */
export function normalizeMinutes(weights: readonly number[], total: number): number[] {
  const whole = Math.max(0, Math.floor(total));
  const n = Math.min(weights.length, whole);
  if (n === 0) return [];
  const clean = weights.slice(0, n).map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  const exact = clean.map((w) => (sum > 0 ? (w / sum) * whole : whole / n));
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0, left = whole - out.reduce((a, b) => a + b, 0); left > 0; k++, left--) out[order[k % n].i] += 1;
  for (let i = 0; i < n; i++) {
    if (out[i] > 0) continue;
    const donor = out.reduce((best, m, j) => (m > out[best] ? j : best), 0);
    out[donor] -= 1;
    out[i] = 1;
  }
  return out;
}
