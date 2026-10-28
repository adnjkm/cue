"use client";

import type { ReactNode } from "react";
import { useLiveActivity } from "@/lib/db";
import type { NavKey } from "@/lib/routes";
import { fmtCountdown, useNow } from "@/lib/time";

/** Badges next to nav items while something runs. They read the database only, never feature code. */
export function useLiveBadges(): Partial<Record<NavKey, ReactNode>> {
  const now = useNow("second");
  const activity = useLiveActivity(now);
  const badges: Partial<Record<NavKey, ReactNode>> = {};
  if (activity?.recording?.live === "recording") {
    badges.lectures = (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-ink">
        <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
        Recording
      </span>
    );
  }
  if (activity?.session && activity.session.session.state.status === "running") {
    badges.study = <span className="ml-auto shrink-0 text-graphite tabular-nums">{fmtCountdown(Math.max(0, activity.session.leftMs))}</span>;
  }
  return badges;
}
