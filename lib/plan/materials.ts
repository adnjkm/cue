import { db } from "@/lib/db";
import { ids, type BlockMaterials, type Material, type SetId, type SourceRef, type StudyBlock } from "@/lib/domain";
import { topicMatch } from "./titles";

const KIND_ORDER: Record<Material["kind"], number> = { slides: 0, handout: 1, notes: 2, textbook: 3, problemSet: 4, pastPaper: 5, syllabus: 6, other: 7 };

function refFor(m: Material): SourceRef {
  return {
    kind: "page",
    materialId: m.id,
    doc: { kind: m.kind, title: m.title, ...(m.short ? { short: m.short } : {}), ...(m.lecture ? { lectureNumber: m.lecture.number } : {}) },
    page: 1,
  };
}

/** What Today's card and the session viewer show for a block: linked materials, the transcript and matching practice. */
export async function blockMaterials(block: StudyBlock): Promise<BlockMaterials> {
  const lectureEvent = block.anchor.kind === "review" ? block.anchor.lecture : undefined;
  const linked = lectureEvent ? await db.materials.where("lecture.eventId").equals(lectureEvent).toArray() : [];
  const course = block.courseId ? await db.materials.where("courseId").equals(block.courseId).toArray() : [];
  const matching = course.filter((m) => (m.kind === "handout" || m.kind === "notes") && !linked.some((l) => l.id === m.id) && topicMatch(m.title, block.topic.full));
  const materials = [...linked, ...matching]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.addedAt - b.addedAt)
    .map((m) => ({ materialId: m.id, label: m.short ?? m.title, ref: refFor(m) }));

  const lecture = lectureEvent ? await db.lectures.get(ids.lectureForEvent(lectureEvent)) : undefined;
  const transcript = lecture ? { lectureId: lecture.id, label: lecture.number === undefined ? "Lecture transcript" : `Lecture ${lecture.number} transcript` } : undefined;

  const sets = block.courseId ? await db.practiceSets.where("courseId").equals(block.courseId).toArray() : [];
  const perSet: { setId: SetId; n: number; createdAt: number }[] = [];
  for (const set of sets) {
    const questions = await db.questions.where("setId").equals(set.id).toArray();
    const n = questions.filter((q) => topicMatch(q.topic, block.topic.full)).length;
    if (n > 0) perSet.push({ setId: set.id, n, createdAt: set.createdAt });
  }
  const best = [...perSet].sort((a, b) => b.n - a.n || b.createdAt - a.createdAt)[0];
  const count = perSet.reduce((a, b) => a + b.n, 0);
  return { materials, ...(transcript ? { transcript } : {}), practice: { count, ...(best ? { setId: best.setId } : {}), topic: block.topic.full } };
}
