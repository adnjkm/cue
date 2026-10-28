"use client";

import { db, useLive } from "@/lib/db";

/** True when any table except prefs holds a row, i.e. loading the sample semester would delete something. */
export async function hasStoredData(): Promise<boolean> {
  const counts = await Promise.all(db.tables.filter((t) => t.name !== "prefs").map((t) => t.count()));
  return counts.some((n) => n > 0);
}

/** For labels only; undefined until the first answer. Actions ask `hasStoredData` at click time instead of trusting this. */
export function useHasData(): boolean | undefined {
  return useLive(hasStoredData, []);
}
