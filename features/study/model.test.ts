import { describe, expect, it } from "vitest";
import {
  DEFAULT_POMODORO,
  sessionTransitions,
  type BlockId,
  type CourseId,
  type EpochMs,
  type EventId,
  type LectureId,
  type MaterialId,
  type Passage,
  type StudyBlock,
} from "@/lib/domain";
import {
  ADVANCE_LABEL,
  advanceKind,
  askCopy,
  availableTabs,
  buildPlan,
  defaultViewer,
  doneSteps,
  endSummary,
  finishSession,
  planSummary,
  focusMs,
  showRef,
  stepOverMs,
  stepRows,
  stepSlide,
  tabLabel,
  timerView,
  viewerForStep,
  viewerLabel,
  type PageRef,
  type PlanContext,
  type ViewerState,
} from "./model";
import { normalizeMinutes, type PlanDraft } from "./shape";

const MIN = 60_000;
const T0 = Date.parse("2026-10-27T10:30:00-04:00") as EpochMs;
const at = (m: number, s = 0) => (T0 + m * MIN + s * 1000) as EpochMs;

const deckPage1: PageRef = {
  kind: "page",
  materialId: "mat_sample_csc148_l08_slides" as MaterialId,
  doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 },
  page: 1,
};
const notes52: PageRef = {
  kind: "page",
  materialId: "mat_sample_csc148_notes" as MaterialId,
  doc: { kind: "notes", title: "Course notes" },
  page: 2,
  section: "§5.2",
  label: "p. 63",
};
const L8 = "lec.evt_sample_csc148_l08" as LectureId;
const passages: Passage[] = [
  { id: "S1", label: "Course notes · §5.2", text: "Recursion on trees.", ref: notes52 },
  {
    id: "S2",
    label: "Lecture 8 transcript · 41:05",
    text: "Postorder is the one you want for deleting. Delete the children before the parent, otherwise nothing points to them anymore.",
    ref: { kind: "transcript", lectureId: L8, courseId: "CSC148" as CourseId, lectureNumber: 8, atMs: 2_465_000, toMs: 2_513_000 },
  },
];
const ctx: PlanContext = {
  focusMinutes: 40,
  deck: { ref: deckPage1, count: 32 },
  flagged: [
    {
      id: "F1",
      ref: { kind: "transcript", lectureId: L8, courseId: "CSC148" as CourseId, lectureNumber: 8, atMs: 1_934_000 },
      quote: "…and this is the part people lose marks on.",
      examHint: true,
    },
  ],
  passages,
};

const step = (title: string, kind: PlanDraft["steps"][number]["kind"], minutes: number, more: Partial<PlanDraft["steps"][number]> = {}) => ({
  title,
  kind,
  minutes,
  slides: null,
  source: null,
  check: `${title}?`,
  ...more,
});

const draft: PlanDraft = {
  steps: [
    step("Cold recall", "recall", 5),
    step("Re-read key slides", "reread", 8, { slides: { from: 12, to: 17 }, check: "Why does preorder need the empty-tree check first?" }),
    step("Explain it back", "explain", 10, { source: "S1" }),
    step("Practice questions", "practice", 15),
    step("Flag what's fuzzy", "reflect", 7),
  ],
  moment: "F1",
};

const block: StudyBlock = {
  id: "review.evt_sample_csc148_l08.2" as BlockId,
  anchor: { kind: "review", lecture: "evt_sample_csc148_l08" as EventId, n: 2 },
  start: T0,
  end: at(45),
  courseId: "CSC148" as CourseId,
  topic: { full: "Recursion & tree traversal", short: "Recursion" },
  why: { offsetDays: 1 },
  placement: "authored",
};

