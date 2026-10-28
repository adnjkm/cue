import { db } from "@/lib/db";
import { ids, type Course, type CourseId, type CourseSource, type ImportId } from "@/lib/domain";

/** "CSC148" -> "CSC": the letters before the number, used in "Mid-week · CSC". */
export function courseShort(code: string): string {
  return code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? code;
}

/** The only writer of `courses`. Calendar, Practice and AddMaterialDialog call it. */
export const courseActions = {
  /** Idempotent: merges by code and adds `by` to `sources`. */
  ensure: async (code: string, by: CourseSource, patch?: Partial<Pick<Course, "short" | "title" | "instructor">>): Promise<CourseId> => {
    const id = ids.course(code);
    if (!id) throw new Error(`Not a course code: "${code}"`);
    await db.transaction("rw", db.courses, async () => {
      const existing = await db.courses.get(id);
      const sources = existing?.sources.includes(by) ? existing.sources : [...(existing?.sources ?? []), by];
      await db.courses.put({ id, code: id, short: courseShort(id), ...existing, ...patch, sources });
    });
    return id;
  },
  /**
   * Undo of an import: removes `by` from every course's sources. A course left with no source is deleted
   * when no material, lecture or practice set references it, else it keeps "manual". Returns the deleted ids.
   */
  release: async (by: ImportId): Promise<readonly CourseId[]> => {
    const deleted: CourseId[] = [];
    await db.transaction("rw", [db.courses, db.materials, db.lectures, db.practiceSets], async () => {
      for (const course of await db.courses.toArray()) {
        if (!course.sources.includes(by)) continue;
        const sources = course.sources.filter((s) => s !== by);
        if (sources.length > 0) {
          await db.courses.put({ ...course, sources });
          continue;
        }
        const used =
          (await db.materials.where("courseId").equals(course.id).count()) +
          (await db.lectures.where("courseId").equals(course.id).count()) +
          (await db.practiceSets.where("courseId").equals(course.id).count());
        if (used > 0) await db.courses.put({ ...course, sources: ["manual"] });
        else {
          await db.courses.delete(course.id);
          deleted.push(course.id);
        }
      }
    });
    return deleted;
  },
} as const;
