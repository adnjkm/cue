"use client";

import { useSyncExternalStore } from "react";
import type { EpochMs } from "@/lib/domain";

const UNIT = { minute: 60_000, second: 1_000 } as const;

function subscribeTo(unit: number) {
  return (onChange: () => void) => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      onChange();
      timer = setTimeout(tick, unit - (Date.now() % unit));
    };
    timer = setTimeout(tick, unit - (Date.now() % unit));
    return () => clearTimeout(timer);
  };
}

const subscribers = { minute: subscribeTo(UNIT.minute), second: subscribeTo(UNIT.second) };

/**
 * Re-renders on the minute or second boundary. Reads Date.now(), which Playwright's clock controls.
 * The snapshot is floored to the unit so it stays stable between ticks.
 */
export function useNow(granularity: "minute" | "second"): EpochMs {
  const unit = UNIT[granularity];
  return useSyncExternalStore(
    subscribers[granularity],
    () => (Math.floor(Date.now() / unit) * unit) as EpochMs,
    () => 0 as EpochMs,
  );
}
