"use client";

import { useSyncExternalStore } from "react";
import { ai, AiError } from "@/lib/ai";
import { db, useLive } from "@/lib/db";
import {
  ids,
  sourceKey,
  type Attempt,
  type EpochMs,
  type PracticeSet,
  type Question,
  type QuestionId,
  type SetId,
  type Solution,
} from "@/lib/domain";
import { refsFor, reindexSource, retrieve } from "@/lib/retrieval";
import { normalizeLabel } from "./schema";

export interface SetData {
  set: PracticeSet;
  questions: Question[];
  attempts: Map<QuestionId, Attempt>;
  solutions: Map<QuestionId, Solution>;
}

/** Everything one practice screen reads, live. `null` once IndexedDB answers and the set is missing. */
export function usePracticeSet(setId: SetId): SetData | null | undefined {
  return useLive(async () => {
    const set = await db.practiceSets.get(setId);
    if (!set) return null;
    const [questions, attempts, solutions] = await Promise.all([
      db.questions.where("setId").equals(setId).sortBy("order"),
      db.attempts.where("setId").equals(setId).toArray(),
      db.questions
        .where("setId")
        .equals(setId)
        .primaryKeys()
        .then((keys) => db.solutions.bulkGet(keys)),
    ]);
    return {
      set,
      questions,
      attempts: new Map(attempts.map((a) => [a.questionId, a])),
      solutions: new Map(solutions.filter((s) => s !== undefined).map((s) => [s.questionId, s])),
    };
  }, [setId]);
}

export async function setView(setId: SetId, view: Partial<PracticeSet["view"]>): Promise<void> {
  const set = await db.practiceSets.get(setId);
  if (set) await db.practiceSets.put({ ...set, view: { ...set.view, ...view } });
}

/** A choice commits and locks: only the first one is kept. */
export async function choose(q: Question, choice: string): Promise<void> {
  await db.transaction("rw", db.attempts, async () => {
    if (await db.attempts.get(q.id)) return;
    await db.attempts.put({ questionId: q.id, setId: q.setId, choice, at: Date.now() as EpochMs });
  });
}

export type SolveState = { status: "loading" } | { status: "error"; error: AiError };

/** Loading and errors live in memory, keyed by question, so a reload simply asks again. */
const solveStates = new Map<QuestionId, SolveState>();
const solveListeners = new Set<() => void>();
function setSolveState(id: QuestionId, state: SolveState | null) {
  if (state) solveStates.set(id, state);
  else solveStates.delete(id);
  solveListeners.forEach((l) => l());
}

export function useSolveState(id: QuestionId): SolveState | undefined {
  return useSyncExternalStore(
    (l) => {
      solveListeners.add(l);
      return () => solveListeners.delete(l);
    },
    () => solveStates.get(id),
    () => undefined,
  );
}

/** Asks for a solution unless one exists, is in flight, or already failed (Try again clears the failure). */
export function prefetchSolution(q: Question, courseId: PracticeSet["courseId"], hasSolution: boolean, force = false): void {
  if (hasSolution || (!force && solveStates.has(q.id))) return;
  setSolveState(q.id, { status: "loading" });
  solveQuestion(q, courseId).then(
    () => setSolveState(q.id, null),
    (e) => setSolveState(q.id, { status: "error", error: e instanceof AiError ? e : new AiError("upstream", String(e)) }),
  );
}

const inFlight = new Map<QuestionId, Promise<Solution>>();
const solving: (() => void)[] = [];
let running = 0;

/** At most three solves in flight, so walking through tiles cannot queue thirty Ultra calls at once. */
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((r) => solving.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    solving.shift()?.();
  }
}

/**
 * Writes the worked solution for one question, grounded in retrieved course passages. A keyless question
 * takes the model's answer as its key, which resolves a "checking" attempt.
 */
export function solveQuestion(q: Question, courseId: PracticeSet["courseId"]): Promise<Solution> {
  const existing = inFlight.get(q.id);
  if (existing) return existing;
  const run = slot(async () => {
    const passages = await retrieve({ courseId, text: `${q.topic} ${q.prompt}`, k: 6, latency: "thorough" });
    const out = await ai("practice.solve", {
      question: { number: q.number, topic: q.topic, prompt: q.prompt, options: q.options.map((o) => ({ ...o })), ...(q.key.source !== "none" ? { answer: q.key.answer } : {}) },
      passages,
    });
    const labels = q.options.map((o) => o.label);
    if (!labels.includes(out.answer)) throw new AiError("bad_output", `Nemotron answered ${out.answer}, which is not an option.`);
    const resources = refsFor(out.resources, passages);
    const whyNot = Object.fromEntries(Object.entries(out.whyNot).flatMap(([k, v]) => (labels.includes(normalizeLabel(k)) && normalizeLabel(k) !== out.answer ? [[normalizeLabel(k), v]] : [])));
    const solution: Solution = {
      questionId: q.id,
      answer: q.key.source === "none" ? out.answer : q.key.answer,
      explanation: out.explanation,
      steps: out.steps,
      ...(out.conclusion ? { conclusion: out.conclusion } : {}),
      whyNot,
      resources,
      provenance: { by: q.key.source === "document" ? "document" : "model", ...(resources[0] ? { groundedIn: resources[0] } : {}) },
    };
    await db.transaction("rw", db.solutions, db.questions, async () => {
      await db.solutions.put(solution);
      const fresh = await db.questions.get(q.id);
      if (fresh && fresh.key.source === "none") await db.questions.put({ ...fresh, key: { source: "model", answer: out.answer } });
    });
    await reindexSource(sourceKey.set(q.setId));
    return solution;
  });
  inFlight.set(q.id, run);
  run.finally(() => inFlight.delete(q.id)).catch(() => undefined);
  return run;
}

export async function createSet(fields: { set: Omit<PracticeSet, "id" | "createdAt"> & { id?: SetId }; questions: (Omit<Question, "id" | "setId" | "order">)[] }): Promise<SetId> {
  const setId = fields.set.id ?? ids.set();
  const questions: Question[] = fields.questions.map((q, order) => ({ ...q, id: ids.question(setId, order + 1), setId, order }));
  await db.transaction("rw", db.practiceSets, db.questions, async () => {
    await db.practiceSets.put({ ...fields.set, id: setId, view: { current: questions[0]?.id ?? null, topic: null }, createdAt: Date.now() as EpochMs });
    await db.questions.bulkPut(questions);
  });
  await reindexSource(sourceKey.set(setId));
  return setId;
}

export async function appendQuestion(setId: SetId, q: Omit<Question, "id" | "setId" | "order">, solution?: Omit<Solution, "questionId">): Promise<QuestionId> {
  return db.transaction("rw", db.questions, db.practiceSets, db.solutions, async () => {
    const existing = await db.questions.where("setId").equals(setId).toArray();
    const order = existing.length;
    const id = ids.question(setId, order + 1);
    await db.questions.put({ ...q, id, setId, order });
    if (solution) await db.solutions.put({ ...solution, questionId: id });
    const set = await db.practiceSets.get(setId);
    if (set && set.view.current === null) await db.practiceSets.put({ ...set, view: { ...set.view, current: id } });
    return id;
  });
}
