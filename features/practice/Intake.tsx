"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AiError, errorCopy } from "@/lib/ai";
import { courseActions } from "@/lib/courses";
import { ids, type RenderedPage } from "@/lib/domain";
import { renderPages, sha256Hex, toPageImage, UnreadableError } from "@/lib/materials";
import { href } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createSet } from "./data";
import { buildPaper, chunkPages, parseChunks } from "./parse";
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
  if (e instanceof UnreadableError) return { status: "error", title: "Couldn't read that file", detail: "Use a PDF, PNG or JPG that isn't password protected.", retry: false };
  if (e instanceof AiError) {
    const copy = errorCopy(e);
    return { status: "error", title: copy.title, detail: copy.detail, retry: copy.retry };
  }
  return { status: "error", title: "Couldn't read that file", detail: e instanceof Error ? e.message : undefined, retry: true };
}

/** Drop in a past exam: pages are rendered here, Super VL reads them three at a time, and a new set opens. */
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
          const rendered = await renderPages(file, { onPage: (page, total) => setPhase({ status: "reading", page, total }) });
          j.pages.push(...rendered.map((p) => ({ ...p, index: j.pages.length + p.index })));
        }
      }
      const images = await Promise.all(j.pages.map(toPageImage));
      const chunks = chunkPages(images);
      if (j.results.length !== chunks.length) j.results = new Array(chunks.length).fill(undefined);
      const results = await parseChunks(chunks, j.pages.length, j.results, (done, total) => setPhase({ status: "parsing", done, total }), controller.signal);
      const paper = await buildPaper(results, j.files[0].name, j.pages);
      if (paper.questions.length === 0) {
        setPhase({ status: "error", title: "No multiple-choice questions found", detail: "Try a clearer scan, or a paper whose questions list their answer options.", retry: false });
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

  return (
    <section
      data-testid={tid.intake}
      aria-label="Upload a paper"
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
        "flex min-h-[300px] w-full max-w-[640px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border px-8 py-12 text-center transition-colors duration-150 ease-standard max-md:px-5 max-md:py-10",
        dragging && "border-graphite bg-wash",
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
          <h2 className="text-lg leading-6 tracking-display text-ink">Drop in a past exam</h2>
          <p className="max-w-[52ch] text-sm leading-5 text-graphite">PDF or images. Nemotron reads it, including scans and diagrams, and turns it into practice questions.</p>
          <Button className="mt-4" onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </>
      )}
      {busy && (
        <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2">
          <h2 className="text-lg leading-6 tracking-display text-ink">{phase.status === "reading" ? "Reading pages" : "Finding questions"}</h2>
          <p className="text-sm leading-5 text-graphite">
            {phase.status === "reading" ? `Page ${phase.page} of ${phase.total}` : `Part ${Math.min(phase.done + 1, phase.total)} of ${phase.total} with Nemotron Super VL`}
          </p>
          <div className="mt-2 mb-1 h-0.5 w-full max-w-[280px] overflow-hidden rounded-[1px] bg-rule">
            <span className="block h-full origin-left bg-ink transition-transform duration-[400ms] ease-standard" style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </div>
      )}
      {phase.status === "error" && (
        <div role="alert" className="flex w-full flex-col items-center gap-2">
          <h2 className="text-lg leading-6 tracking-display text-ink">{phase.title}</h2>
          {phase.detail && <p className="max-w-[52ch] text-sm leading-5 text-graphite">{phase.detail}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {phase.retry && <Button onClick={() => void run()}>Retry</Button>}
            <Button variant={phase.retry ? "secondary" : "default"} onClick={() => input.current?.click()}>
              Choose another file
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
