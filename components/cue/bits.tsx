import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** `CSC148` on fill, 12/16 at 500, radius 4: Today's and Calendar's course chip. */
export function CourseChip({ code, className }: { code: string; className?: string }) {
  return <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-xs bg-fill px-[7px] text-xs font-medium text-ink", className)}>{code}</span>;
}

/** Caps label in graphite: "Session plan", "Worked solution", "Contents". */
export function SectionLabel({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-sm leading-4 font-normal tracking-caps text-graphite uppercase", className)} {...props} />;
}

export function EmptyState({ title, detail, actions, className }: { title: string; detail?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4", className)}>
      <div className="flex flex-col gap-2">
        <p className="text-lg leading-6 tracking-display text-ink">{title}</p>
        {detail && <p className="max-w-[560px] text-sm leading-5 text-graphite">{detail}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** One graphite line for an error, with an optional action. */
export function ErrorLine({ title, detail, action, className }: { title: string; detail?: string; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-5 text-graphite", className)}>
      <span>
        <span className="text-ink">{title}</span>
        {detail ? ` ${detail}` : ""}
      </span>
      {action}
    </div>
  );
}

/** The 160×4 pill track with an ink fill, shared by the session timer and the lecture progress. */
export function TimerBar({ fraction, label, valueText, className }: { fraction: number; label: string; valueText: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={valueText}
      className={cn("h-1 w-40 shrink-0 overflow-clip rounded-full bg-control", className)}
    >
      <div className="h-full rounded-full bg-ink" style={{ width: `${Math.round(fraction * 160)}px` }} />
    </div>
  );
}

/** The 32-high toolbar every focus screen draws: title left, controls right. */
export function FocusToolbar({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}>
      <h1 className="min-w-0 text-lg leading-6 font-normal tracking-display text-ink">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}
