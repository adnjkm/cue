import { db } from "@/lib/db";
import type { CourseId, EpochMs, GuideSection, Material, Passage } from "@/lib/domain";
import type { TaskInput } from "@/lib/ai";
import { retrieve } from "@/lib/retrieval";
import { courseSourcesFrom } from "@/lib/sources";

const PASSAGE_CHARS = 20_000;
const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
const overlap = (a: Set<string>, text: string) => [...words(text)].filter((w) => a.has(w)).length;

/** What a course's guide is written from right now; a draft keeps this stamp so a newer upload marks it stale. */
export async function courseStamp(courseId: CourseId): Promise<EpochMs> {
  const [materials, lectures] = await Promise.all([db.materials.where("courseId").equals(courseId).toArray(), db.lectures.where("courseId").equals(courseId).toArray()]);
  return courseSourcesFrom(
    materials,
    lectures.map((l) => ({ number: l.number, savedAt: l.state.status === "saved" ? l.state.savedAt : undefined })),
  ).stamp;
}

export async function courseMaterials(courseId: CourseId): Promise<Material[]> {
  return (await db.materials.where("courseId").equals(courseId).toArray()).sort((a, b) => a.addedAt - b.addedAt);
}

/** Headings a planner can read: slide headings, else each page's section mark and first line. */
export async function outlineInput(courseId: CourseId): Promise<TaskInput<"guide.outline">> {
  const materials = (await courseMaterials(courseId)).slice(0, 30);
  const lectures = await db.lectures.where("courseId").equals(courseId).toArray();
  const withHeadings = await Promise.all(
    materials.map(async (m) => {
      const pages = (await db.pages.where("materialId").equals(m.id).toArray()).sort((a, b) => a.index - b.index);
      const headings = pages.map((p) => {
        const first = (p.slide?.heading ?? p.text.split("\n").find((l) => l.trim()) ?? "").trim().replace(/[.:]$/, "");
        return [p.slide ? "" : p.section, first].filter(Boolean).join(" ").slice(0, 120);
      });
      return { title: m.title.slice(0, 120), kind: m.kind, headings: [...new Set(headings.filter(Boolean))].slice(0, 40) };
    }),
  );
  return {
    course: courseId,
    materials: withHeadings,
    lectures: lectures
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .slice(0, 60)
      .map((l) => ({ ...(l.number === undefined ? {} : { number: l.number }), ...(l.topic ? { topic: l.topic.full.slice(0, 120) } : {}) })),
  };
}

/** Passages, exam hints and saved answers for one section, ranked by how much they share with its titles. */
export async function sectionInput(section: GuideSection, chapter: string): Promise<{ input: TaskInput<"guide.section">; stamp: EpochMs }> {
  const topic = `${section.title} ${chapter}`;
  const terms = words(topic);
  const [stamp, found, lectures, saved] = await Promise.all([
    courseStamp(section.courseId),
    retrieve({ courseId: section.courseId, text: topic, k: 12, latency: "thorough" }),
    db.lectures.where("courseId").equals(section.courseId).toArray(),
    db.messages.where("courseId").equals(section.courseId).filter((m) => m.role === "assistant" && m.savedToGuideAt !== undefined).toArray(),
  ]);
  let chars = 0;
  const passages: Passage[] = [];
  for (const p of found) {
    if (chars + p.text.length > PASSAGE_CHARS) break;
    chars += p.text.length;
    passages.push({ ...p, id: `S${passages.length + 1}` as Passage["id"] });
  }
  const segments = lectures.length ? await db.segments.where("lectureId").anyOf(lectures.map((l) => l.id)).toArray() : [];
  const hints = segments
    .filter((s) => s.flag)
    .map((s) => {
      const lecture = lectures.find((l) => l.id === s.lectureId);
      const quote = (s.text ?? s.raw).slice(0, 400);
      const assessment = s.flag?.by === "model" ? s.flag.assessment?.label : undefined;
      return { quote, attribution: (lecture?.professor ?? (lecture?.number === undefined ? "Lecture" : `Lecture ${lecture.number}`)).slice(0, 60), ...(assessment ? { assessment: assessment.slice(0, 40) } : {}) };
    })
    .sort((a, b) => overlap(terms, b.quote) - overlap(terms, a.quote))
    .slice(0, 6);
  const savedAnswers = saved
    .sort((a, b) => overlap(terms, b.text) - overlap(terms, a.text))
    .slice(0, 4)
    .map((m) => m.text.slice(0, 2000));
  return { input: { course: section.courseId, chapter, section: section.title, passages, hints, savedAnswers }, stamp };
}
