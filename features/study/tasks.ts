import "server-only";
import { z } from "zod";
import type { MaterialId, LectureId, CourseId, StepKind } from "@/lib/domain";
import { defineTasks, jsonTask } from "@/lib/ai/define";
import { passagesBlock, passagesSchema, STYLE } from "@/lib/ai/passages";
import { normalizeMinutes, type PlanDraft, type StudyPlanInput } from "./shape";

const STEP_KINDS = ["recall", "reread", "explain", "practice", "reflect"] as const satisfies readonly StepKind[];

const planInput: z.ZodType<StudyPlanInput> = z.object({
  block: z.object({
    kind: z.enum(["review", "midweek", "endOfWeek", "testPrep", "work", "custom"]),
    course: z.string().max(40).nullable(),
    topic: z.string().trim().min(1).max(200),
    reason: z.string().max(200),
    note: z.string().max(200).nullable(),
    minutes: z.number().int().min(5).max(480),
    focusMinutes: z.number().int().min(3).max(480),
  }),
  deck: z.object({ title: z.string().max(200), headings: z.array(z.string().max(200)).min(1).max(150) }).nullable(),
  flagged: z.array(z.object({ id: z.custom<`F${number}`>((v) => typeof v === "string" && /^F\d+$/.test(v)), at: z.string().max(10), quote: z.string().max(600) })).max(12),
  passages: passagesSchema,
  practiceCount: z.number().int().min(0).max(10_000),
});

const planOutput: z.ZodType<PlanDraft> = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(60),
        kind: z.enum(STEP_KINDS),
        minutes: z.number().int().min(1).max(240),
        slides: z.object({ from: z.number().int().min(1), to: z.number().int().min(1) }).nullable(),
        source: z.string().regex(/^S\d+$/).nullable(),
        check: z.string().trim().min(1).max(200),
      }),
    )
    .min(3)
    .max(6),
  moment: z.string().regex(/^[FS]\d+$/).nullable(),
});

const SYSTEM = [
  "You are Cue, planning one focused study session for a university student. The student follows your steps in order with a timer running.",
  "Plan the focus time only. Pomodoro breaks are added separately, so never plan a break step.",
  "Write 4 or 5 steps. Start with a short recall step (the student answers from memory before looking) and end with a short reflect step (the student notes what is still fuzzy).",
  "Step kinds: recall (answer from memory), reread (re-read the key slides or pages), explain (explain the idea back in your own words), practice (answer practice questions), reflect (note what is still unclear).",
  "title: sentence case, starts with a verb, at most 4 words, for example \"Re-read key slides\". No numbering.",
  "minutes: whole minutes. All steps together add up to exactly the focus minutes you are given. Give the reread and practice steps the most time.",
  "slides: on a reread step, the contiguous range of slide numbers from the deck outline that teaches the topic, at most 8 slides, for example {\"from\":12,\"to\":17}. null on every other step, and null when there is no deck.",
  "source: the id of the passage the step works from, like \"S2\", or null. Use only ids you were given.",
  "check: one self-test question for the step, at most 90 characters, that the student can answer from the material once the step is done. Ask about the idea most likely to be tested.",
  "moment: the id of the flagged line most worth hearing again for this topic, like \"F1\". Prefer exam hints. With no flagged lines, use the id of a transcript passage. null when there is no transcript.",
  "Reply with JSON only, in this shape:",
  '{"steps":[{"title":string,"kind":"recall"|"reread"|"explain"|"practice"|"reflect","minutes":integer,"slides":{"from":integer,"to":integer}|null,"source":"S1"|null,"check":string}],"moment":"F1"|"S1"|null}',
  STYLE,
].join("\n");

