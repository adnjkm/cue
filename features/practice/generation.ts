"use client";

import { useSyncExternalStore } from "react";
import { ai, aiItems, AiError, errorCopy } from "@/lib/ai";
import { PASSAGE_CHAR_CAP } from "@/lib/ai/passages";
import { db } from "@/lib/db";
import { gradeOf, type Attempt, type GenerationScope, type Passage, type PracticeSet, type Question, type QuestionId, type SetId, type SourceRef } from "@/lib/domain";
import { refsFor } from "@/lib/retrieval";
import { checkGenerated, keyConfirmed } from "./checks";
import { appendQuestion, createSet, retrieveMaterial } from "./data";
import { sectionLabel } from "./model";

/** "Write questions" inside a set. A set made from a link carries its GenerationScope instead. */
export interface WriteRequest {
  kind: "write";
  topic: string | "missedMost";
  missedOnly: boolean;
  count: 3 | 5 | 10;
  note?: string;
}

export type Brief = WriteRequest | GenerationScope;

export type GenerationState =
  | { status: "writing"; topic: string | null; pending: number; kept: number }
  | { status: "done"; topic: string; kept: number; dropped: number }
  | { status: "failed"; topic: string | null; kept: number; title: string; detail?: string; retry: boolean; budget?: AiError };

/** Thrown for a link whose material is gone; shown as the failure copy, never retried. */
class MissingMaterial extends Error {}

const DEFAULT_COUNT = 5;
const STYLE_MAX = 6;

export function missedMost(questions: readonly Question[], attempts: ReadonlyMap<QuestionId, Attempt>): string | null {
  const misses = new Map<string, number>();
  for (const q of questions) {
    const g = gradeOf(q, attempts.get(q.id));
    if (g.status === "answered" && !g.correct) misses.set(q.topic, (misses.get(q.topic) ?? 0) + 1);
  }
  return [...misses].sort((a, b) => b[1] - a[1])[0]?.[0] ?? questions[0]?.topic ?? null;
}

interface Material {
  topic: string;
  focus: string;
  course?: string;
  style: { prompt: string; options: { label: string; text: string }[]; missed?: true }[];
  passages: Passage[];
  /** Refs every written question carries, whatever it cites: the guide section a quiz came from. */
  always: SourceRef[];
  count: number;
  note?: string;
}

/** Puts `first` ahead of the retrieved passages, renumbers them S2… and trims to the request cap. */
function withLead(first: Omit<Passage, "id"> | null, rest: readonly Passage[]): Passage[] {
  const out: Passage[] = [];
  let chars = 0;
  for (const p of first ? [first, ...rest] : rest) {
    const text = p.text.slice(0, Math.max(0, PASSAGE_CHAR_CAP - chars));
    if (!text) break;
    out.push({ ...p, id: `S${out.length + 1}`, text });
    chars += text.length;
  }
  return out;
}

const styleOf = (q: Question, missed = false) => ({ prompt: q.prompt, options: q.options.map((o) => ({ ...o })), ...(missed ? { missed: true as const } : {}) });

