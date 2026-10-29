import { describe, expect, it } from "vitest";
import type { CourseId, EpochMs, EventId, ImportId, LectureId, Material, MaterialId, PracticeSet, QuestionId, Segment, SetId } from "@/lib/domain";
import { applyHints, cardKey, catalogInput, coursework, flagLabel, linkFromMention, namesAssessment, notesFrom, parseStamp, partRange, segmentForQuote, transcriptForNotes, type LinkContext } from "./hints";

const ZONE = "America/Toronto";
const LECTURE = "lec.evt_mat137_tue" as LectureId;
const MAT = "MAT137" as CourseId;
const ms = (m: number, s: number) => (m * 60 + s) * 1000;
const at = (iso: string) => new Date(iso).getTime() as EpochMs;
const imp = "imp_x" as ImportId;

const termTest = { id: "evt_tt2" as EventId, kind: "test" as const, courseId: MAT, label: "Term Test 2", short: "Test 2", weight: "test" as const, start: at("2026-11-13T18:00:00-05:00"), end: at("2026-11-13T19:50:00-05:00"), importId: imp };
const ps5Due = { id: "evt_ps5" as EventId, kind: "deadline" as const, courseId: MAT, label: "Problem Set 5", short: "PS5", effort: "medium" as const, start: at("2026-10-29T23:59:00-04:00"), end: at("2026-10-29T23:59:00-04:00"), importId: imp };
const material = (id: string, kind: Material["kind"], title: string, lecture?: number): Material => ({
  id: id as MaterialId,
  courseId: MAT,
  kind,
  title,
  ...(lecture ? { lecture: { number: lecture } } : {}),
  pageCount: 10,
  addedAt: 0 as EpochMs,
});
const ps5 = material("mat_ps5", "problemSet", "Problem Set 5");
const textbook = material("mat_text", "textbook", "Textbook");
const slides9 = material("mat_l09", "slides", "Lecture 9 slides", 9);
const tt2024: PracticeSet = { id: "set_tt2024" as SetId, courseId: MAT, title: "2024 Term Test 2", origin: { kind: "paper", materialId: "mat_tt" as MaterialId }, view: { current: null, topic: null }, createdAt: 0 as EpochMs };

const work = coursework({
  events: [termTest, ps5Due],
  materials: [ps5, textbook, slides9],
  pages: new Map([["mat_text", [{ page: 3, label: "p. 482", section: "§7.1" }]]]),
  sets: [{ set: tt2024, questions: [{ id: "set_tt2024.q4" as QuestionId, number: "4" }] }],
  now: at("2026-10-27T09:47:30-04:00"),
});
const ctx: LinkContext = { lectureId: LECTURE, timeZone: ZONE, professor: "Prof. Chen" };

const seg = (seq: number, atMs: number, text: string, flag?: Segment["flag"]): Segment => ({ lectureId: LECTURE, seq, chunkSeq: seq, atMs, endMs: atMs + 12_000, raw: text.toLowerCase(), text, ...(flag ? { flag } : {}) });
const window = [
  seg(8, ms(31, 58), "Plug into the formula: x e to the x, minus the integral of e to the x dx."),
  seg(9, ms(33, 20), "If you pick u the other way around, the integral gets worse, not better. That’s the number one mistake I see, so there will be one of these on Term Test 2."),
];

describe("coursework catalog", () => {
  it("numbers assessments by date and materials after files, with the prompt’s lines", () => {
    expect(catalogInput(work, ZONE)).toEqual({
      assessments: [
        { id: "A1", label: "Problem Set 5", kind: "deadline", when: "Thu, Oct 29" },
        { id: "A2", label: "Term Test 2", kind: "test", when: "Fri, Nov 13" },
      ],
      materials: [
        { id: "M1", title: "Problem Set 5", kind: "problem set" },
        { id: "M2", title: "Textbook", kind: "textbook" },
        { id: "M3", title: "Lecture 9 slides", kind: "slides" },
        { id: "M4", title: "2024 Term Test 2", kind: "practice paper" },
      ],
    });
  });
});

