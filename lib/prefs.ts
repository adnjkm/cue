"use client";

import { db, useLive } from "@/lib/db";
import { DEFAULT_PLAN_PREFS, DEFAULT_POMODORO, type Owner, type PrefsByOwner, type PrefsRow } from "@/lib/domain";
import { currentZone } from "@/lib/time";

export function defaultPrefs<O extends Owner>(owner: O): PrefsByOwner[O] {
  const defaults: { [K in Owner]: () => PrefsByOwner[K] } = {
    foundation: () => ({ zone: currentZone(), plan: DEFAULT_PLAN_PREFS }),
    today: () => ({}),
    calendar: () => ({}),
    lectures: () => ({ engine: "parakeet" }),
    study: () => ({ pomodoro: DEFAULT_POMODORO, defaultMode: "quick" }),
    practice: () => ({}),
    guides: () => ({}),
  };
  return defaults[owner]();
}

function strip(row: PrefsRow | undefined): Record<string, unknown> {
  if (!row) return {};
  const { owner: _owner, ...rest } = row;
  return rest;
}

export async function readPrefs<O extends Owner>(owner: O): Promise<PrefsByOwner[O]> {
  return { ...defaultPrefs(owner), ...strip(await db.prefs.get(owner)) } as PrefsByOwner[O];
}

/** One typed slice per owner, merged over defaults. Undefined until IndexedDB answers. */
export function usePrefs<O extends Owner>(owner: O): PrefsByOwner[O] | undefined {
  return useLive(() => readPrefs(owner), [owner]);
}

/** Single-key shortcuts (WCAG 2.1.4) are on unless the student turned them off in the Data menu. */
export function useShortcuts(): boolean {
  return usePrefs("foundation")?.shortcuts !== false;
}

/** The only writer of `prefs`. Lint lets features/<x> pass only the literal "<x>". */
export async function setPrefs<O extends Owner>(owner: O, patch: Partial<PrefsByOwner[O]>): Promise<void> {
  await db.transaction("rw", db.prefs, async () => {
    const current = await readPrefs(owner);
    await db.prefs.put({ ...current, ...patch, owner } as PrefsRow);
  });
}
