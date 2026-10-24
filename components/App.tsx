"use client";

import { useRef, useState } from "react";
import { chunkPages, ClientApiError, parseChunks } from "@/lib/client";
import { cropFigure, renderPages, UnreadableError } from "@/lib/pages";
import { buildExam, clearSession, loadSession, newSession, saveSession, type Session } from "@/lib/session";
import type { ApiError, PageInput, ParseResult } from "@/lib/types";
import Intake from "./Intake";
import Practice from "./Practice";

export type Phase =
  | { status: "idle" }
  | { status: "reading"; page: number; pages: number }
  | { status: "parsing"; done: number; total: number }
  | { status: "ready"; session: Session }
  | { status: "error"; error: ApiError };

/** Survives a failed run so Retry resends only the chunks that never came back. */
type Job = {
  files: File[];
  sourceName: string;
  pages?: PageInput[];
  chunks?: PageInput[][];
  results: (ParseResult | undefined)[];
};

function toApiError(e: unknown): ApiError {
  if (e instanceof ClientApiError) return e.api;
  if (e instanceof UnreadableError) return { kind: "unreadable", message: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/password|invalid pdf|corrupt/i.test(message)) return { kind: "unreadable", message };
  return { kind: "upstream", message };
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(() => {
    const session = loadSession();
    return session ? { status: "ready", session } : { status: "idle" };
  });
  const job = useRef<Job | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function run(j: Job) {
    job.current = j;
    const ac = new AbortController();
    abort.current = ac;
    try {
      if (!j.pages || !j.chunks) {
        setPhase({ status: "reading", page: 0, pages: 1 });
        j.pages = await renderPages(j.files, (page, pages) => setPhase({ status: "reading", page, pages }), ac.signal);
        j.chunks = chunkPages(j.pages);
        j.results = [];
      }
      const pages = j.pages;
      const results = await parseChunks(j.chunks, pages.length, j.results, (done, total) => {
        if (!ac.signal.aborted) setPhase({ status: "parsing", done, total });
      }, ac.signal);
      const exam = buildExam(results, j.sourceName, pages.length);
      if (!exam.questions.length) {
        j.results = [];
        throw new ClientApiError({
          kind: "no_questions",
          message: `Read ${pages.length} page${pages.length === 1 ? "" : "s"} but found no multiple-choice questions.`,
        });
      }
      const figures: Record<string, string> = {};
      for (const q of exam.questions) {
        if (q.figure) figures[q.id] = await cropFigure(pages[q.figure.page - 1].image, q.figure.box);
      }
      const session = newSession(exam, figures);
      saveSession(session);
      job.current = null;
      setPhase({ status: "ready", session });
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({ status: "error", error: toApiError(e) });
    }
  }

  function start(files: File[]) {
    if (!files.length) return;
    const sourceName = files.length === 1 ? files[0].name : `${files.length} files`;
    void run({ files, sourceName, results: [] });
  }

  function cancel() {
    abort.current?.abort();
    job.current = null;
    setPhase({ status: "idle" });
  }

  function reset() {
    clearSession();
    job.current = null;
    setPhase({ status: "idle" });
  }

  if (phase.status === "ready") return <Practice initial={phase.session} onNew={reset} />;
  return (
    <Intake
      phase={phase}
      onFiles={start}
      onCancel={cancel}
      onRetry={job.current ? () => void run(job.current!) : undefined}
    />
  );
}
