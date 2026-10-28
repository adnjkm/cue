"use client";

import { ChevronRight } from "lucide-react";
import type { SourceRef } from "@/lib/domain";
import { sourceLabel, useOpenSource } from "@/lib/sources";
import { cn } from "@/lib/utils";

/** `Slide 17 ›`: opens the source over the current screen unless the screen handles the ref itself. */
export function SourceChip({ source, onOpenSource, className }: { source: SourceRef; onOpenSource?: (ref: SourceRef) => boolean; className?: string }) {
  const open = useOpenSource();
  return (
    <button
      type="button"
      onClick={() => {
        if (!onOpenSource?.(source)) open(source);
      }}
      className={cn(
        "inline-flex h-6 cursor-pointer items-center gap-1 rounded-xs border border-border py-[3px] pr-[5px] pl-[7px] text-sm leading-4 text-ink transition-colors duration-[120ms] ease-standard hover:bg-wash",
        className,
      )}
    >
      {sourceLabel(source, "chip")}
      <ChevronRight size={12} strokeWidth={3} aria-hidden="true" className="text-graphite" />
    </button>
  );
}

export function SourceChips({ sources, onOpenSource, className }: { sources: readonly SourceRef[]; onOpenSource?: (ref: SourceRef) => boolean; className?: string }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label="Sources" className={cn("flex flex-wrap gap-1", className)}>
      {sources.map((s, i) => (
        <li key={`${sourceLabel(s, "meta")}-${i}`}>
          <SourceChip source={s} onOpenSource={onOpenSource} />
        </li>
      ))}
    </ul>
  );
}
