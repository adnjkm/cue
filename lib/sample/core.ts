import { DEFAULT_PLAN_PREFS, threadKey, type ChatMessage, type MaterialId, type MessageId, type PrefsRow } from "@/lib/domain";
import type { SampleContext, SampleFragment } from "./context";
import { SAMPLE } from "./ids";
import { SAMPLE_COURSES, sampleEvents, sampleImport, sampleOverrides } from "./calendar";
import { sampleMaterials } from "./materials";

const at = (m: number, s: number) => (m * 60 + s) * 1000;

/** The Paper study session's conversation, so Study opens on the drawn state. The web chip has no source in Cue. */
function studyChat(ctx: SampleContext): ChatMessage[] {
  const thread = threadKey.session(SAMPLE.blocks.recursionReview);
  return [
    {
      id: "msg_sample_study_1" as MessageId,
      thread,
      courseId: SAMPLE.courses.csc148,
      role: "user",
      text: "Is postorder just preorder backwards? For A2 I need to delete subtrees.",
      citations: [],
      mode: "quick",
      at: ctx.at(2, "10:38"),
    },
    {
      id: "msg_sample_study_2" as MessageId,
      thread,
      courseId: SAMPLE.courses.csc148,
      role: "assistant",
      text: "Not quite. Reversing preorder gives root-last, but it also flips the order of the children, so it isn't postorder.\n\nFor deleting, postorder is the right call: you remove the children before the parent, so nothing points into freed nodes. Prof. Liu makes the same point at 41:05.",
      citations: [
        { kind: "page", materialId: SAMPLE.materials.csc148L8Slides, doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 }, page: 17, title: "Postorder traversal" },
        { kind: "transcript", lectureId: SAMPLE.lectures.csc148Lecture8, courseId: SAMPLE.courses.csc148, lectureNumber: 8, atMs: at(41, 5), toMs: at(41, 53) },
        { kind: "page", materialId: SAMPLE.materials.csc148A2Handout as MaterialId, doc: { kind: "handout", title: "A2 handout", short: "A2 handout" }, page: 3, section: "§3" },
      ],
      mode: "quick",
      at: ctx.at(2, "10:39"),
    },
  ];
}

/** Foundation's rows: courses, the calendar and its import, the authored Paper blocks, materials, pages, the study chat, prefs. */
export const coreSample: SampleFragment<"courses" | "events" | "imports" | "overrides" | "materials" | "pages" | "messages" | "prefs"> = (ctx) => {
  const { materials, pages } = sampleMaterials(ctx);
  const prefs: PrefsRow = { owner: "foundation", zone: ctx.zone.id, plan: DEFAULT_PLAN_PREFS, sample: { seededAt: ctx.now, scenario: ctx.scenario } };
  return {
    courses: SAMPLE_COURSES,
    events: sampleEvents(ctx),
    imports: [sampleImport(ctx)],
    overrides: sampleOverrides(ctx),
    materials,
    pages,
    messages: studyChat(ctx),
    prefs: [prefs],
  };
};
