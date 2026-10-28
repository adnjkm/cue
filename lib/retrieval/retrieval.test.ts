import { describe, expect, it } from "vitest";
import { ids, type Chunk, type Passage, type SourceRef, type TimeZone } from "@/lib/domain";
import { sampleContext } from "@/lib/sample/context";
import { SAMPLE } from "@/lib/sample/ids";
import { lecturesSample } from "@/lib/sample/lectures";
import { sampleMaterials } from "@/lib/sample/materials";
import { practiceSample } from "@/lib/sample/practice";
import { sourceLabel } from "@/lib/sources";
import { parseCitations, refsFor } from "./cite";
import { chunkLecture, chunkMaterial, chunkQuestions, transcriptWindows } from "./chunk";
import { bm25, buildIndex, fuse, tokenize } from "./rank";

const ctx = sampleContext({ now: Date.parse("2026-10-27T10:12:00-04:00"), zone: "America/Toronto" as TimeZone });
const lectureRows = lecturesSample(ctx);
const practiceRows = practiceSample(ctx);
const rows = {
  ...sampleMaterials(ctx),
  lectures: lectureRows.lectures ?? [],
  segments: lectureRows.segments ?? [],
  practiceSets: practiceRows.practiceSets ?? [],
  questions: practiceRows.questions ?? [],
  solutions: practiceRows.solutions ?? [],
};

function sampleChunks(): Chunk[] {
  const drafts = [
    ...rows.materials.flatMap((m) => chunkMaterial(m, rows.pages.filter((p) => p.materialId === m.id))),
    ...rows.lectures.flatMap((l) => chunkLecture(l, rows.segments.filter((s) => s.lectureId === l.id))),
    ...rows.practiceSets.flatMap((s) => chunkQuestions(s, rows.questions.filter((q) => q.setId === s.id), rows.solutions)),
  ];
  const counters = new Map<string, number>();
  return drafts.map((d) => {
    const n = counters.get(d.sourceKey) ?? 0;
    counters.set(d.sourceKey, n + 1);
    return { ...d, id: ids.chunk(d.sourceKey, n) };
  });
}

function lexical(courseId: string, text: string, k = 8): Passage[] {
  const chunks = sampleChunks().filter((c) => c.courseId === courseId);
  return fuse(chunks, [bm25(buildIndex(chunks), text)], { k, prefer: [`lec:${SAMPLE.lectures.csc148Lecture8}` as never] });
}

describe("retrieval on the sample semester, lexical only", () => {
  it("ranks the study chat’s three sources in the top 8", () => {
    const labels = lexical("CSC148", "Is postorder just preorder backwards? For A2 I need to delete subtrees.").map((p) => sourceLabel(p.ref, "chip"));
    expect(labels).toEqual(expect.arrayContaining(["Slide 17", "Transcript 41:05", "A2 handout §3"]));
  });

  it("catches exact terms an embedder blurs", () => {
    expect(tokenize("Textbook §5.2 and is_empty on Term Test 2")).toEqual(["textbook", "§5.2", "is_empty", "term", "test", "2"]);
    const top = lexical("ECO101", "§5.1 p. 92 price elasticity")[0];
    expect(sourceLabel(top.ref, "meta")).toMatch(/^Textbook · §5\.1|^Lecture 7/);
  });

  it("numbers passages S1… and keeps at most two per page or transcript minute", () => {
    const ps = lexical("CSC148", "postorder traversal delete children parent tree", 8);
    expect(ps.map((p) => p.id)).toEqual(ps.map((_, i) => `S${i + 1}`));
    const places = ps.map((p) => (p.ref.kind === "transcript" ? `${p.ref.lectureId}@${Math.floor(p.ref.atMs / 60000)}` : JSON.stringify(p.ref)));
    for (const place of new Set(places)) expect(places.filter((x) => x === place).length).toBeLessThanOrEqual(2);
  });
});

describe("chunkers", () => {
  it("makes one chunk per slide with the slide heading as title", () => {
    const slides = rows.materials.find((m) => m.id === SAMPLE.materials.csc148L8Slides)!;
    const chunks = chunkMaterial(slides, rows.pages.filter((p) => p.materialId === slides.id));
    expect(chunks).toHaveLength(32);
    expect(chunks[16].ref).toMatchObject({ kind: "page", page: 17, title: "Postorder traversal" });
  });

  it("windows a transcript at 45 to 90 s, cut at segment boundaries", () => {
    const lecture = rows.lectures.find((l) => l.id === SAMPLE.lectures.csc148Lecture8)!;
    const windows = transcriptWindows(lecture, rows.segments.filter((s) => s.lectureId === lecture.id));
    expect(windows.map((w) => sourceLabel(w.ref, "chip"))).toContain("Transcript 41:05");
    for (const w of windows) expect((w.ref.toMs ?? 0) - w.ref.atMs).toBeLessThanOrEqual(90_000);
  });
});

describe("citations", () => {
  const passages: Passage[] = [
    { id: "S1", label: "a", text: "", ref: { kind: "assessment", eventId: "e1" as never, label: "One", at: 0 as never } },
    { id: "S2", label: "b", text: "", ref: { kind: "assessment", eventId: "e2" as never, label: "Two", at: 0 as never } },
  ];
  const label = (r: SourceRef) => sourceLabel(r, "chip");

  it("strips markers, keeps first-mention order and drops unknown ids", () => {
    const r = parseCitations("Postorder deletes children first [S2]. It is not reversed preorder [S1, S9] [S2].", passages);
    expect(r.text).toBe("Postorder deletes children first. It is not reversed preorder.");
    expect(r.citations.map(label)).toEqual(["Two", "One"]);
  });

  it("resolves structured passage ids in order, once each", () => {
    expect(refsFor(["S2", "S7", "S2", "S1"], passages).map(label)).toEqual(["Two", "One"]);
  });
});