async function gather(set: PracticeSet, questions: readonly Question[], attempts: ReadonlyMap<QuestionId, Attempt>, brief: Brief): Promise<Material> {
  const course = set.courseId ?? undefined;
  switch (brief.kind) {
    case "write":
    case "topic": {
      const topic = brief.topic === "missedMost" ? missedMost(questions, attempts) : brief.topic;
      if (!topic) throw new MissingMaterial("This set has no questions to write from yet.");
      const inTopic = questions.filter((q) => q.topic === topic);
      const missed = inTopic.filter((q) => {
        const g = gradeOf(q, attempts.get(q.id));
        return g.status === "answered" && !g.correct;
      });
      const style = brief.missedOnly && missed.length > 0 ? [...missed.map((q) => styleOf(q, true)), ...inTopic.filter((q) => !missed.includes(q)).map((q) => styleOf(q))] : inTopic.map((q) => styleOf(q));
      const passages = await retrieveMaterial(set.courseId, `${topic} ${inTopic.map((q) => q.prompt).join(" ")}`.slice(0, 800), 8);
      return {
        topic,
        focus: `the topic “${topic}”${set.title && set.origin.kind === "paper" ? `, in the style of the ${set.title}` : ""}`,
        ...(course ? { course } : {}),
        style: style.slice(0, STYLE_MAX),
        passages: withLead(null, passages),
        always: [],
        count: brief.count,
        ...(brief.note ? { note: brief.note } : {}),
      };
    }
    case "section": {
      const section = await db.guideSections.get(brief.sectionId);
      if (!section?.draft) throw new MissingMaterial("That study guide section hasn't been written yet. Write it in Study guides, then try again.");
      const ref: SourceRef = { kind: "section", courseId: brief.courseId, sectionId: section.id, title: section.title };
      const related = await retrieveMaterial(brief.courseId, `${section.title} ${section.draft.plainText}`.slice(0, 800), 6);
      return {
        topic: section.title,
        focus: `the study guide section “${section.title}” (passage S1)`,
        course: brief.courseId,
        style: (await courseStyle(set)).slice(0, 4),
        passages: withLead({ ref, label: sectionLabel(ref), text: section.draft.plainText }, related),
        always: [ref],
        count: DEFAULT_COUNT,
      };
    }
    case "message": {
      const message = await db.messages.get(brief.messageId);
      if (!message) throw new MissingMaterial("That answer isn't on this device anymore.");
      const related = await retrieveMaterial(brief.courseId, message.text.slice(0, 800), 8);
      return {
        topic: set.title,
        focus: `the ideas in this answer from the student's study chat: “${message.text.slice(0, 1500)}”`,
        course: brief.courseId,
        style: (await courseStyle(set)).slice(0, 4),
        passages: withLead(null, related),
        always: message.citations.slice(0, 3),
        count: DEFAULT_COUNT,
      };
    }
    case "similar": {
      const like = await db.questions.get(brief.questionId);
      if (!like) throw new MissingMaterial("That question isn't on this device anymore.");
      const related = await retrieveMaterial(set.courseId, `${like.topic} ${like.prompt}`.slice(0, 800), 6);
      return {
        topic: like.topic,
        focus: `the same idea as the example question, asked from a new angle`,
        ...(course ? { course } : {}),
        style: [styleOf(like)],
        passages: withLead(null, related),
        always: [],
        count: 1,
      };
    }
  }
}

/** Paper questions from the same course, so a quiz from a guide section reads like the course's exams. */
async function courseStyle(set: PracticeSet): Promise<Material["style"]> {
  if (!set.courseId) return [];
  const papers = (await db.practiceSets.where("courseId").equals(set.courseId).toArray()).filter((s) => s.origin.kind === "paper");
  const out: Material["style"] = [];
  for (const paper of papers) out.push(...(await db.questions.where("setId").equals(paper.id).toArray()).map((q) => styleOf(q)));
  return out;
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** The new set's course and title, named after what it is written from: the guide section, or the question asked in chat. */
async function describe(scope: GenerationScope): Promise<{ courseId: PracticeSet["courseId"]; title: string }> {
  switch (scope.kind) {
    case "section": {
      const section = await db.guideSections.get(scope.sectionId);
      return { courseId: scope.courseId, title: section?.title ?? "Study guide section" };
    }
    case "message": {
      const message = await db.messages.get(scope.messageId);
      const asked = message ? (await db.messages.where("thread").equals(message.thread).toArray()).filter((m) => m.role === "user" && m.at <= message.at).sort((a, b) => b.at - a.at)[0] : undefined;
      return { courseId: scope.courseId, title: asked ? clip(asked.text, 60) : "From your study chat" };
    }
    case "topic":
      return { courseId: scope.courseId, title: scope.topic === "missedMost" ? "Topics you missed most" : scope.topic };
    case "similar": {
      const like = await db.questions.get(scope.questionId);
      const from = like ? await db.practiceSets.get(like.setId) : undefined;
      return { courseId: from?.courseId ?? null, title: like ? `Like question ${like.number}` : "Similar questions" };
    }
  }
}

const opened = new Map<string, Promise<SetId>>();

/**
 * Makes the empty set a `?generate=` link asks for and starts writing into it. Keyed by the link, so a
 * double-run effect or a second click on the same link while the page is open lands on one set.
 */
export function openGenerated(param: string, scope: GenerationScope): Promise<SetId> {
  let pending = opened.get(param);
  if (!pending) {
    pending = describe(scope).then(async ({ courseId, title }) => {
      const setId = await createSet({ set: { courseId, title, origin: { kind: "generated", scope }, view: { current: null, topic: null } }, questions: [] });
      startGeneration(setId, scope);
      return setId;
    });
    pending.catch(() => opened.delete(param));
    opened.set(param, pending);
  }
  return pending;
}

const states = new Map<SetId, GenerationState>();
const listeners = new Set<() => void>();
const briefs = new Map<SetId, Brief>();
/** After a failure, how many questions the retry still owes, so a retry never writes the kept ones twice. */
const owed = new Map<SetId, number>();

function publish(setId: SetId, state: GenerationState) {
  states.set(setId, state);
  listeners.forEach((l) => l());
}

export function useGeneration(setId: SetId): GenerationState | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => states.get(setId),
    () => undefined,
  );
}

