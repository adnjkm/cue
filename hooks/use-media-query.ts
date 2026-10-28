import * as React from "react";

/** Server snapshot is `serverDefault`, so the first paint matches the widest layout and hydration never warns. */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
