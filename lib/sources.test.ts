import { describe, expect, it } from "vitest";
import type { CourseId, EpochMs, LectureId, MaterialId, QuestionId, SetId, SourceRef } from "@/lib/domain";
import { courseSourcesFrom, footnoteText, sourceLabel } from "@/lib/sources";

const stamp = (m: number, s: number) => (m * 60 + s) * 1000;
const slides = (lecture: number, page: number, to?: number): SourceRef => ({
  kind: "page",
  materialId: `mat_l${lecture}` as MaterialId,
  doc: { kind: "slides", title: `Lecture ${lecture} slides`, lectureNumber: lecture },
  page,
  ...(to ? { to } : {}),
});
const transcript = (lecture: number, atMs: number): SourceRef => ({
  kind: "transcript",
  lectureId: `lec.l${lecture}` as LectureId,
  courseId: "CSC148" as CourseId,
  lectureNumber: lecture,
  atMs,
});
const textbook = (extra: Partial<Extract<SourceRef, { kind: "page" }>>): SourceRef => ({
  kind: "page",
  materialId: "mat_text" as MaterialId,
  doc: { kind: "textbook", title: "Textbook" },
  page: 92,
  ...extra,
});
const problemSet = (q: number): SourceRef => ({
  kind: "page",
  materialId: "mat_ps4" as MaterialId,
  doc: { kind: "problemSet", title: "Problem Set 4", short: "PS4" },
  page: q,
  label: `Q${q}`,
});

describe("sourceLabel", () => {
  it("writes the study session chips", () => {
    expect(sourceLabel(slides(8, 17), "chip")).toBe("Slide 17");
    expect(sourceLabel(transcript(8, stamp(41, 5)), "chip")).toBe("Transcript 41:05");
    const a2: SourceRef = { kind: "page", materialId: "mat_a2" as MaterialId, doc: { kind: "handout", title: "A2 handout" }, page: 3, section: "§3" };
    expect(sourceLabel(a2, "chip")).toBe("A2 handout §3");
    expect(sourceLabel(textbook({ section: "§5.2" }), "chip")).toBe("Textbook §5.2");
  });

  it("writes the practice resource metas", () => {
    expect(sourceLabel(slides(8, 17), "meta")).toBe("Lecture 8 slides · Slide 17");
    expect(sourceLabel(transcript(8, stamp(41, 5)), "meta")).toBe("Lecture 8 transcript · 41:05");
    const notes: SourceRef = { kind: "page", materialId: "mat_notes" as MaterialId, doc: { kind: "notes", title: "Course notes" }, page: 40, section: "§5.3" };
    expect(sourceLabel(notes, "meta")).toBe("Course notes · §5.3");
    const q: SourceRef = { kind: "question", setId: "set_tt2" as SetId, questionId: "set_tt2.q4" as QuestionId, setTitle: "2024 Term Test 2", number: "4" };
    expect(sourceLabel(q, "meta")).toBe("2024 Term Test 2, Q4");
  });

  it("writes footnote sources", () => {
    expect(sourceLabel(transcript(7, stamp(4, 15)), "footnote")).toBe("Lecture 7 at 4:15");
    expect(sourceLabel(slides(7, 6, 8), "footnote")).toBe("Lecture 7 slides 6–8");
    expect(sourceLabel(textbook({ section: "§5.1", label: "p. 92" }), "footnote")).toBe("Textbook ch. 5, p. 92");
    expect(sourceLabel(textbook({ figure: "5-1" }), "footnote")).toBe("Textbook Figure 5-1");
    expect(sourceLabel(problemSet(1), "footnote")).toBe("Problem Set 4, Q1");
  });
});

describe("footnoteText", () => {
  it("renders the four Paper footnotes", () => {
    expect(footnoteText([{ ref: transcript(7, stamp(4, 15)) }, { ref: textbook({ section: "§5.1", label: "p. 92" }) }])).toBe("Lecture 7 at 4:15. Textbook ch. 5, p. 92.");
    expect(footnoteText([{ ref: slides(7, 6, 8) }, { ref: problemSet(1), relation: "used" }])).toBe("Lecture 7 slides 6–8. Used in Problem Set 4, Q1.");
    expect(footnoteText([{ ref: transcript(7, stamp(18, 40)), note: "redrawn from the whiteboard sketch" }, { ref: textbook({ figure: "5-1" }) }])).toBe(
      "Lecture 7 at 18:40, redrawn from the whiteboard sketch. Textbook Figure 5-1.",
    );
    expect(footnoteText([{ ref: transcript(7, stamp(31, 10)) }, { ref: problemSet(2), relation: "tested" }])).toBe("Lecture 7 at 31:10. Tested in Problem Set 4, Q2.");
  });
});

describe("courseSourcesFrom", () => {
  it("names the newest material or saved lecture", () => {
    const s = courseSourcesFrom([{ title: "Textbook", addedAt: 10 as EpochMs }, { title: "Lecture 8 slides", addedAt: 30 as EpochMs }], [{ number: 7, savedAt: 20 as EpochMs }, { number: 9 }]);
    expect(s).toEqual({ stamp: 30, newest: { label: "Lecture 8 slides", at: 30 } });
    expect(courseSourcesFrom([], [{ number: 7, savedAt: 5 as EpochMs }]).newest?.label).toBe("Lecture 7");
  });
});
