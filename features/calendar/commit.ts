import { courseActions } from "@/lib/courses";
import { db } from "@/lib/db";
import type { CalendarEvent, CourseId, EpochMs } from "@/lib/domain";
import { loadPlanInput, schedule } from "@/lib/plan";
import type { ImportProposal } from "./proposal";

export interface Committed {
  courses: number;
  /** Study blocks that exist only because of this import. */
  planned: number;
  /** Removes exactly this import: its events and batch go, rows it replaced come back, and courses only it asserted are released. */
  undo(): Promise<void>;
}

async function plannedIds(): Promise<Set<string>> {
  return new Set(schedule(await loadPlanInput()).blocks.map((b) => b.id));
}

/** Writes the chosen part of a proposal as one import batch. The plan re-derives from it; nothing else is stored. */
export async function commitImport(p: ImportProposal, chosen: { courses: ReadonlySet<CourseId>; other: boolean }, now: EpochMs): Promise<Committed> {
  const picked = p.courses.filter((c) => chosen.courses.has(c.id));
  const events: CalendarEvent[] = [...picked.flatMap((c) => c.events), ...(chosen.other ? p.other : [])];
  const before = await plannedIds();
  const replaced = (await db.events.bulkGet(events.map((e) => e.id))).filter((e): e is CalendarEvent => e !== undefined);

  await db.transaction("rw", [db.events, db.imports], async () => {
    await db.events.bulkPut(events);
    await db.imports.put({ id: p.importId, at: now, planFrom: now, source: p.source, courses: picked.map((c) => c.id) });
  });
  for (const c of picked) {
    const existing = await db.courses.get(c.id);
    await courseActions.ensure(c.id, p.importId, {
      ...(c.title && !existing?.title ? { title: c.title } : {}),
      ...(c.instructor && !existing?.instructor ? { instructor: c.instructor } : {}),
    });
  }
  const after = await plannedIds();

  let undone = false;
  return {
    courses: picked.length,
    planned: [...after].filter((id) => !before.has(id)).length,
    undo: async () => {
      if (undone) return;
      undone = true;
      await db.transaction("rw", [db.events, db.imports], async () => {
        await db.events.where("importId").equals(p.importId).delete();
        await db.events.bulkPut(replaced);
        await db.imports.delete(p.importId);
      });
      await courseActions.release(p.importId);
    },
  };
}