describe("plan normalization", () => {
  it("keeps minutes that already add up to the focus minutes", () => {
    expect(normalizeMinutes([5, 8, 10, 12, 5], 40)).toEqual([5, 8, 10, 12, 5]);
  });

  it("rescales Paper's 45-minute split to the 40 focus minutes of a 45-minute block", () => {
    expect(normalizeMinutes([5, 8, 10, 15, 7], 40)).toEqual([5, 7, 9, 13, 6]);
  });

  it("splits evenly when the model gives no usable weights, and never gives a step 0 minutes", () => {
    expect(normalizeMinutes([0, Number.NaN, -3], 10)).toEqual([4, 3, 3]);
    expect(normalizeMinutes([100, 1, 1], 6)).toEqual([4, 1, 1]);
  });

  it("drops trailing steps when there are fewer minutes than steps", () => {
    expect(normalizeMinutes([5, 5, 5], 2)).toEqual([1, 1]);
  });

  it("resolves slide numbers, passage ids and the moment, and makes the steps sum to the focus minutes", () => {
    const plan = buildPlan(draft, ctx);
    expect(plan.steps.map((s) => s.minutes)).toEqual([5, 7, 9, 13, 6]);
    expect(plan.steps.reduce((n, s) => n + s.minutes, 0)).toBe(40);
    expect(plan.steps[1].source).toEqual({ ...deckPage1, page: 12, to: 17 });
    expect(plan.steps[2].source).toEqual(notes52);
    expect(plan.steps[0].source).toBeUndefined();
    expect(plan.moment).toEqual({ ref: ctx.flagged[0].ref, quote: "…and this is the part people lose marks on.", examHint: true });
  });

  it("clamps slide ranges to the deck and drops ids it never sent", () => {
    const plan = buildPlan(
      {
        steps: [step("Re-read the end", "reread", 10, { slides: { from: 40, to: 29 } }), step("Explain it", "explain", 10, { source: "S9" }), step("Reflect", "reflect", 5)],
        moment: "S2",
      },
      ctx,
    );
    expect(plan.steps[0].source).toEqual({ ...deckPage1, page: 29, to: 32 });
    expect(plan.steps[1].source).toBeUndefined();
    expect(plan.moment?.ref).toEqual({ kind: "transcript", lectureId: L8, courseId: "CSC148", lectureNumber: 8, atMs: 2_465_000 });
  });
});

