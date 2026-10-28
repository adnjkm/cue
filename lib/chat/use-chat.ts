"use client";

import Dexie from "dexie";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiStream, AiError } from "@/lib/ai";
import { db, useLive } from "@/lib/db";
import {
  gradeOf,
  ids,
  lectureElapsedMs,
  sourceKey,
  type AskMode,
  type AskScope,
  type ChatMessage,
  type CourseId,
  type EpochMs,
  type MessageId,
  type Passage,
  type PendingReply,
  type ThreadKey,
} from "@/lib/domain";
import { livePassages, parseCitations, retrieve } from "@/lib/retrieval";
import { sourceLabel } from "@/lib/sources";

export interface ChatHandle {
  messages: readonly ChatMessage[];
  pending: PendingReply | null;
  error: AiError | null;
  mode: AskMode;
  setMode(mode: AskMode): void;
  /** Empty-state prompts from the scope. */
  suggestions: readonly string[];
  send(text: string): void;
  stop(): void;
  retry(): void;
  saveToGuide(id: MessageId): Promise<void>;
}

interface Context {
  courseId: CourseId | null;
  passages: Passage[];
  subject: { title: string; lines: string[]; hideAnswer: boolean };
}

const HISTORY = 12;
const NONE: readonly ChatMessage[] = [];

/** The context source and prompt facts per scope. A new scope is a change request to lib/chat. */
async function contextFor(scope: AskScope, question: string, mode: AskMode): Promise<Context> {
  const latency = mode === "deep" ? "thorough" : "interactive";
  switch (scope.kind) {
    case "study": {
      const lecture = scope.lectureId ? await db.lectures.get(scope.lectureId) : undefined;
      const passages = await retrieve({ courseId: scope.courseId, text: question, latency, ...(scope.lectureId ? { prefer: [sourceKey.lecture(scope.lectureId)] } : {}) });
      return {
        courseId: scope.courseId,
        passages,
        subject: {
          title: [scope.courseId ?? "All courses", lecture?.topic?.full].filter(Boolean).join(" · "),
          lines: scope.focus ? [`The student is looking at ${sourceLabel(scope.focus, "meta")}.`] : [],
          hideAnswer: false,
        },
      };
    }
    case "liveLecture":
    case "lecture": {
      const lecture = await db.lectures.get(scope.lectureId);
      if (!lecture) return { courseId: null, passages: [], subject: { title: "Lecture", lines: [], hideAnswer: false } };
      let passages: Passage[];
      if (scope.kind === "liveLecture") {
        passages = await livePassages(lecture.id, Math.max(0, lectureElapsedMs(lecture, Date.now() as EpochMs) - scope.windowMs));
      } else {
        passages = await retrieve({ courseId: lecture.courseId, text: question, latency, within: [sourceKey.lecture(lecture.id)] });
        if (passages.length === 0) passages = (await livePassages(lecture.id, 0)).slice(0, 8);
      }
      return {
        courseId: lecture.courseId,
        passages,
        subject: {
          title: [lecture.courseId, lecture.topic?.full ?? (lecture.number !== undefined ? `Lecture ${lecture.number}` : undefined)].filter(Boolean).join(" · "),
          lines: [scope.kind === "liveLecture" ? `Uses the last ${Math.round(scope.windowMs / 60_000)} minutes of the live transcript.` : "Uses the whole lecture."],
          hideAnswer: false,
        },
      };
    }
    case "question": {
      const q = await db.questions.get(scope.questionId);
      if (!q) return { courseId: null, passages: [], subject: { title: "Question", lines: [], hideAnswer: true } };
      const [set, attempt, solution] = await Promise.all([db.practiceSets.get(q.setId), db.attempts.get(q.id), db.solutions.get(q.id)]);
      const grade = gradeOf(q, attempt);
      const answered = grade.status === "answered";
      const lines = [q.prompt, ...q.options.map((o) => `${o.label}. ${o.text}`)];
      if (answered && q.key.source !== "none") lines.push(`The student chose ${grade.choice}; the correct answer is ${q.key.answer}.`);
      if (answered && solution) lines.push(`Worked solution: ${solution.explanation} ${solution.steps.map((s) => `${s.label}: ${s.text}`).join("; ")}`);
      const passages = await retrieve({ courseId: set?.courseId ?? null, text: `${q.prompt} ${question}`, latency });
      return { courseId: set?.courseId ?? null, passages, subject: { title: `Question ${q.number} · ${q.topic}`, lines, hideAnswer: !answered } };
    }
  }
}

