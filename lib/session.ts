import type { AttemptState, ChatMessage, Exam, ParseResult, Question, SolutionState } from "./types";

export type Session = {
  exam: Exam;
  /** Cropped figure images by question id, as JPEG data URLs. */
  figures: Record<string, string>;
  attempts: Record<string, AttemptState>;
  solutions: Record<string, SolutionState>;
  chats: Record<string, ChatMessage[]>;
  current: string;
  topic: string | null;
};

export const ALL_TOPICS = null;

export function buildExam(results: ParseResult[], sourceName: string, pages: number): Exam {
  const id = Math.random().toString(36).slice(2, 10);
  const parsed = results.flatMap((r) => r.questions);
  const keyed = new Map<string, string>();
  for (const r of results) for (const k of r.answerKey) if (!keyed.has(k.number)) keyed.set(k.number, k.answer);

  const numbers = parsed.map((q) => q.number);
  const renumber = new Set(numbers).size !== numbers.length;

  const questions: Question[] = parsed.map((q, i) => {
    const keyAnswer = keyed.get(q.number);
    const answer = q.answer ?? (keyAnswer && q.options.some((o) => o.label === keyAnswer) ? keyAnswer : undefined);
    return {
      id: `${id}-${i}`,
      number: renumber ? String(i + 1) : q.number,
      topic: q.topic,
      prompt: q.prompt,
      options: q.options,
      answer,
      answerSource: answer ? "document" : "none",
      figure: q.figure && q.figure.page <= pages ? q.figure : undefined,
    };
  });

  const title = results.find((r) => r.title)?.title ?? sourceName.replace(/\.[a-z0-9]+$/i, "");
  const course = results.find((r) => r.course)?.course;
  return { id, title, course, sourceName, pages, questions };
}

export function newSession(exam: Exam, figures: Record<string, string>): Session {
  return { exam, figures, attempts: {}, solutions: {}, chats: {}, current: exam.questions[0].id, topic: ALL_TOPICS };
}

export function visibleQuestions(s: Session): Question[] {
  return s.topic === ALL_TOPICS ? s.exam.questions : s.exam.questions.filter((q) => q.topic === s.topic);
}

export function topicsOf(exam: Exam): string[] {
  return [...new Set(exam.questions.map((q) => q.topic))];
}

export function attemptOf(s: Session, id: string): AttemptState {
  return s.attempts[id] ?? { status: "unanswered" };
}

export type Action =
  | { type: "choose"; id: string; choice: string }
  | { type: "solution"; id: string; state: SolutionState }
  | { type: "goto"; id: string }
  | { type: "topic"; topic: string | null }
  | { type: "chat"; id: string; messages: ChatMessage[] };

export function reduce(s: Session, a: Action): Session {
  switch (a.type) {
    case "choose": {
      if (attemptOf(s, a.id).status !== "unanswered") return s;
      const q = s.exam.questions.find((x) => x.id === a.id)!;
      const attempt: AttemptState = q.answer
        ? { status: "answered", choice: a.choice, correct: a.choice === q.answer }
        : { status: "checking", choice: a.choice };
      return { ...s, attempts: { ...s.attempts, [a.id]: attempt } };
    }
    case "solution": {
      let next: Session = { ...s, solutions: { ...s.solutions, [a.id]: a.state } };
      if (a.state.status !== "ready") return next;
      const answer = a.state.solution.answer;
      const q = s.exam.questions.find((x) => x.id === a.id)!;
      if (!q.answer) {
        const questions = s.exam.questions.map((x) => (x.id === a.id ? { ...x, answer, answerSource: "model" as const } : x));
        next = { ...next, exam: { ...s.exam, questions } };
      }
      const attempt = attemptOf(s, a.id);
      if (attempt.status === "checking") {
        const key = q.answer ?? answer;
        next.attempts = { ...s.attempts, [a.id]: { status: "answered", choice: attempt.choice, correct: attempt.choice === key } };
      }
      return next;
    }
    case "goto":
      return { ...s, current: a.id };
    case "topic": {
      const next = { ...s, topic: a.topic };
      const visible = visibleQuestions(next);
      return visible.some((q) => q.id === s.current) ? next : { ...next, current: visible[0].id };
    }
    case "chat":
      return { ...s, chats: { ...s.chats, [a.id]: a.messages } };
  }
}

const STORAGE_KEY = "cue-practice:v1";

/** Drops in-flight state that cannot survive a reload: pending solutions, unresolved checks, half-streamed replies. */
function settle(s: Session): Session {
  const solutions = Object.fromEntries(Object.entries(s.solutions).filter(([, v]) => v.status === "ready"));
  const attempts = Object.fromEntries(Object.entries(s.attempts).filter(([, v]) => v.status !== "checking"));
  const chats = Object.fromEntries(
    Object.entries(s.chats).map(([k, m]) => [k, m.filter((x) => x.content.trim())]),
  );
  return { ...s, solutions, attempts, chats };
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s?.exam?.questions?.length ? settle(s) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settle(s)));
  } catch {
    try {
      // Over quota: keep progress, give up the figure crops.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settle(s), figures: {} }));
    } catch {}
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
