import {
  ids,
  sourceKey,
  type ChunkDraft,
  type Lecture,
  type Material,
  type MaterialPage,
  type PracticeSet,
  type Question,
  type Segment,
  type Solution,
  type SourceRef,
} from "@/lib/domain";

/** About 4 characters per token, so a 350-token window is about 1,400 characters. */
const WINDOW_CHARS = 1400;
const MIN_WINDOW_MS = 45_000;
const MAX_WINDOW_MS = 90_000;

function docFacts(m: Material) {
  return { kind: m.kind, title: m.title, ...(m.short ? { short: m.short } : {}), ...(m.lecture ? { lectureNumber: m.lecture.number } : {}) };
}

function slideText(p: MaterialPage): string {
  if (!p.slide) return p.text;
  return [p.slide.heading, p.slide.body, p.slide.code?.text].filter(Boolean).join("\n");
}

/** Slides: one chunk per slide. Text: paragraph windows of at most ~350 tokens, one paragraph of overlap. */
export function chunkMaterial(material: Material, pages: readonly MaterialPage[]): ChunkDraft[] {
  const key = sourceKey.material(material.id);
  const doc = docFacts(material);
  const sorted = [...pages].filter((p) => p.readBy !== "failed").sort((a, b) => a.index - b.index);
  if (material.kind === "slides") {
    return sorted.map((p) => ({
      courseId: material.courseId,
      sourceKey: key,
      ref: { kind: "page", materialId: material.id, doc, page: p.index, ...(p.slide?.heading ? { title: p.slide.heading } : {}) },
      text: slideText(p),
    }));
  }
  const paragraphs = sorted.flatMap((p) =>
    p.text
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ page: p, text })),
  );
  const out: ChunkDraft[] = [];
  let i = 0;
  while (i < paragraphs.length) {
    const start = i;
    let size = 0;
    const window: typeof paragraphs = [];
    // A window never crosses a section, so "A2 handout §3" cites the section that says it.
    while (i < paragraphs.length && (window.length === 0 || (size + paragraphs[i].text.length <= WINDOW_CHARS && paragraphs[i].page.section === window[0].page.section))) {
      window.push(paragraphs[i]);
      size += paragraphs[i].text.length;
      i++;
    }
    const first = window[0].page;
    const ref: SourceRef = {
      kind: "page",
      materialId: material.id,
      doc,
      page: first.index,
      ...(first.label ? { label: first.label } : {}),
      ...(first.section ? { section: first.section } : {}),
    };
    out.push({ courseId: material.courseId, sourceKey: key, ref, text: window.map((w) => w.text).join("\n\n") });
    if (i < paragraphs.length && i - start > 1 && paragraphs[i].page.section === paragraphs[i - 1].page.section) i--;
  }
  return out;
}

/** Transcript: 45 to 90 s windows of cleaned segments, cut at segment boundaries. */
export function transcriptWindows(lecture: Pick<Lecture, "id" | "courseId" | "number">, segments: readonly Segment[]): { ref: Extract<SourceRef, { kind: "transcript" }>; text: string }[] {
  const sorted = [...segments].sort((a, b) => a.seq - b.seq);
  const out: { ref: Extract<SourceRef, { kind: "transcript" }>; text: string }[] = [];
  let window: Segment[] = [];
  const flush = () => {
    if (window.length === 0) return;
    out.push({
      ref: {
        kind: "transcript",
        lectureId: lecture.id,
        courseId: lecture.courseId,
        ...(lecture.number !== undefined ? { lectureNumber: lecture.number } : {}),
        atMs: window[0].atMs,
        toMs: window[window.length - 1].endMs,
      },
      text: window.map((s) => s.text ?? s.raw).join(" "),
    });
    window = [];
  };
  for (const s of sorted) {
    if (window.length && s.endMs - window[0].atMs > MAX_WINDOW_MS) flush();
    window.push(s);
    if (window[window.length - 1].endMs - window[0].atMs >= MIN_WINDOW_MS) flush();
  }
  flush();
  return out;
}

export function chunkLecture(lecture: Lecture, segments: readonly Segment[]): ChunkDraft[] {
  return transcriptWindows(lecture, segments).map((w) => ({ courseId: lecture.courseId, sourceKey: sourceKey.lecture(lecture.id), ref: w.ref, text: w.text }));
}

/** Practice question: prompt, options, and the explanation when a solution exists. */
export function chunkQuestions(set: PracticeSet, questions: readonly Question[], solutions: readonly Solution[]): ChunkDraft[] {
  if (!set.courseId) return [];
  const courseId = set.courseId;
  const byQuestion = new Map(solutions.map((s) => [s.questionId, s]));
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      const s = byQuestion.get(q.id);
      return {
        courseId,
        sourceKey: sourceKey.set(set.id),
        ref: { kind: "question", setId: set.id, questionId: q.id, setTitle: set.title, number: q.number },
        text: [q.prompt, ...q.options.map((o) => `${o.label}. ${o.text}`), s ? `${s.explanation} ${s.conclusion ?? ""}`.trim() : ""].filter(Boolean).join("\n"),
      };
    });
}

export function withIds(drafts: readonly ChunkDraft[]) {
  return drafts.map((d, n) => ({ ...d, id: ids.chunk(d.sourceKey, n) }));
}