function user(input: StudyPlanInput): string {
  const { block, deck, flagged, passages, practiceCount } = input;
  const title = [block.course, block.topic].filter(Boolean).join(" · ");
  return [
    `Session: ${title}. ${block.reason}.${block.note ? ` Note: ${block.note}.` : ""}`,
    `Length: ${block.minutes} minutes, of which ${block.focusMinutes} are focus time. The steps must add up to ${block.focusMinutes} minutes.`,
    `Practice questions on this topic: ${practiceCount}.`,
    "",
    deck ? `Deck outline (${deck.title}):\n${deck.headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : "Deck outline: none.",
    "",
    flagged.length ? `Flagged lines from the lecture:\n${flagged.map((f) => `[${f.id}] ${f.at} "${f.quote}"`).join("\n")}` : "Flagged lines: none.",
    "",
    "Passages:",
    passagesBlock(passages),
  ].join("\n");
}

/** Sample-specific checks, so the mock reproduces the Paper session; other topics get generic ones. */
const SAMPLE_CHECKS: Record<string, Record<StepKind, string>> = {
  "recursion & tree traversal": {
    recall: "Without looking: what are the three traversal orders?",
    reread: "Why does preorder need the empty-tree check first?",
    explain: "Why isn't postorder just preorder backwards?",
    practice: "Which traversal would you use to delete a tree, and why?",
    reflect: "Which part of the recursion still feels shaky?",
  },
};

function genericChecks(topic: string): Record<StepKind, string> {
  return {
    recall: `Without looking: what are the key ideas of ${topic}?`,
    reread: `What is the one definition in ${topic} you must know?`,
    explain: `How would you explain ${topic} to a classmate?`,
    practice: `Which question type on ${topic} did you get wrong?`,
    reflect: `What about ${topic} is still unclear?`,
  };
}

const wordsOf = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && w !== "and"));

/** The span of slides whose headings use the topic's last word, skipping the title slide. */
function mockSlides(deck: StudyPlanInput["deck"], topic: string): { from: number; to: number } | null {
  if (!deck) return null;
  const key = [...wordsOf(topic)].pop();
  const hits = deck.headings.flatMap((h, i) => (i > 0 && key && wordsOf(h).has(key) ? [i + 1] : []));
  if (hits.length === 0) return { from: Math.min(2, deck.headings.length), to: Math.min(deck.headings.length, 7) };
  const from = hits[0];
  return { from, to: Math.min(hits[hits.length - 1], from + 7) };
}

/** The reading that covers the most topic words; the earlier one on a tie. */
function mockReading(passages: StudyPlanInput["passages"], topic: string): string | null {
  const topicWords = wordsOf(topic);
  const scored = passages.flatMap((p, i) => {
    if (p.ref.kind !== "page" || !["textbook", "notes", "handout"].includes(p.ref.doc.kind)) return [];
    const words = wordsOf(p.text);
    const score = [...topicWords].filter((w) => words.has(w)).length;
    return score > 0 ? [{ id: p.id, score, page: p.ref.page, i }] : [];
  });
  scored.sort((a, b) => b.score - a.score || a.page - b.page || a.i - b.i);
  return scored[0]?.id ?? null;
}

function mockPlan(input: StudyPlanInput): PlanDraft {
  const { topic } = input.block;
  const checks = SAMPLE_CHECKS[topic.toLowerCase()] ?? genericChecks(topic);
  const slides = mockSlides(input.deck, topic);
  const reading = mockReading(input.passages, topic);
  const drafts: (PlanDraft["steps"][number] | null)[] = [
    { title: "Cold recall", kind: "recall", minutes: 5, slides: null, source: null, check: checks.recall },
    slides
      ? { title: "Re-read key slides", kind: "reread", minutes: 8, slides, source: null, check: checks.reread }
      : reading
        ? { title: "Re-read key pages", kind: "reread", minutes: 8, slides: null, source: reading, check: checks.reread }
        : null,
    { title: "Explain it back", kind: "explain", minutes: 10, slides: null, source: reading, check: checks.explain },
    { title: "Practice questions", kind: "practice", minutes: 12, slides: null, source: null, check: checks.practice },
    { title: "Flag what's fuzzy", kind: "reflect", minutes: 5, slides: null, source: null, check: checks.reflect },
  ];
  const steps = drafts.filter((s) => s !== null);
  const minutes = normalizeMinutes(
    steps.map((s) => s.minutes),
    input.block.focusMinutes,
  );
  const transcript = input.passages.find((p) => p.ref.kind === "transcript");
  return {
    steps: steps.slice(0, minutes.length).map((s, i) => ({ ...s, minutes: minutes[i] })),
    moment: input.flagged[0]?.id ?? transcript?.id ?? null,
  };
}

const NOTES = "mat_sample_csc148_notes" as MaterialId;
const L8 = "lec.evt_sample_csc148_l08" as LectureId;
const CSC = "CSC148" as CourseId;

export const studyTasks = defineTasks("study", {
  plan: jsonTask({
    profile: "reason",
    maxTokens: 8000,
    input: planInput,
    output: planOutput,
    prompt: (input) => ({ system: SYSTEM, user: user(input) }),
    example: {
      block: {
        kind: "review",
        course: "CSC148",
        topic: "Recursion & tree traversal",
        reason: "Review 1 day after lecture",
        note: null,
        minutes: 45,
        focusMinutes: 40,
      },
      deck: {
        title: "Lecture 8 slides",
        headings: [
          "Lecture 8: Recursion & tree traversal",
          "Where we are",
          "Recap: trees",
          "Tree terminology",
          "The Tree class",
          "is_empty",
          "Recursive structure",
          "Size of a tree",
          "Base case first",
          "Tracing size()",
          "Traversals",
          "Traversal orders",
          "Visiting a node",
          "Preorder traversal",
          "Preorder on our example",
          "Inorder traversal",
          "Postorder traversal",
          "Postorder is not reversed preorder",
          "Level order",
          "Comparing orders",
          "Deleting a subtree",
          "Why postorder for deletion",
        ],
      },
      flagged: [
        {
          id: "F1",
          at: "32:14",
          quote: "…and this is the part people lose marks on. If you forget the empty-tree check, every leaf calls into nothing. I will put a base-case question on the midterm.",
        },
      ],
      passages: [
        {
          id: "S1",
          label: "Course notes · §5.2",
          text: "Recursion on trees.\n\nMost tree methods check whether the tree is empty, then combine results from each subtree.",
          ref: { kind: "page", materialId: NOTES, doc: { kind: "notes", title: "Course notes" }, page: 2, section: "§5.2", label: "p. 63" },
        },
        {
          id: "S2",
          label: "Course notes · §5.3",
          text: "Tree traversals.\n\nA preorder traversal visits the root before its subtrees. A postorder traversal visits the root after all of its subtrees. Postorder is the order to use when deleting a tree.",
          ref: { kind: "page", materialId: NOTES, doc: { kind: "notes", title: "Course notes" }, page: 3, section: "§5.3", label: "p. 66" },
        },
        {
          id: "S3",
          label: "Lecture 8 transcript · 41:05",
          text: "Postorder is the one you want for deleting. Delete the children before the parent, otherwise nothing points to them anymore. So postorder is not preorder backwards. Reversing preorder flips the children too.",
          ref: { kind: "transcript", lectureId: L8, courseId: CSC, lectureNumber: 8, atMs: 2_465_000, toMs: 2_513_000 },
        },
      ],
      practiceCount: 12,
    },
    mock: mockPlan,
  }),
});
