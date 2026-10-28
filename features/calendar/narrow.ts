import { useSyncExternalStore } from "react";

/** Below 768px the calendar opens on Day, the week becomes an agenda and details open in a bottom drawer (calendar.md 5). */
const NARROW = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(NARROW);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => false);
}