describe("mention resolution", () => {
  it("writes the Paper cards for each kind of target", () => {
    const card = (ref: string, part: string | null, note: string | null, title: string | null = null) => {
      const l = linkFromMention(ctx, work, { ref, part, note, title }, ms(30, 2), "mention");
      return l && { title: l.title, meta: l.meta, target: l.target };
    };
    expect(card("M1", "Q3–Q6", "same technique")).toEqual({
      title: "Problem Set 5, Q3–Q6",
      meta: "Due Thursday · same technique",
      target: { kind: "page", materialId: "mat_ps5", doc: { kind: "problemSet", title: "Problem Set 5" }, page: 1, label: "Q3–Q6" },
    });
    expect(card("M2", "§7.1", "LIATE on p. 482", "Integration by parts")).toEqual({
      title: "Integration by parts",
      meta: "Textbook · §7.1, LIATE on p. 482",
      target: { kind: "page", materialId: "mat_text", doc: { kind: "textbook", title: "Textbook" }, page: 3, label: "§7.1", section: "§7.1" },
    });
    expect(card("M3", "4–9", null, "Deriving the formula")).toEqual({
      title: "Deriving the formula",
      meta: "Lecture 9 slides · 4–9",
      target: { kind: "page", materialId: "mat_l09", doc: { kind: "slides", title: "Lecture 9 slides", lectureNumber: 9 }, page: 4, to: 9 },
    });
    expect(card("M4", "Q4", "same choice of u and dv")).toEqual({
      title: "2024 Term Test 2, Q4",
      meta: "Practice · same choice of u and dv",
      target: { kind: "question", setId: "set_tt2024", questionId: "set_tt2024.q4", setTitle: "2024 Term Test 2", number: "4" },
    });
    expect(card("A2", null, null)).toEqual({
      title: "Term Test 2",
      meta: "13 Nov · mentioned in this lecture",
      target: { kind: "assessment", eventId: "evt_tt2", label: "Term Test 2", at: termTest.start },
    });
  });

  it("drops a mention whose id the catalog does not hold, or a question the paper does not have", () => {
    expect(linkFromMention(ctx, work, { ref: "M9", part: null, note: null, title: null }, 0, "mention")).toBeNull();
    expect(linkFromMention(ctx, work, { ref: "M4", part: "Q12", note: null, title: null }, 0, "mention")).toBeNull();
  });

  it("reads ranges out of the parts the model writes", () => {
    expect(partRange("slides 4 to 9")).toEqual({ from: 4, to: 9 });
    expect(partRange("p. 482")).toEqual({ from: 482 });
    expect(partRange("the intro")).toBeNull();
  });
});

