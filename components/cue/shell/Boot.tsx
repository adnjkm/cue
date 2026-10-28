"use client";

import { useEffect } from "react";

/** Starts the app's background work once per page load. Renders nothing. */
export function Boot() {
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);
  return null;
}
