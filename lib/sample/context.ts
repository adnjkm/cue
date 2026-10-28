import type { EpochMs, SampleScenario, TimeZone, WallTime, Zone } from "@/lib/domain";
import type { TableName, Tables } from "@/lib/db/schema";
import { addDays, weekdayOf, zoneOf } from "@/lib/time";

/** What a fragment builder gets: wall-clock placement relative to the current week, DST-safe. */
export interface SampleContext {
  zone: Zone;
  scenario: SampleScenario;
  now: EpochMs;
  /** Paper's Mon 26 Oct 2026 maps to the Monday of the week containing `now`. */
  at(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, time: string, weekDelta?: number): EpochMs;
}

/** A fragment may write only the tables its owner writes, so a feature can fix its own sample rows. */
export type SampleFragment<T extends TableName> = (ctx: SampleContext) => { [K in T]?: readonly Tables[K][] };

export function sampleContext(opts: { now: number; zone: TimeZone; scenario?: SampleScenario }): SampleContext {
  const zone = zoneOf(opts.zone);
  const today = zone.dayOf(opts.now as EpochMs);
  const monday = addDays(today, 1 - weekdayOf(today));
  return {
    zone,
    scenario: opts.scenario ?? "default",
    now: opts.now as EpochMs,
    at: (weekday, time, weekDelta = 0) => zone.at(addDays(monday, weekDelta * 7 + weekday - 1), time as WallTime),
  };
}
