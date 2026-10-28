import { describe, expect, it } from "vitest";
import type { EpochMs, Passage, TimeZone } from "@/lib/domain";
import { chunkMaterial } from "@/lib/retrieval";
import { SAMPLE, sampleRows } from "@/lib/sample";
import { guideBlockDraft } from "./schema";
import { guideTasks } from "./tasks";

const { rows } = sampleRows({ now: Date.parse("2026-10-27T10:12:00-04:00") as EpochMs, zone: "America/Toronto" as TimeZone });
const slides = (rows.materials ?? []).find((m) => m.id === SAMPLE.materials.csc148L8Slides)!;
const chunks = chunkMaterial(slides, (rows.pages ?? []).filter((p) => p.materialId === slides.id));
const passages: Passage[] = chunks.map((c, i) => ({ id: `S${i + 1}` as Passage["id"], ref: c.ref, label: `Lecture 8 slides · Slide ${i + 1}`, text: c.text }));
const section = guideTasks["guide.section"];
const input = (title: string) => ({ course: "CSC148", chapter: "Trees", section: title, passages, hints: [], savedAnswers: [] });

describe("guide.section mock on the CSC148 sample", () => {
  it("copies the is_empty method from the Lecture 8 slide into the section Write this guide opens", () => {
    const items = section.mock(input("Trees and their parts"));
    expect(items.map((b) => guideBlockDraft.safeParse(b).success)).toEqual(items.map(() => true));
    expect(items.filter((b) => b.kind === "code")).toEqual([
      { kind: "code", lang: "python", text: "def is_empty(self) -> bool:\n    return self._root is None", caption: "`Tree.is_empty` is true exactly when the tree has no root value.", refs: [{ passage: "S6" }] },
    ]);
    expect(section.multiline).toBe(true);
  });

  it("shows the preorder method in the preorder section, captioned by its slide", () => {
    const code = section.mock(input("Preorder traversal")).flatMap((b) => (b.kind === "code" ? [[b.text.split("\n")[0], b.caption, b.refs]] : []));
    expect(code).toEqual([["def preorder(self) -> list:", "Visit the root first, then recurse on each subtree, left to right.", [{ passage: "S14" }]]]);
  });
});
