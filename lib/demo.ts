import { useSyncExternalStore } from "react";
import type { EpochMs } from "@/lib/domain";
import { sampleContext, seedSampleSemester } from "@/lib/sample";
import { currentZone } from "@/lib/time";
import { DEMO_KEY as KEY } from "./demo-clock";

/**
 * Demo mode: the sample semester with the browser's clock moved to Paper's Tuesday 10:12 of the current week,
 * running forward from there. The sample is written for that moment, so every screen tells the designed story
 * whatever day the demo is given.
 */
type Stored = { offsetMs: number } | { exited: true };

function stored(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
  } catch {
    return null;
  }
}

function realNow(): number {
  const real = (window as { __cueRealNow?: () => number }).__cueRealNow;
  return real ? real() : Date.now();
}

/** Loads the sample semester at Tuesday 10:12 of this week and reloads with the shifted clock. Restarts a running demo. */
export async function startDemo(): Promise<void> {
  const zone = currentZone();
  const now = realNow();
  const start = sampleContext({ now, zone }).at(2, "10:12");
  localStorage.setItem(KEY, JSON.stringify({ offsetMs: start - now } satisfies Stored));
  await seedSampleSemester({ now: start as EpochMs, zone });
  window.location.replace("/");
}

/** Back to the real clock. The data stays; it was written for this week, so it still reads as this week. */
export function exitDemo(): void {
  localStorage.setItem(KEY, JSON.stringify({ exited: true } satisfies Stored));
  window.location.reload();
}

/**
 * `?demo` always (re)starts the demo. A deployment built with NEXT_PUBLIC_CUE_DEMO=1 also starts it for a browser
 * that has never seen it and holds no data, so a first visit opens on a full semester. Returns whether it started.
 */
export async function maybeStartDemo(hasData: () => Promise<boolean>): Promise<boolean> {
  if (new URLSearchParams(window.location.search).has("demo")) {
    await startDemo();
    return true;
  }
  if (process.env.NEXT_PUBLIC_CUE_DEMO === "1" && stored() === null && !(await hasData())) {
    await startDemo();
    return true;
  }
  return false;
}

const noSubscribe = () => () => undefined;

/** Whether this page runs on the demo clock; false during server render. */
export function useDemoActive(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const s = stored();
      return s !== null && "offsetMs" in s;
    },
    () => false,
  );
}
