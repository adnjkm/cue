import { describe, expect, it } from "vitest";
import { errorCopy } from "@/lib/ai";
import type { CourseId, EpochMs, Guide, MaterialId, Passage, SectionId } from "@/lib/domain";
import { guidesLanding, joinNames, locate, openingSection, outlineRows, restoredError, sourceNames } from "./model";

const CSC = "CSC148" as CourseId;
const outline = {
  chapters: [
    { title: "Trees", textbookChapter: 5, sections: ["Trees and their parts", "Recursion on trees"] },
    { title: "Trees", sections: ["Recursion on trees", "Preorder traversal"] },
  ],
};

describe("outlineRows", () => {
  const { guide, sections } = outlineRows(CSC, outline, 1 as EpochMs);

  it("builds URL-safe ids from titles and keeps repeated titles apart", () => {
    expect(guide.chapters.map((c) => c.id)).toEqual(["CSC148.trees", "CSC148.trees-2"]);
    expect(sections.map((s) => s.id)).toEqual(["CSC148.trees-and-their-parts", "CSC148.recursion-on-trees", "CSC148.recursion-on-trees-2", "CSC148.preorder-traversal"]);
  });

  it("numbers sections in reading order across chapters and keeps the textbook chapter apart", () => {
    expect(sections.map((s) => [s.order, s.chapterId])).toEqual([
      [0, "CSC148.trees"],
      [1, "CSC148.trees"],
      [2, "CSC148.trees-2"],
      [3, "CSC148.trees-2"],
    ]);
    expect(guide.chapters.map((c) => c.textbookChapter)).toEqual([5, undefined]);
    expect(sections.every((s) => s.draft === undefined)).toBe(true);
  });

  it("locates a slug with its neighbours, and opens the last-read section before the first", () => {
    const here = locate(guide, sections, "recursion-on-trees-2");
    expect([here?.section.title, here?.chapter.id, here?.prev?.id, here?.next?.id]).toEqual(["Recursion on trees", "CSC148.trees-2", "CSC148.recursion-on-trees", "CSC148.preorder-traversal"]);
    expect(locate(guide, sections, "no-such-section")).toBeNull();
    expect(openingSection(guide, sections)).toBe("CSC148.trees-and-their-parts");
    expect(openingSection({ ...guide, lastRead: { sectionId: "CSC148.preorder-traversal" as SectionId, at: 5 as EpochMs } }, sections)).toBe("CSC148.preorder-traversal");
    expect(openingSection({ ...guide, lastRead: { sectionId: "CSC148.gone" as SectionId, at: 5 as EpochMs } }, sections)).toBe("CSC148.trees-and-their-parts");
  });
});

describe("guidesLanding", () => {
  const courses = [{ id: "MAT137" as CourseId, code: "MAT137" }, { id: "ECO101" as CourseId, code: "ECO101" }, { id: CSC, code: "CSC148" }];
  const guide = (courseId: string, at?: number): Guide => ({ courseId: courseId as CourseId, chapters: [], outlinedAt: 0 as EpochMs, ...(at ? { lastRead: { sectionId: `${courseId}.x` as SectionId, at: at as EpochMs } } : {}) });

  it("opens the most recently read guide at its section", () => {
    expect(guidesLanding(courses, [guide("ECO101", 10), guide("MAT137", 20)])).toEqual({ courseId: "MAT137", sectionId: "MAT137.x" });
  });
  it("falls back to the first course with a guide, then the first course", () => {
    expect(guidesLanding(courses, [guide("MAT137"), guide("ECO101")])).toEqual({ courseId: "ECO101" });
    expect(guidesLanding(courses, [])).toEqual({ courseId: "CSC148" });
    expect(guidesLanding([], [])).toBeNull();
  });
});

describe("source names", () => {
  it("says what a section is written from, three names at most", () => {
    const page = (title: string, kind: "slides" | "textbook", section?: string) => ({ ref: { kind: "page" as const, materialId: "m" as MaterialId, doc: { kind, title }, page: 1, ...(section ? { section } : {}) } });
    const lecture = { ref: { kind: "transcript" as const, lectureId: "l" as never, courseId: CSC, lectureNumber: 7, atMs: 0 } };
    expect(sourceNames([lecture, page("Lecture 7 slides", "slides"), lecture, page("Textbook", "textbook", "§5.1")] as Pick<Passage, "ref">[])).toBe("Lecture 7, Lecture 7 slides and Textbook ch. 5");
    expect(joinNames(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
    expect(joinNames(["Lecture 8 slides"])).toBe("Lecture 8 slides");
    expect(joinNames([])).toBe("");
  });
});

describe("restoredError", () => {
  const copy = (...args: Parameters<typeof restoredError>) => {
    const error = restoredError(...args);
    return error && errorCopy(error);
  };

  it("keeps the copy of a kind that needs no server fact", () => {
    expect(copy("rate_limited", undefined)).toEqual({ title: "Cue is busy right now.", detail: "Try again in a moment.", retry: true });
  });

  it("says AI is paused, with no amount, when the cap is reached", () => {
    expect(copy("budget", { mode: "token-factory", embedder: null, spend: { spentUsd: 30.02, capUsd: 30 } })).toEqual({
      title: "Cue’s AI is paused for now.",
      detail: "Your plan, notes and saved questions still work. Try again later.",
      retry: false,
    });
  });

  it("says AI isn’t set up only when Token Factory reports no spend", () => {
    expect(copy("budget", { mode: "token-factory", embedder: null })).toEqual({
      title: "Cue’s AI isn’t set up on this server.",
      detail: "Set SPEND_CAP_USD to a number in .env.local (on Vercel, also add the Upstash Redis keys), then restart the server.",
      retry: false,
    });
  });

  it("gives no reason for a budget error while the status is unknown or in a mode without a cap", () => {
    expect(copy("budget", undefined)).toBeNull();
    expect(copy("budget", { mode: "mock", embedder: null })).toBeNull();
    expect(copy("budget", { mode: "openrouter", embedder: null })).toBeNull();
  });
});
