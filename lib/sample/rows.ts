import type { SampleScenario, TimeZone } from "@/lib/domain";
import type { TableName, Tables } from "@/lib/db/schema";
import { sampleContext, type SampleContext } from "./context";
import { coreSample } from "./core";
import { guidesSample } from "./guides";
import { lecturesSample } from "./lectures";
import { practiceSample } from "./practice";
import { studySample } from "./study";

export type SampleRows = { [K in TableName]: Tables[K][] };

/** Every fragment's rows, merged. Pure, so tests and the seed read the same data. */
export function sampleRows(opts: { now: number; zone: TimeZone; scenario?: SampleScenario }): { ctx: SampleContext; rows: SampleRows } {
  const ctx = sampleContext(opts);
  const rows = {} as SampleRows;
  for (const fragment of [coreSample, lecturesSample, studySample, practiceSample, guidesSample]) {
    for (const [table, list] of Object.entries(fragment(ctx)) as [TableName, readonly unknown[]][]) {
      (rows[table] as unknown[]) = [...((rows[table] as unknown[] | undefined) ?? []), ...list];
    }
  }
  return { ctx, rows };
}
