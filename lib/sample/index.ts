import { db, TABLE_NAMES } from "@/lib/db";
import { sourceKey, type SampleScenario, type TimeZone } from "@/lib/domain";
import { reindexSource } from "@/lib/retrieval";
import { sampleRows } from "./rows";

export { SAMPLE } from "./ids";
export { sampleContext, type SampleContext, type SampleFragment } from "./context";
export { sampleRows } from "./rows";

export interface SampleSummary {
  courses: number;
  events: number;
  authoredBlocks: number;
}

/** Clears every table and writes all fragments in one transaction, then reindexes every source. Idempotent. */
export async function seedSampleSemester(opts: { now: number; zone: TimeZone; scenario?: SampleScenario }): Promise<SampleSummary> {
  const { rows } = sampleRows(opts);
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    for (const name of TABLE_NAMES) {
      const list = rows[name];
      if (list?.length) await (db[name] as unknown as { bulkPut(rows: readonly unknown[]): Promise<unknown> }).bulkPut(list);
    }
  });
  const keys = [
    ...(rows.materials ?? []).map((m) => sourceKey.material(m.id)),
    ...(rows.lectures ?? []).map((l) => sourceKey.lecture(l.id)),
    ...(rows.practiceSets ?? []).map((s) => sourceKey.set(s.id)),
  ];
  for (const key of keys) await reindexSource(key);
  return { courses: rows.courses?.length ?? 0, events: rows.events?.length ?? 0, authoredBlocks: rows.overrides?.length ?? 0 };
}

export async function resetAll(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