/**
 * Writes questions into a set, keeping each one only when checkGenerated passes and an independent check
 * finds its key, and only its key, correct. Runs outside React, so it survives the route change from /practice?generate= to the
 * set. A second call while one runs is a no-op.
 */
export function startGeneration(setId: SetId, brief: Brief, count?: number): void {
  if (states.get(setId)?.status === "writing") return;
  briefs.set(setId, brief);
  owed.delete(setId);
  publish(setId, { status: "writing", topic: null, pending: count ?? (brief.kind === "write" || brief.kind === "topic" ? brief.count : brief.kind === "similar" ? 1 : DEFAULT_COUNT), kept: 0 });
  void run(setId, brief, count);
}

export function retryGeneration(setId: SetId): void {
  const brief = briefs.get(setId);
  if (brief) startGeneration(setId, brief, owed.get(setId));
}

/** A generated set that is still empty after a reload has lost its in-memory job; start it again from its scope. */
export function resumeGeneration(set: PracticeSet, questionCount: number): void {
  if (set.origin.kind !== "generated" || questionCount > 0 || states.has(set.id)) return;
  startGeneration(set.id, set.origin.scope);
}

async function run(setId: SetId, brief: Brief, count?: number): Promise<void> {
  let kept = 0;
  let wanted = count;
  let topic: string | null = null;
  try {
    const set = await db.practiceSets.get(setId);
    if (!set) throw new MissingMaterial("This practice set isn't on this device anymore.");
    const questions = await db.questions.where("setId").equals(setId).sortBy("order");
    const attempts = new Map((await db.attempts.where("setId").equals(setId).toArray()).map((a) => [a.questionId, a]));
    const gathered = await gather(set, questions, attempts, brief);
    const m = { ...gathered, count: count ?? gathered.count };
    wanted = m.count;
    topic = m.topic;
    let pending = m.count;
    let dropped = 0;
    publish(setId, { status: "writing", topic, pending, kept });
    const prompts = questions.map((q) => q.prompt);
    let number = Math.max(0, ...questions.map((q) => Number(q.number) || 0));
    const input = { ...(m.course ? { course: m.course } : {}), topic: m.topic, focus: m.focus, style: m.style, passages: m.passages, count: m.count, ...(m.note ? { note: m.note } : {}) };
    for await (const item of aiItems("practice.generate", input)) {
      if (kept >= m.count) break;
      const verdict = checkGenerated(item, prompts);
      const agrees = verdict.ok && keyConfirmed(verdict.question.answer, (await ai("practice.check", { prompt: verdict.question.prompt, options: verdict.question.options })).options);
      if (verdict.ok && agrees) {
        const q = verdict.question;
        const cited = refsFor(q.sources, m.passages);
        const from = [...new Map([...m.always, ...cited].map((r) => [JSON.stringify(r), r])).values()];
        prompts.push(q.prompt);
        number += 1;
        kept += 1;
        await appendQuestion(
          setId,
          { number: String(number), topic: m.topic, type: "multipleChoice", prompt: q.prompt, options: q.options, key: { source: "model", answer: q.answer }, origin: { kind: "generated", from } },
          {
            answer: q.answer,
            explanation: q.explanation,
            steps: q.steps,
            conclusion: q.conclusion,
            whyNot: q.whyNot,
            resources: from.slice(0, 3),
            provenance: { by: "model", ...(from[0] ? { groundedIn: from[0] } : {}) },
          },
        );
      } else dropped += 1;
      pending = Math.max(0, pending - 1);
      publish(setId, { status: "writing", topic, pending, kept });
    }
    publish(setId, { status: "done", topic, kept, dropped: dropped + pending });
  } catch (e) {
    if (wanted !== undefined) owed.set(setId, Math.max(1, wanted - kept));
    if (e instanceof MissingMaterial) {
      publish(setId, { status: "failed", topic, kept, title: e.message, retry: false });
      return;
    }
    const error = e instanceof AiError ? e : new AiError("upstream", String(e));
    const copy = errorCopy(error);
    if (error.kind === "budget") publish(setId, { status: "failed", topic, kept, title: copy.title, ...(copy.detail ? { detail: copy.detail } : {}), retry: false, budget: error });
    else publish(setId, { status: "failed", topic, kept, title: "Couldn't write questions.", detail: [copy.title, copy.detail].filter(Boolean).join(" "), retry: copy.retry });
  }
}