function useSuggestions(scope: AskScope): string[] {
  const question = useLive(async () => {
    if (scope.kind !== "question") return null;
    const q = await db.questions.get(scope.questionId);
    if (!q) return null;
    return { q, attempt: await db.attempts.get(q.id), solution: await db.solutions.get(q.id) };
  }, [scope.kind === "question" ? scope.questionId : null]);
  switch (scope.kind) {
    case "question": {
      if (!question) return [];
      const grade = gradeOf(question.q, question.attempt);
      if (grade.status !== "answered" || question.q.key.source === "none") return ["Give me a hint", "What is this question testing?", "Explain the question"];
      const key = question.q.key.answer;
      const wrong = question.q.options.find((o) => o.label !== key && o.label !== grade.choice)?.label ?? question.q.options.find((o) => o.label !== key)?.label;
      return [...(wrong ? [`Why not ${wrong}?`] : []), `Why is ${key} right?`, "Explain it more simply", "Show a similar example"];
    }
    case "study":
      return ["Explain this in simpler words", "Quiz me on this", "What’s most likely on the test?"];
    case "liveLecture":
      return ["What did I just miss?", "Explain the last example"];
    case "lecture":
      return ["Summarize the main idea", "What should I review first?"];
  }
}

/** Context for the scope, the scope's prompt, streaming, stop, citation parsing and settled-only persistence. */
export function useChat(opts: { thread: ThreadKey; scope: AskScope; defaultMode?: AskMode }): ChatHandle {
  const { thread, scope } = opts;
  const rows = useLive(() => db.messages.where("[thread+at]").between([thread, Dexie.minKey], [thread, Dexie.maxKey]).toArray(), [thread]);
  const messages = useMemo(() => rows ?? NONE, [rows]);
  const [mode, setMode] = useState<AskMode>(opts.defaultMode ?? "quick");
  const [pending, setPending] = useState<PendingReply | null>(null);
  const [error, setError] = useState<AiError | null>(null);
  const abort = useRef<AbortController | null>(null);
  const live = useRef<{ text: string; passages: Passage[]; courseId: CourseId | null; mode: AskMode } | null>(null);
  const scopeKey = JSON.stringify(scope);
  const suggestions = useSuggestions(scope);

  useEffect(() => () => abort.current?.abort(), []);

  const settle = useCallback(
    async (text: string) => {
      const run = live.current;
      live.current = null;
      setPending(null);
      if (!run || !text.trim()) return;
      const parsed = parseCitations(text, run.passages);
      await db.messages.put({ id: ids.message(), thread, courseId: run.courseId, role: "assistant", text: parsed.text, citations: parsed.citations, mode: run.mode, at: Date.now() as EpochMs });
    },
    [thread],
  );

  const run = useCallback(
    async (question: string, history: readonly ChatMessage[]) => {
      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setPending({ question, mode, text: "", thinking: "", phase: "retrieving" });
      try {
        const ctx = await contextFor(JSON.parse(scopeKey) as AskScope, question, mode);
        live.current = { text: "", passages: ctx.passages, courseId: ctx.courseId, mode };
        const stream = aiStream(
          "ask",
          {
            scope: scope.kind,
            mode,
            question,
            history: history.slice(-HISTORY).map((m) => ({ role: m.role, text: m.text })),
            passages: ctx.passages,
            subject: ctx.subject,
          },
          { signal: controller.signal },
        );
        let thinking = "";
        for await (const e of stream) {
          if (e.type === "thinking") thinking += e.delta;
          if (e.type === "text" && live.current) live.current.text += e.delta;
          const text = live.current?.text ?? "";
          setPending({ question, mode, text, thinking, phase: text ? "answering" : "thinking" });
        }
        await settle(live.current?.text ?? "");
      } catch (e) {
        const err = e instanceof AiError ? e : new AiError("upstream", e instanceof Error ? e.message : String(e));
        if (err.kind === "aborted") {
          await settle(live.current?.text ?? "");
          return;
        }
        live.current = null;
        setPending(null);
        setError(err);
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    [mode, scope.kind, scopeKey, settle],
  );

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || abort.current) return;
      const history = messages;
      void (async () => {
        const ctxCourse = scope.kind === "study" ? scope.courseId : null;
        await db.messages.put({ id: ids.message(), thread, courseId: ctxCourse, role: "user", text: question, citations: [], mode, at: Date.now() as EpochMs });
        await run(question, history);
      })();
    },
    [messages, mode, run, scope, thread],
  );

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || abort.current) return;
    void run(lastUser.text, messages.slice(0, messages.indexOf(lastUser)));
  }, [messages, run]);

  return {
    messages,
    pending,
    error,
    mode,
    setMode,
    suggestions,
    send,
    stop: () => abort.current?.abort(),
    retry,
    saveToGuide: async (id) => {
      await db.messages.update(id, { savedToGuideAt: Date.now() as EpochMs });
    },
  };
}
