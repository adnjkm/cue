"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AiError, errorCopy } from "@/lib/ai";
import { courseActions } from "@/lib/courses";
import { ids, type RenderedPage } from "@/lib/domain";
import { fileProblem, renderPages, sha256Hex, toPageImage } from "@/lib/materials";
import { href } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createSet } from "./data";
import { buildExam } from "./exam";
import { attachFigures, chunkPages, parseChunks } from "./parse";
import { tid } from "./testids";
import type { PaperChunkRead } from "./types";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp";

type Phase =
  | { status: "idle" }
  | { status: "reading"; page: number; total: number }
  | { status: "parsing"; done: number; total: number }
  | { status: "error"; title: string; detail?: string; retry: boolean };

interface Job {
  files: File[];
  pages: RenderedPage[];
  results: (PaperChunkRead | undefined)[];
}

function failure(e: unknown): Extract<Phase, { status: "error" }> {
  if (e instanceof AiError) {
    const copy = errorCopy(e);
    return { status: "error", title: copy.title, detail: copy.detail, retry: copy.retry };
  }
  // Retrying the same unreadable file cannot work, so the only way forward is another file.
  return { status: "error", title: fileProblem(e), retry: false };
}

/**
 * Drop in a past paper: pages render here, Super VL reads them three at a time, and the new set opens.
 * A retry resends only the chunks that failed, so a 429 halfway through costs nothing already read.
 */
export function Intake() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const job = useRef<Job | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const busy = phase.status === "reading" || phase.status === "parsing";

  async function run() {
    const j = job.current;
    if (!j) return;
    const controller = new AbortController();
    abort.current = controller;
    try {
      if (j.pages.length === 0) {
        for (const file of j.files) {
          const offset = j.pages.length;
          const rendered = await renderPages(file, { onPage: (page, total) => setPhase({ status: "reading", page: offset + page, total: offset + total }) });
          j.pages.push(...rendered.map((p) => ({ ...p, index: offset + p.index })));
        }
      }
      const images = await Promise.all(j.pages.map(toPageImage));
      const chunks = chunkPages(images);
      if (j.results.length !== chunks.length) j.results = new Array(chunks.length).fill(undefined);
      const results = await parseChunks(chunks, j.pages.length, j.results, (done, total) => setPhase({ status: "parsing", done, total }), controller.signal);
      const paper = await attachFigures(buildExam(results, j.files[0].name), j.pages);
      if (paper.questions.length === 0) {
        setPhase({ status: "error", title: "No multiple-choice questions found.", detail: "Try a clearer scan, or a paper whose questions list their answer options.", retry: false });
        return;
      }
      const courseId = paper.course ? await courseActions.ensure(paper.course, "manual") : null;
      const setId = await createSet({
        set: { courseId, title: paper.title, origin: { kind: "paper", materialId: ids.material(await sha256Hex(j.files[0])) }, view: { current: null, topic: null } },
        questions: paper.questions,
      });
      job.current = null;
      router.push(href.practiceSet(setId));
    } catch (e) {
      if (controller.signal.aborted) {
        setPhase({ status: "idle" });
        return;
      }
      setPhase(failure(e));
    }
  }

  function start(files: File[]) {
    if (files.length === 0) return;
    job.current = { files, pages: [], results: [] };
    void run();
  }

  const progress = phase.status === "reading" ? phase.page / phase.total : phase.status === "parsing" ? (phase.done + 0.5) / Math.max(1, phase.total) : 0;
  const pct = Math.round(Math.min(1, progress) * 100);

  return (
    <div
      data-testid={tid.intake}
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        if (busy) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) start([...e.dataTransfer.files]);
      }}
      className={cn(
        "flex min-h-24 w-full items-center justify-between gap-6 rounded-sm border border-dashed border-border px-6 py-5 transition-colors duration-150 ease-standard max-md:flex-col max-md:items-stretch max-md:gap-4 max-md:px-5",
        dragging && "border-graphite bg-wash",
        phase.status === "error" && "border-solid bg-wash",
      )}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-label="Choose a paper"
        onChange={(e) => {
          start([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {phase.status === "idle" && (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-base leading-5 text-ink">{dragging ? "Drop to read it" : "Drop a past paper or multiple-choice test here"}</p>
            <p className="text-sm leading-5 text-graphite">PDF, or photos of the pages. Cue reads scans and diagrams too, and keeps the multiple-choice questions.</p>
          </div>
          <Button className="shrink-0" onClick={() => input.current?.click()}>
            Choose files
          </Button>
        </>
      )}
      <p role="status" className="sr-only">
        {phase.status === "reading" ? `Reading page ${phase.page} of ${phase.total}` : phase.status === "parsing" ? `Finding questions, part ${Math.min(phase.done + 1, phase.total)} of ${phase.total}` : null}
      </p>
      {busy && (
        <>
          <div className="flex w-full min-w-0 flex-col gap-1">
            <p className="text-base leading-5 text-ink">{phase.status === "reading" ? `Reading page ${phase.page} of ${phase.total}` : `Finding questions · part ${Math.min(phase.done + 1, phase.total)} of ${phase.total}`}</p>
            <p className="text-sm leading-5 text-graphite">{phase.status === "reading" ? "Turning each page into an image Cue can read." : "Cue reads three pages at a time."}</p>
            <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 h-0.5 w-full max-w-[360px] overflow-hidden rounded-[1px] bg-rule">
              <span className="block h-full origin-left bg-ink transition-transform duration-[400ms] ease-standard" style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
            </div>
          </div>
          <Button variant="ghost" className="shrink-0" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </>
      )}
      {phase.status === "error" && (
        <>
          <div role="alert" className="flex min-w-0 flex-col gap-1">
            <p className="text-base leading-5 text-ink">{phase.title}</p>
            {phase.detail && <p className="text-sm leading-5 text-graphite">{phase.detail}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {phase.retry && <Button onClick={() => void run()}>Try again</Button>}
            <Button variant={phase.retry ? "secondary" : "default"} onClick={() => input.current?.click()}>
              Choose another file
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
