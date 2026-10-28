import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmtStamp } from "@/lib/time";

/**
 * One transcript row: a 44px time slot and the text. `flagged` draws the fill ground and the flag label,
 * `live` swaps the time for "Live" and draws the partial text in graphite.
 */
export function TranscriptLine({
  atMs,
  text,
  state = "final",
  flagLabel,
  actions,
  className,
}: {
  atMs: number;
  text: string;
  state?: "final" | "flagged" | "live";
  flagLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <li
      data-state={state}
      className={cn("group/line flex gap-4 rounded-sm px-4", state === "flagged" ? "bg-fill py-3" : "py-1.5", className)}
    >
      {state === "live" ? (
        <span className="w-11 shrink-0 text-sm leading-5 font-medium text-ink">Live</span>
      ) : (
        <time className="w-11 shrink-0 text-sm leading-5 text-graphite tabular-nums">{fmtStamp(atMs)}</time>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("max-w-[32em] text-sm leading-5 text-pretty", state === "live" ? "text-graphite" : "text-ink")}>{text}</p>
        {state === "flagged" && flagLabel && <p className="text-sm leading-4 font-medium text-ink">{flagLabel}</p>}
      </div>
      {actions}
    </li>
  );
}
