import { hashId, type EpochMs, type Lecture, type LectureId, type LinkId, type MaterialId, type RelatedLink, type Segment, type SetId, type QuestionId } from "@/lib/domain";
import type { SampleFragment } from "./context";
import { SAMPLE } from "./ids";

const MIN = 60_000;
const at = (m: number, s: number) => (m * 60 + s) * 1000;

type Line = [atMs: number, text: string, flag?: "hint"];

/** Groups lines into segments of the given length so each key moment starts its own transcript window. */
function segments(lectureId: LectureId, lines: readonly Line[], hint: Segment["flag"] | undefined, durationMs = 16_000): Segment[] {
  return lines.map(([atMs, text, flag], seq) => ({
    lectureId,
    seq,
    chunkSeq: Math.floor(atMs / 15_000),
    atMs,
    endMs: atMs + durationMs,
    raw: text.toLowerCase().replace(/[^\w\s']/g, ""),
    text,
    ...(flag === "hint" && hint ? { flag: hint } : {}),
  }));
}

/** CSC148 Lecture 8, Mon 26 Oct: clusters around the moments Study and Practice cite (32:14, 41:05). */
const CSC148_L8: Line[] = [
  [at(2, 10), "Okay, today is trees. A tree is either empty, or a root with some subtrees."],
  [at(2, 26), "Every subtree is itself a tree, which is why everything today is recursive."],
  [at(2, 42), "Keep that definition in your head, we lean on it all hour."],
  [at(15, 0), "Let's write size. One for the root, plus the size of each subtree."],
  [at(15, 16), "And what's the size of an empty tree? Zero. That's the base case."],
  [at(15, 32), "Notice we check is_empty before we ever look at the root."],
  [at(24, 5), "Traversals. The only question is when you visit the root."],
  [at(24, 21), "Preorder visits the root first, then each subtree, left to right."],
  [at(24, 37), "On our example that's A, B, D, E, C."],
  [
    at(32, 14),
    "…and this is the part people lose marks on. If you forget the empty-tree check, every leaf calls into nothing. I will put a base-case question on the midterm.",
    "hint",
  ],
  [at(32, 30), "So write the base case first, every time, before anything else."],
  [at(32, 46), "Then the recursive case, which combines the subtrees."],
  [at(41, 5), "Postorder is the one you want for deleting. Delete the children before the parent, otherwise nothing points to them anymore."],
  [at(41, 21), "So postorder is not preorder backwards. Reversing preorder flips the children too."],
  [at(41, 37), "For A2 you will delete whole subtrees, so this is exactly the order you need."],
  [at(46, 30), "Inorder only makes sense for binary trees: left, root, right."],
  [at(46, 46), "Next time, binary search trees."],
  [at(47, 2), "Lab 6 has you write all three traversals."],
];

/** MAT137, Tue 27 Oct: the Paper note-taker rows verbatim, plus the invented earlier lines from lecture-notes.md. */
const MAT137_TUE: Line[] = [
  [at(0, 45), "Morning. Today is integration by parts, which is really just the product rule run backwards."],
  [at(6, 40), "Start from the derivative of u times v. Integrate both sides and you get the formula on slide 6."],
  [at(12, 15), "The skill here is choosing u. Pick the part that gets simpler when you differentiate it."],
  [at(17, 5), "This is the exact setup from last year's Term Test 2. Same choice of u and dv."],
  [at(24, 30), "If you are not sure, write both choices down and see which integral you can actually do."],
  [at(29, 30), "Okay, let's actually do one. The integral of x e to the x, dx."],
  [at(30, 2), "Which one is u? Think LIATE. x is algebraic, e to the x is exponential, so algebraic comes first."],
  [at(30, 41), "So u equals x, which means du is just dx. And dv is e to the x dx, so v is e to the x."],
  [at(31, 58), "Plug into the formula: x e to the x, minus the integral of e to the x dx."],
  [
    at(33, 20),
    "If you pick u the other way around, the integral gets worse, not better. That's the number one mistake I see, so there will be one of these on Term Test 2.",
    "hint",
  ],
  [at(35, 47), "So the answer is x e to the x minus e to the x, plus C. Always check by differentiating."],
  [at(37, 10), "Now, what happens if we need to do this twice? Take x squared e to the x."],
];

/** The rest of the Tue lecture, after the Paper live state, for the default (saved) scenario. */
const MAT137_TUE_REST: Line[] = [
  [at(38, 25), "The same trick comes back, we just apply it a second time to the leftover integral."],
  [at(42, 10), "u is x squared, so du is 2x dx, and we're left with an integral of x e to the x, which we just did."],
  [at(46, 50), "So the answer is e to the x times x squared minus 2x plus 2, plus C."],
  [at(49, 20), "Problem Set 5, questions 3 to 6, use exactly this technique."],
];

/** ECO101 Lecture 7, Wed 21 Oct: the moments the study guide's footnotes cite (4:15, 18:40, 31:10). */
const ECO101_L7: Line[] = [
  [at(4, 15), "Elasticity is about how strongly buyers react. If a small price rise makes people buy a lot less, demand is elastic."],
  [at(4, 31), "If they keep buying about the same amount, demand is inelastic."],
  [at(4, 47), "Gasoline is the classic inelastic good. Restaurant meals are elastic."],
  [at(18, 40), "Let me draw this. Same price rise, P1 to P2, on a flat curve and on a steep one."],
  [at(18, 56), "On the flat one quantity falls a lot. On the steep one it barely moves."],
  [at(19, 12), "That's the whole picture of elastic versus inelastic."],
  [at(31, 10), "Half of you will look at a steep line and write ‘inelastic’. Read the percentages, not the picture.", "hint"],
  [at(31, 26), "A straight line has one slope, but its elasticity changes as you move along it."],
  [at(31, 42), "This will be on the midterm, I promise you."],
];

const link = (lectureId: LectureId, atMs: number, target: RelatedLink["target"], title: string, meta: string, why: RelatedLink["why"]): RelatedLink => ({
  id: `lnk_${hashId(`${lectureId}|${JSON.stringify(target)}`)}` as LinkId,
  lectureId,
  atMs,
  target,
  title,
  meta,
  why,
});

/** Lecture notes' sample rows: the CSC148 and ECO101 lectures saved with notes, and the MAT137 Tuesday lecture in both scenarios. */
export const lecturesSample: SampleFragment<"lectures" | "segments" | "links" | "audio"> = (ctx) => {
  const { lectures: L, courses: C, events: E } = SAMPLE;
  const live = ctx.scenario === "liveLecture";
  const midtermHint: Segment["flag"] = { by: "model", assessment: { label: "Midterm", eventId: E.csc148Midterm } };
  const tt2Hint: Segment["flag"] = { by: "model", assessment: { label: "Term Test 2", eventId: E.mat137TermTest2 } };
  const ecoHint: Segment["flag"] = { by: "model", assessment: { label: "Midterm", eventId: "evt_sample_eco101_midterm" as never } };
  const saved = (end: EpochMs) => ({ status: "saved" as const, savedAt: end, capturedMs: 50 * MIN });
  const notes = (summary: string, keyPoints: [number, string][], generatedAt: EpochMs) => ({ summary, keyPoints: keyPoints.map(([atMs, text]) => ({ atMs, text })), generatedAt });

  const cscEnd = ctx.at(1, "11:00");
  const matEnd = ctx.at(2, "10:00");
  const ecoEnd = ctx.at(3, "14:00", -1);
  const lectures: Lecture[] = [
    {
      id: L.csc148Lecture8,
      courseId: C.csc148,
      eventId: E.csc148Lecture8,
      number: 8,
      topic: { full: "Recursion & tree traversal", short: "Recursion" },
      professor: "Prof. Liu",
      scheduledMs: 50 * MIN,
      state: saved(cscEnd),
      notes: notes(
        "Trees are recursive: every method checks the empty tree first, then combines its subtrees. Preorder visits the root first, postorder last, and postorder is the order for deleting subtrees.",
        [
          [at(15, 16), "The empty tree is the base case: size 0."],
          [at(24, 21), "Preorder: root, then each subtree left to right."],
          [at(41, 5), "Postorder deletes children before the parent."],
        ],
        cscEnd,
      ),
      updatedAt: cscEnd,
    },
    {
      id: L.mat137Tue,
      courseId: C.mat137,
      eventId: E.mat137LectureTue,
      number: 15,
      topic: { full: "Integration by parts", short: "By parts" },
      professor: "Prof. Chen",
      scheduledMs: 50 * MIN,
      state: live ? { status: "paused", engine: "demo", capturedMs: at(37, 30) } : saved(matEnd),
      ...(live
        ? {}
        : {
            notes: notes(
              "Integration by parts is the product rule run backwards. Choose u with LIATE so du is simpler, apply ∫ u dv = uv − ∫ v du, and check by differentiating.",
              [
                [at(6, 40), "The formula comes from integrating the product rule."],
                [at(30, 2), "LIATE picks u: algebraic before exponential."],
                [at(33, 20), "Picking u the wrong way makes the integral worse."],
                [at(38, 25), "Some integrals need the trick twice."],
              ],
              matEnd,
            ),
          }),
      updatedAt: live ? ctx.at(2, "09:47") : matEnd,
    },
    {
      id: L.eco101Lecture7,
      courseId: C.eco101,
      eventId: E.eco101Lecture7,
      number: 7,
      topic: { full: "Price elasticity of demand", short: "Elasticity" },
      professor: "Prof. Okafor",
      scheduledMs: 50 * MIN,
      state: saved(ecoEnd),
      notes: notes(
        "Elasticity measures how strongly quantity responds to price. Compute it with percentage changes and the midpoint method; slope is not elasticity.",
        [
          [at(4, 15), "Elastic demand reacts strongly; inelastic barely moves."],
          [at(31, 10), "Read the percentages, not the slope of the picture."],
        ],
        ecoEnd,
      ),
      updatedAt: ecoEnd,
    },
  ];

  const matLines = live ? MAT137_TUE : [...MAT137_TUE, ...MAT137_TUE_REST];
  const tueSegments = segments(L.mat137Tue, matLines, tt2Hint, 12_000);

  const links: RelatedLink[] = [
    link(L.mat137Tue, at(33, 20), { kind: "assessment", eventId: E.mat137TermTest2, label: "Term Test 2", at: ctx.at(5, "18:00", 2) }, "Term Test 2", "Nov 13 · Prof. Chen says this will be on it", "hint"),
    link(
      L.mat137Tue,
      at(31, 58),
      { kind: "page", materialId: "mat_sample_mat137_ps5" as MaterialId, doc: { kind: "problemSet", title: "Problem Set 5", short: "PS5" }, page: 1, label: "Q3–Q6" },
      "Problem Set 5, Q3–Q6",
      "Due Thursday · same technique",
      "mention",
    ),
    link(
      L.mat137Tue,
      at(30, 2),
      { kind: "page", materialId: "mat_sample_mat137_text" as MaterialId, doc: { kind: "textbook", title: "Textbook" }, page: 1, section: "§7.1", label: "p. 482" },
      "Integration by parts",
      "Textbook · §7.1, LIATE on p. 482",
      "mention",
    ),
    link(
      L.mat137Tue,
      at(17, 5),
      { kind: "question", setId: "set_sample_mat137_2024tt2" as SetId, questionId: "set_sample_mat137_2024tt2.q4" as QuestionId, setTitle: "2024 Term Test 2", number: "4" },
      "2024 Term Test 2, Q4",
      "Practice · same choice of u and dv",
      "similar",
    ),
    link(
      L.mat137Tue,
      at(6, 40),
      { kind: "page", materialId: "mat_sample_mat137_l09_slides" as MaterialId, doc: { kind: "slides", title: "Lecture 9 slides", lectureNumber: 9 }, page: 4, to: 9 },
      "Deriving the formula",
      "Lecture 9 slides · 4–9",
      "mention",
    ),
  ];

  return {
    lectures,
    segments: [...segments(L.csc148Lecture8, CSC148_L8, midtermHint), ...tueSegments, ...segments(L.eco101Lecture7, ECO101_L7, ecoHint)],
    links,
    audio: [],
  };
};
