"use client";

import { Check, ChevronRight } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmtStamp } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { planSummary, type StepRow, type StepState, type TranscriptRef } from "./model";

function StepBadge({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-sm text-sm leading-4",
        state === "done" && "bg-fill text-ink",
        state === "current" && "bg-ink text-page",
        (state === "upcoming" || state === "skipped") && "border border-border text-graphite",
      )}
    >
      {state === "done" ? <Check size={12} strokeWidth={2.625} /> : n}
    </span>
  );
}

/** Up and Down move between steps, Home and End jump to the ends; only the current step is in the tab order. */
function rovingKeys(e: KeyboardEvent<HTMLOListElement>) {
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const prev = ["ArrowUp", "ArrowLeft"].includes(e.key);
  const next = ["ArrowDown", "ArrowRight"].includes(e.key);
  const to = prev ? i - 1 : next ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : null;
  if (to === null) return;
  e.preventDefault();
  buttons[Math.min(buttons.length - 1, Math.max(0, to))]?.focus();
}

const currentIndex = (rows: readonly StepRow[]) => Math.max(0, rows.findIndex((r) => r.state === "current"));

export function PlanList({ rows, labelId, onSelect }: { rows: readonly StepRow[]; labelId: string; onSelect: (i: number) => void }) {
  const current = currentIndex(rows);
  return (
    <ol aria-labelledby={labelId} onKeyDown={rovingKeys} className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <li key={i} className="flex">
          <button
            type="button"
            tabIndex={i === current ? 0 : -1}
            aria-current={r.state === "current" ? "step" : undefined}
            data-state={r.state}
            onClick={() => onSelect(i)}
            className="-mx-2 flex min-w-0 flex-1 cursor-pointer gap-3 rounded-sm px-2 py-2 text-left transition-colors duration-[120ms] ease-standard hover:bg-wash"
          >
            <StepBadge n={i + 1} state={r.state} />
            <span className="flex min-w-0 flex-col pt-1 text-sm leading-4">
              <span className={cn(r.state === "done" || r.state === "skipped" ? "text-graphite" : "text-ink", r.state === "current" && "font-medium")}>
                {r.state === "done" && <span className="sr-only">Done: </span>}
                {r.title}
              </span>
              {r.meta && <span className="text-graphite">{r.meta}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function PlanStrip({ rows, onSelect, className }: { rows: readonly StepRow[]; onSelect: (i: number) => void; className?: string }) {
  const current = currentIndex(rows);
  const row = rows.find((r) => r.state === "current");
  return (
    <div className={cn("flex min-w-0 items-center gap-4", className)}>
      <ol aria-label="Session plan" onKeyDown={rovingKeys} className="flex shrink-0 items-center gap-2">
        {rows.map((r, i) => (
          <li key={i} className="flex">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    tabIndex={i === current ? 0 : -1}
                    aria-current={r.state === "current" ? "step" : undefined}
                    aria-label={[r.state === "done" ? `Done: ${r.title}` : r.title, r.meta].filter(Boolean).join(", ")}
                    onClick={() => onSelect(i)}
                    className="-m-1 flex cursor-pointer rounded-sm p-1"
                  />
                }
              >
                <StepBadge n={i + 1} state={r.state} />
              </TooltipTrigger>
              <TooltipContent>{r.title}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ol>
      <p aria-hidden="true" className="flex min-w-0 flex-col text-sm leading-4">
        <span className={cn("truncate", row ? "font-medium text-ink" : "text-graphite")}>{row ? row.title : planSummary(rows)}</span>
        {row?.meta && <span className="truncate text-graphite">{row.meta}</span>}
      </p>
    </div>
  );
}

export function MomentCard({ at, quote, examHint, onOpen }: { at: TranscriptRef; quote: string; examHint: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full shrink-0 cursor-pointer gap-4 rounded-sm bg-fill px-5 py-4 text-left text-sm leading-5 transition-colors duration-[120ms] ease-standard hover:bg-control"
    >
      <span className="w-10 shrink-0 text-graphite">{fmtStamp(at.atMs)}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-ink">“{quote}”</span>
      <span className="sr-only">{examHint ? "Exam hint. " : ""}Opens the transcript here.</span>
    </button>
  );
}

export function CheckRow({ question, action }: { question?: string; action?: ReactNode }) {
  if (!question && !action) return null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-6 border-t border-rule pt-4 max-md:flex-col max-md:items-stretch max-md:gap-3">
      {question ? <p className="text-sm leading-5 font-medium text-ink">{question}</p> : <span />}
      {action}
    </div>
  );
}

export function NextStepButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button onClick={onClick} disabled={disabled} data-icon="inline-end" aria-keyshortcuts="N" className="shrink-0 max-md:w-full">
      {label}
      <ChevronRight size={12} strokeWidth={3} aria-hidden="true" />
    </Button>
  );
}

export function PlanSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 py-2">
          <span className="size-6 shrink-0 animate-breathe rounded-sm bg-fill" style={{ animationDelay: `${i * 90}ms` }} />
          <span className="mt-1 h-4 animate-breathe rounded-xs bg-fill" style={{ width: `${[52, 70, 58, 66, 48][i % 5]}%`, animationDelay: `${i * 90}ms` }} />
        </div>
      ))}
    </div>
  );
}