describe("step transitions", () => {
  const plan = buildPlan({ ...draft, steps: draft.steps.map((s, i) => ({ ...s, minutes: [5, 8, 10, 12, 5][i] })) }, ctx);
  const started = sessionTransitions.start(block, T0, { plan, mode: "quick" });

  it("starts on step 1 with the first step current and nothing done", () => {
    expect(stepRows(plan, started).map((r) => [r.state, r.meta])).toEqual([
      ["current", "5 min"],
      ["upcoming", undefined],
      ["upcoming", undefined],
      ["upcoming", undefined],
      ["upcoming", undefined],
    ]);
    expect(timerView(started, T0, DEFAULT_POMODORO).text).toBe("45:00 left");
  });

  it("Next step at 5:00 marks step 1 done and shows step 2's slides and minutes", () => {
    const s = sessionTransitions.nextStep(started, at(5));
    expect(stepRows(plan, s, stepOverMs(s, at(13, 12), DEFAULT_POMODORO))).toEqual([
      { title: "Cold recall", state: "done" },
      { title: "Re-read key slides", state: "current", meta: "Slides 12–17 · 8 min" },
      { title: "Explain it back", state: "upcoming" },
      { title: "Practice questions", state: "upcoming" },
      { title: "Flag what's fuzzy", state: "upcoming" },
    ]);
    const view = timerView(s, at(13, 12), DEFAULT_POMODORO);
    expect([view.text, view.fraction]).toEqual(["31:48 left", 0.29]);
    expect(endSummary(s, at(13, 12))).toBe("3 steps left · 31:48");
  });

  it("reads Over by 1 min once the step runs a full minute past its time", () => {
    const s = sessionTransitions.nextStep(started, at(5));
    expect(stepRows(plan, s, stepOverMs(s, at(13, 59), DEFAULT_POMODORO))[1].meta).toBe("Slides 12–17 · 8 min");
    expect(stepRows(plan, s, stepOverMs(s, at(14), DEFAULT_POMODORO))[1].meta).toBe("Over by 1 min");
    expect(stepRows(plan, s, stepOverMs(s, at(16, 30), DEFAULT_POMODORO))[1].meta).toBe("Over by 3 min");
  });

  it("does not count the Pomodoro break as step time", () => {
    const s = sessionTransitions.nextStep(sessionTransitions.nextStep(sessionTransitions.nextStep(started, at(5)), at(13)), at(23));
    expect(s.step).toBe(3);
    expect(stepOverMs(s, at(35), DEFAULT_POMODORO)).toBe(0);
    expect(stepOverMs(s, at(41), DEFAULT_POMODORO)).toBe(1 * MIN);
    expect(focusMs(at(35) - T0, DEFAULT_POMODORO)).toBe(30 * MIN);
  });

  it("pauses and resumes without losing time, and a second pause is a no-op", () => {
    const s = sessionTransitions.nextStep(started, at(5));
    const paused = sessionTransitions.pause(s, at(13, 12));
    expect(sessionTransitions.pause(paused, at(14))).toBe(paused);
    expect(timerView(paused, at(20), DEFAULT_POMODORO).text).toBe("Paused · 31:48 left");
    const resumed = sessionTransitions.resume(paused, at(20));
    expect(timerView(resumed, at(20), DEFAULT_POMODORO).text).toBe("31:48 left");
  });

  it("shows the break inside the block and then time's up", () => {
    const s = sessionTransitions.nextStep(started, at(5));
    expect(timerView(s, at(26), DEFAULT_POMODORO).text).toBe("Break · 4:00 left");
    expect(timerView(s, at(30), DEFAULT_POMODORO).text).toBe("15:00 left");
    expect(timerView(s, at(45), DEFAULT_POMODORO)).toMatchObject({ text: "Time's up", fraction: 1, over: true });
    expect(endSummary(s, at(45))).toBe("3 steps left · time's up");
  });

  it("jumps back to a done step and completes the session from the last step", () => {
    let s = sessionTransitions.nextStep(started, at(5));
    s = sessionTransitions.gotoStep(s, 0, at(6));
    expect(stepRows(plan, s).map((r) => r.state)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(s.stepsDone).toEqual([0]);
    s = sessionTransitions.gotoStep(s, 4, at(7));
    s = sessionTransitions.nextStep(s, at(8));
    expect(s.state.status).toBe("ended");
    const all = [0, 1, 2, 3].reduce((acc, i) => sessionTransitions.nextStep(sessionTransitions.gotoStep(acc, i, at(9)), at(9)), started);
    expect(sessionTransitions.nextStep(all, at(40)).state.status).toBe("completed");
  });

  it("shows a finished session's steps as done or skipped, with none current", () => {
    const ended = finishSession(sessionTransitions.nextStep(started, at(5)), at(20));
    const rows = stepRows(plan, { step: null, stepsDone: ended.stepsDone });
    expect(rows.map((r) => [r.state, r.meta])).toEqual([
      ["done", undefined],
      ["done", undefined],
      ["skipped", "Skipped"],
      ["skipped", "Skipped"],
      ["skipped", "Skipped"],
    ]);
    expect(planSummary(rows)).toBe("2 of 5 steps done");
    expect(planSummary(stepRows(plan, sessionTransitions.nextStep(started, at(5))))).toBe("Step 2 of 5 · Re-read key slides");
  });

  it("shows every step done for a completed session, even one stored without its steps", () => {
    const seeded = { ...started, state: { status: "completed" as const, startedAt: T0, endedAt: at(45), pausedMs: 0 }, stepsDone: [] };
    const rows = stepRows(plan, { step: null, stepsDone: doneSteps(seeded, plan) });
    expect(rows.map((r) => r.state)).toEqual(["done", "done", "done", "done", "done"]);
    expect(planSummary(rows)).toBe("5 of 5 steps done");
    const ended = finishSession(sessionTransitions.nextStep(started, at(5)), at(20));
    expect(doneSteps(ended, plan)).toEqual([0, 1]);
    expect(doneSteps(null, plan)).toEqual([]);
  });

  it("reads Finish session on the last step and once time is up, and finishing ends the session there", () => {
    const s = sessionTransitions.nextStep(started, at(5));
    expect(ADVANCE_LABEL[advanceKind(s, at(44, 59), DEFAULT_POMODORO)]).toBe("Next step");
    expect(ADVANCE_LABEL[advanceKind(s, at(50), DEFAULT_POMODORO)]).toBe("Finish session");
    const finished = finishSession(s, at(50));
    expect([finished.state.status, finished.step, finished.stepsDone]).toEqual(["ended", 1, [0, 1]]);
    expect(finishSession(finished, at(51))).toBe(finished);
    const last = sessionTransitions.gotoStep(s, 4, at(6));
    expect(advanceKind(last, at(6), DEFAULT_POMODORO)).toBe("finish");
  });
});

describe("chat copy", () => {
  it("asks about Lecture 8 on its review and about the topic on any other block", () => {
    expect(askCopy(block, 8)).toEqual({ label: "Ask about this lecture", placeholder: "Ask anything about Lecture 8…" });
    expect(askCopy(block, null).placeholder).toBe("Ask anything about Recursion & tree traversal…");
    const midweek = { anchor: { kind: "midweek", course: "PSY100", week: "2026-W44" }, topic: { full: "Memory & learning", short: "PSY" } } as const;
    expect(askCopy(midweek as Parameters<typeof askCopy>[0], 3)).toEqual({ label: "Ask about this session", placeholder: "Ask anything about Memory & learning…" });
  });
});

describe("material viewer", () => {
  const v: ViewerState = { tab: "slides", slides: { ...deckPage1, page: 12 }, textbook: notes52 };

  it("moves slides with the arrow keys inside the deck", () => {
    const right2 = stepSlide(stepSlide(v, 1, 32), 1, 32);
    expect(viewerLabel(right2, 32)).toBe("Slide 14 of 32");
    expect(stepSlide({ ...v, slides: { ...deckPage1, page: 32 } }, 1, 32).slides?.page).toBe(32);
  });

  it("opens chips on the matching tab and leaves the other tabs where they were", () => {
    const transcript = showRef(v, passages[1].ref);
    expect(transcript && viewerLabel(transcript, 32)).toBe("Transcript · 41:05");
    const slide17 = showRef(transcript!, { ...deckPage1, page: 17 });
    expect(slide17 && [slide17.tab, viewerLabel(slide17, 32)]).toEqual(["slides", "Slide 17 of 32"]);
    expect(slide17?.transcript?.atMs).toBe(2_465_000);
    expect(showRef(v, { kind: "question", setId: "s" as never, questionId: "q" as never, setTitle: "2024 Midterm", number: "4" })).toBeNull();
  });

  it("names the reading tab by role and the header by document", () => {
    const reading = { ...v, tab: "textbook" as const };
    expect(tabLabel("textbook", reading)).toBe("Textbook §5.2");
    expect(viewerLabel(reading, 32)).toBe("Course notes §5.2 · p. 63");
  });
});

describe("where the viewer opens", () => {
  const plan = buildPlan(draft, ctx);
  const src = { deck: { ref: deckPage1 }, lecture: { ref: { ...ctx.flagged[0].ref, atMs: 0 } }, reading: null, handout: null };

  it("opens on the next step's slides, the plan's reading and the moment's time", () => {
    const v = defaultViewer(src, plan, 0);
    expect([v.tab, viewerLabel(v, 32), tabLabel("textbook", v)]).toEqual(["slides", "Slide 12 of 32", "Textbook §5.2"]);
    expect(viewerLabel({ ...v, tab: "transcript" }, 32)).toBe("Transcript · 32:14");
    expect(availableTabs(v)).toEqual(["slides", "transcript", "textbook"]);
  });

  it("restores a started session's place and honours ?tab=", () => {
    const saved = { tab: "slides" as const, ref: { ...deckPage1, page: 14 } };
    expect(viewerLabel(defaultViewer(src, plan, 1, { saved }), 32)).toBe("Slide 14 of 32");
    expect(defaultViewer(src, plan, 1, { tab: "transcript" }).tab).toBe("transcript");
    expect(defaultViewer(src, plan, 1, { tab: "handout" }).tab).toBe("slides");
  });

  it("moves to a step's material on Next step and stays put for a step with none", () => {
    const v = defaultViewer(src, plan, 0);
    const moved = stepSlide(v, 2, 32);
    expect(viewerForStep(moved, plan.steps[3])).toBe(moved);
    expect(viewerForStep(moved, plan.steps[2]).tab).toBe("textbook");
  });
});