describe("hint dedupe", () => {
  const out = {
    hints: [{ quote: "there will be one of these on Term Test 2", assessment: "A2" }],
    tasks: [],
    mentions: [{ ref: "M1", quote: "plug into the formula", title: null, part: "Q3–Q6", note: "same technique" }],
  };

  it("flags the segment that holds the quote and adds the hint’s card", () => {
    const r = applyHints(ctx, work, window, out);
    expect(r.flags).toEqual([{ seq: 9, flag: { by: "model", assessment: { label: "Term Test 2", eventId: "evt_tt2" } } }]);
    expect(r.links.map((l) => [l.atMs, l.title, l.meta, l.why])).toEqual([
      [ms(33, 20), "Term Test 2", "13 Nov · Prof. Chen says this will be on it", "hint"],
      [ms(31, 58), "Problem Set 5, Q3–Q6", "Due Thursday · same technique", "mention"],
    ]);
  });

  it("changes nothing when the next window repeats the same quote and mention", () => {
    const first = applyHints(ctx, work, window, out);
    const flagged = window.map((s) => ({ ...s, ...(first.flags.find((f) => f.seq === s.seq) ? { flag: first.flags.find((f) => f.seq === s.seq)!.flag } : {}) }));
    const again = applyHints(ctx, work, flagged, { ...out, hints: [...out.hints, { quote: "That’s the number one mistake I see", assessment: null }] }, { existingLinks: new Set(first.links.map((l) => l.id)) });
    expect(again).toEqual({ flags: [], links: [] });
  });

  it("keeps a line the student unflagged, and ignores a quote no line holds", () => {
    expect(applyHints(ctx, work, window, out, { dismissed: new Set([9]) }).flags).toEqual([]);
    expect(applyHints(ctx, work, window, { hints: [{ quote: "office hours are on Thursday", assessment: null }], tasks: [], mentions: [] }).flags).toEqual([]);
  });

  it("links a test only when the professor's words name it", () => {
    const wrongTest = { hints: [{ quote: "there will be one of these on Term Test 2", assessment: "A1" }], tasks: [], mentions: [{ ref: "A1", quote: "plug into the formula", title: null, part: null, note: null }] };
    const r = applyHints(ctx, work, window, wrongTest);
    expect(r.flags).toEqual([{ seq: 9, flag: { by: "model", assessment: null } }]);
    expect(r.links).toEqual([]);
    expect([namesAssessment("Term Test 2", "one of these on term test two"), namesAssessment("Term Test 1", "on Term Test 2"), namesAssessment("Problem Set 5", "Problem Set 5 questions 3 to 6")]).toEqual([true, false, true]);
  });

  it("shows one card for the same slides under the same title, and capitalizes the model's titles", () => {
    const twice = {
      hints: [],
      tasks: [],
      mentions: [
        { ref: "M3", quote: "plug into the formula", title: "deriving the formula", part: "4–9", note: null },
        { ref: "M3", quote: "plug into the formula", title: "Deriving the formula", part: "6", note: "same technique" },
      ],
    };
    const r = applyHints(ctx, work, window, twice);
    expect(r.links.map((l) => l.title)).toEqual(["Deriving the formula"]);
    expect(applyHints(ctx, work, window, twice, { existingCards: new Set(r.links.map(cardKey)) }).links).toEqual([]);
  });

  it("finds a quote that the cleanup reworded slightly", () => {
    expect(segmentForQuote("the number one mistake i see so there will be one of these on term test two", window)?.seq).toBe(9);
  });
});

describe("labels and stamps", () => {
  it("writes the flag label for each kind of flag", () => {
    const model = { by: "model" as const, assessment: { label: "Term Test 2" } };
    expect([flagLabel(model, "live"), flagLabel(model, "saved")]).toEqual(["Flagged · on Term Test 2", "on Term Test 2"]);
    expect([flagLabel({ by: "model", assessment: null }, "live"), flagLabel({ by: "user" }, "saved")]).toEqual(["Flagged · exam hint", "Flagged by you"]);
  });

  it("parses transcript stamps", () => {
    expect([parseStamp("33:20"), parseStamp("0:45"), parseStamp("1:02:03"), parseStamp("33:75"), parseStamp("soon")]).toEqual([2_000_000, 45_000, 3_723_000, null, null]);
  });

  it("pins key points to the line at or before their stamp and writes the transcript the prompt reads", () => {
    const segments = [seg(0, ms(6, 40), "Start from the product rule."), ...window];
    const notes = notesFrom(
      {
        summary: " Integration by parts is the product rule run backwards. ",
        keyPoints: [
          { at: "33:25", text: "Picking u the wrong way makes it worse." },
          { at: "6:40", text: "The formula comes from the product rule." },
          { at: "33:20", text: "Picking u the wrong way makes it worse." },
        ],
      },
      segments,
      5 as EpochMs,
    );
    expect(notes).toEqual({
      summary: "Integration by parts is the product rule run backwards.",
      keyPoints: [
        { atMs: ms(6, 40), text: "The formula comes from the product rule." },
        { atMs: ms(33, 20), text: "Picking u the wrong way makes it worse." },
      ],
      generatedAt: 5,
    });
    expect(transcriptForNotes([seg(1, ms(31, 58), "Plug in."), seg(2, ms(33, 20), "On the test.", { by: "user" })])).toBe("[31:58] Plug in.\n[33:20] (exam hint) On the test.");
  });
});
