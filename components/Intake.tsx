"use client";

import { useRef, useState } from "react";
import type { ErrorKind } from "@/lib/types";
import type { Phase } from "./App";
import { Credit } from "./Credit";

type IntakePhase = Exclude<Phase, { status: "ready" }>;

const ERROR_COPY: Record<ErrorKind, { title: string; recovery: string }> = {
  missing_key: {
    title: "Nemotron needs an API key",
    recovery: "Set LLM_API_KEY in .env.local (or in your Vercel project settings), restart the server, then try again.",
  },
  rate_limited: {
    title: "Nemotron is rate limited",
    recovery: "The free tier allows 20 requests a minute. Wait a minute and try again. Finished pages are kept.",
  },
  unreadable: {
    title: "Couldn't read that file",
    recovery: "Use a PDF, PNG or JPG that isn't password protected.",
  },
  no_questions: {
    title: "No multiple-choice questions found",
    recovery: "Try a clearer scan, or a document whose questions list their answer options.",
  },
  too_large: {
    title: "That page is too large to send",
    recovery: "Try a smaller scan or fewer pages.",
  },
  upstream: {
    title: "Nemotron didn't answer cleanly",
    recovery: "This usually clears up on a second try.",
  },
};

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp";

export default function Intake({
  phase,
  onFiles,
  onCancel,
  onRetry,
}: {
  phase: IntakePhase;
  onFiles: (files: File[]) => void;
  onCancel: () => void;
  onRetry?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = phase.status === "reading" || phase.status === "parsing";

  const choose = () => input.current?.click();

  return (
    <div className="shell">
      <main className="page">
        <header className="toolbar">
          <h1 className="title">Cue Practice</h1>
        </header>
        <div className="intake">
          <section
            className="dropzone"
            data-dragging={dragging || undefined}
            aria-label="Upload a document"
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
              if (!busy) onFiles([...e.dataTransfer.files]);
            }}
          >
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                onFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            {phase.status === "idle" && (
              <>
                <h2 className="title">Drop in a past exam</h2>
                <p className="muted measure">
                  PDF or images. Nemotron reads it, including scans and diagrams, and turns it into practice questions.
                </p>
                <button className="button primary" onClick={choose}>
                  Choose file
                </button>
              </>
            )}
            {busy && <Progress phase={phase} onCancel={onCancel} />}
            {phase.status === "error" && (
              <div role="alert" className="intake-status">
                <h2 className="title">{ERROR_COPY[phase.error.kind].title}</h2>
                <p className="muted measure">{ERROR_COPY[phase.error.kind].recovery}</p>
                {phase.error.kind === "upstream" && <p className="muted measure detail">{phase.error.message}</p>}
                <div className="row">
                  {onRetry && phase.error.kind !== "unreadable" ? (
                    <>
                      <button className="button primary" onClick={onRetry}>
                        Retry
                      </button>
                      <button className="button" onClick={choose}>
                        Choose another file
                      </button>
                    </>
                  ) : (
                    <button className="button primary" onClick={choose}>
                      Choose another file
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
        <Credit />
      </main>
    </div>
  );
}

function Progress({ phase, onCancel }: { phase: Extract<IntakePhase, { status: "reading" | "parsing" }>; onCancel: () => void }) {
  const [label, fraction] =
    phase.status === "reading"
      ? [phase.page ? `Reading page ${phase.page} of ${phase.pages}` : "Opening document", phase.page / phase.pages / 2]
      : [
          `Extracting questions · chunk ${Math.min(phase.done + 1, phase.total)} of ${phase.total}`,
          0.5 + phase.done / phase.total / 2,
        ];
  return (
    <div className="intake-status">
      <p className="title" aria-live="polite">
        {label}
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <span style={{ transform: `scaleX(${Math.max(0.03, fraction)})` }} />
      </div>
      <p className="muted measure">
        {phase.status === "reading"
          ? "Rendering pages in your browser."
          : "Nemotron 3.5 Super VL is reading each page. On the free tier this can take a minute."}
      </p>
      <button className="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
