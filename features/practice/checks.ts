import type { Option } from "@/lib/domain";
import { normalizeLabel } from "./schema";
import type { GeneratedQuestion } from "./types";

const LABELS = ["A", "B", "C", "D"] as const;

export type Rejection = "labels" | "optionsRepeat" | "answerNotAnOption" | "whyNotMissing" | "duplicateStem";

export interface CheckedQuestion {
  prompt: string;
  options: Option[];
  answer: string;
  explanation: string;
  steps: { label: string; text: string }[];
  conclusion: string;
  /** Exactly one note per wrong option. */
  whyNot: Record<string, string>;
  sources: string[];
}

/** Lowercased words with code fences, quotes and punctuation removed, so a reworded copy still compares equal. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/```[a-z]*/g, " ")
    .replace(/[`*_"'“”‘’.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Equal after normalizing, or near equal on a long stem. Short stems must match exactly, because "Postorder
 * visits the root…" and "Preorder visits the root…" differ by one word and are different questions.
 */
export function sameStem(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  return Math.min(wa.size, wb.size) >= 8 && jaccard(wa, wb) >= 0.9;
}

/**
 * Decides whether a written question may reach the student, before the independent re-answer: four options
 * labelled A to D with distinct meanings, an answer that is one of them, a note for every wrong option and
 * a stem that repeats no question the set already has.
 */
export function checkGenerated(item: GeneratedQuestion, existingPrompts: readonly string[]): { ok: true; question: CheckedQuestion } | { ok: false; reason: Rejection } {
  const options = item.options.map((o) => ({ label: normalizeLabel(o.label), text: o.text.trim() }));
  if (options.some((o, i) => o.label !== LABELS[i])) return { ok: false, reason: "labels" };
  const texts = new Set(options.map((o) => normalizeText(o.text)));
  if (texts.size !== options.length || texts.has("")) return { ok: false, reason: "optionsRepeat" };
  const answer = normalizeLabel(item.answer);
  if (!options.some((o) => o.label === answer)) return { ok: false, reason: "answerNotAnOption" };
  const notes = new Map(Object.entries(item.whyNot).map(([k, v]) => [normalizeLabel(k), v.trim()]));
  const whyNot: Record<string, string> = {};
  for (const o of options) {
    if (o.label === answer) continue;
    const note = notes.get(o.label);
    if (!note) return { ok: false, reason: "whyNotMissing" };
    whyNot[o.label] = note;
  }
  if (existingPrompts.some((p) => sameStem(p, item.prompt))) return { ok: false, reason: "duplicateStem" };
  return {
    ok: true,
    question: { prompt: item.prompt, options, answer, explanation: item.explanation, steps: item.steps, conclusion: item.conclusion, whyNot, sources: item.sources },
  };
}

/** The second opinion: a question is dropped unless an independent check finds its key, and only its key, correct. */
export function keyConfirmed(key: string, verdicts: readonly { label: string; correct: boolean }[]): boolean {
  const correct = verdicts.filter((v) => v.correct);
  return correct.length === 1 && normalizeLabel(correct[0].label) === normalizeLabel(key);
}
