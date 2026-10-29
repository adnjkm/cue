import {
  deadlineEvent,
  ids,
  type AuthoredBlock,
  type BlockAnchor,
  type CalendarEvent,
  type Course,
  type CourseId,
  type EffortSize,
  type EpochMs,
  type EventId,
  type ImportBatch,
  type IsoWeek,
  type PlanOverride,
  type TestWeight,
  type Topic,
} from "@/lib/domain";
import type { SampleContext } from "./context";
import { SAMPLE } from "./ids";

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const { csc148: CSC, mat137: MAT, eco101: ECO, psy100: PSY } = SAMPLE.courses;

export const SAMPLE_COURSES: readonly Course[] = [
  { id: CSC, code: "CSC148", short: "CSC", title: "Introduction to Computer Science", instructor: "Prof. Liu", sources: [SAMPLE.importId] },
  { id: MAT, code: "MAT137", short: "MAT", title: "Calculus with Proofs", instructor: "Prof. Chen", sources: [SAMPLE.importId] },
  { id: ECO, code: "ECO101", short: "ECO", title: "Principles of Microeconomics", instructor: "Prof. Okafor", sources: [SAMPLE.importId] },
  { id: PSY, code: "PSY100", short: "PSY", title: "Introductory Psychology", instructor: "Prof. Abara", sources: [SAMPLE.importId] },
];

/** Week offsets from the Paper week (Mon 26 Oct 2026 = 0). The term runs Sep 28 (-4) to Dec 4 (+5). */
const FIRST_WEEK = -4;
const LAST_WEEK = 5;

const MEETINGS: readonly { course: CourseId; days: readonly Weekday[]; start: string; end: string; room: string }[] = [
  { course: CSC, days: [1, 3, 5], start: "10:00", end: "11:00", room: "BA 1160" },
  { course: MAT, days: [2, 4], start: "09:00", end: "10:00", room: "MP 102" },
  { course: ECO, days: [3], start: "13:00", end: "14:00", room: "SS 2102" },
  { course: PSY, days: [1, 5], start: "14:00", end: "15:00", room: "MS 2158" },
];

/** Lecture numbers line up with the Paper strings: CSC148 Lecture 8 on Mon 26 Oct, ECO101 Lecture 7 on Wed 21 Oct. */
const NUMBER_AT: Record<string, { week: number; day: Weekday; n: number }> = {
  [CSC]: { week: 0, day: 1, n: 8 },
  [MAT]: { week: 0, day: 2, n: 15 },
  [ECO]: { week: -1, day: 3, n: 7 },
  [PSY]: { week: 0, day: 1, n: 15 },
};

const NAMED: Record<string, EventId> = {
  [`${CSC}:0:1`]: SAMPLE.events.csc148Lecture8,
  [`${MAT}:0:2`]: SAMPLE.events.mat137LectureTue,
  [`${MAT}:0:4`]: SAMPLE.events.mat137LectureThu,
  [`${ECO}:-1:3`]: SAMPLE.events.eco101Lecture7,
};

const TOPICS: Record<string, Topic> = {
  [`${CSC}:0:1`]: { full: "Recursion & tree traversal", short: "Recursion" },
  [`${MAT}:0:2`]: { full: "Integration by parts", short: "By parts" },
  [`${MAT}:0:4`]: { full: "Integration by parts, continued", short: "By parts" },
  [`${ECO}:-1:3`]: { full: "Price elasticity of demand", short: "Elasticity" },
  [`${ECO}:0:3`]: { full: "Elasticity and total revenue", short: "Elasticity" },
  [`${PSY}:0:1`]: { full: "Memory & learning", short: "Memory" },
  [`${PSY}:0:5`]: { full: "Thinking & language", short: "Ch. 8" },
};

/** Thanksgiving Monday has no classes. */
const NO_CLASS = new Set(["-2:1"]);

function eventId(course: CourseId, kind: string, week: number, day: Weekday): EventId {
  return `evt_sample_${course.toLowerCase()}_${kind}_w${week + 10}d${day}` as EventId;
}

function lectureId(course: CourseId, week: number, day: Weekday): EventId {
  return NAMED[`${course}:${week}:${day}`] ?? eventId(course, "lec", week, day);
}

function lectures(ctx: SampleContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const m of MEETINGS) {
    const slots: { week: number; day: Weekday }[] = [];
    for (let week = FIRST_WEEK; week <= LAST_WEEK; week++) for (const day of m.days) if (!NO_CLASS.has(`${week}:${day}`)) slots.push({ week, day });
    const anchor = NUMBER_AT[m.course];
    const anchorIndex = slots.findIndex((s) => s.week === anchor.week && s.day === anchor.day);
    slots.forEach((s, i) => {
      const n = anchor.n + i - anchorIndex;
      const key = `${m.course}:${s.week}:${s.day}`;
      out.push({
        id: lectureId(m.course, s.week, s.day),
        kind: "lecture",
        courseId: m.course,
        start: ctx.at(s.day, m.start, s.week),
        end: ctx.at(s.day, m.end, s.week),
        importId: SAMPLE.importId,
        seriesId: `sample_${m.course}_lecture`,
        location: m.room,
        ...(n >= 1 ? { number: n } : {}),
        ...(TOPICS[key] ? { topic: TOPICS[key] } : {}),
      });
    });
  }
  return out;
}

const DEADLINES: readonly { id?: EventId; course: CourseId; week: number; day: Weekday; time: string; label: string; short: string; effort: EffortSize }[] = [
  { course: PSY, week: -4, day: 5, time: "12:00", label: "Quiz 1", short: "quiz 1", effort: "small" },
  { course: CSC, week: -3, day: 3, time: "23:59", label: "Assignment 1", short: "A1", effort: "large" },
  { course: MAT, week: -3, day: 5, time: "17:00", label: "Problem Set 3", short: "PS3", effort: "medium" },
  { course: ECO, week: -2, day: 4, time: "17:00", label: "Problem Set 3", short: "PS3", effort: "medium" },
  { course: PSY, week: -1, day: 5, time: "12:00", label: "Quiz 2", short: "quiz 2", effort: "small" },
  { id: SAMPLE.events.csc148A2, course: CSC, week: 0, day: 3, time: "23:59", label: "Assignment 2", short: "A2", effort: "large" },
  { id: SAMPLE.events.eco101Ps4, course: ECO, week: 0, day: 4, time: "17:00", label: "Problem Set 4", short: "PS4", effort: "medium" },
  { course: PSY, week: 0, day: 5, time: "12:00", label: "Quiz 3", short: "quiz", effort: "small" },
  { course: MAT, week: 1, day: 4, time: "17:00", label: "Problem Set 5", short: "PS5", effort: "medium" },
  { course: ECO, week: 2, day: 4, time: "17:00", label: "Problem Set 5", short: "PS5", effort: "medium" },
  { course: CSC, week: 3, day: 3, time: "23:59", label: "Assignment 3", short: "A3", effort: "large" },
  { course: PSY, week: 3, day: 5, time: "12:00", label: "Quiz 4", short: "quiz 4", effort: "small" },
  { course: MAT, week: 5, day: 5, time: "17:00", label: "Problem Set 6", short: "PS6", effort: "medium" },
];

const TESTS: readonly { id: EventId; course: CourseId; week: number; day: Weekday; label: string; short: string; weight: TestWeight; room: string }[] = [
  { id: "evt_sample_mat137_tt1" as EventId, course: MAT, week: -1, day: 3, label: "Term Test 1", short: "Test 1", weight: "test", room: "EX 100" },
  { id: SAMPLE.events.csc148Midterm, course: CSC, week: 1, day: 5, label: "Midterm", short: "Midterm", weight: "midterm", room: "EX 200" },
  { id: "evt_sample_eco101_midterm" as EventId, course: ECO, week: 2, day: 3, label: "Midterm", short: "Midterm", weight: "midterm", room: "EX 300" },
  { id: SAMPLE.events.mat137TermTest2, course: MAT, week: 2, day: 5, label: "Term Test 2", short: "Test 2", weight: "test", room: "EX 100" },
];

/**
 * The student's own life, as a Google Calendar import would bring it in: busy time the plan works around.
 * The times miss every authored block, so weeks up to the Paper week stay as drawn and later weeks plan around them.
 */
const PERSONAL: readonly { slug: string; title: string; days: readonly Weekday[]; start: string; end: string; location?: string }[] = [
  { slug: "climbing", title: "Climbing with Priya", days: [1], start: "19:00", end: "20:30" },
  { slug: "shift_tue", title: "Café shift", days: [2], start: "15:00", end: "18:30", location: "Campus café" },
  { slug: "shift_thu", title: "Café shift", days: [4], start: "12:00", end: "15:30", location: "Campus café" },
  { slug: "dinner", title: "Family dinner", days: [7], start: "18:00", end: "20:00" },
];

function personal(ctx: SampleContext): CalendarEvent[] {
  return PERSONAL.flatMap((p) =>
    Array.from({ length: LAST_WEEK - FIRST_WEEK + 1 }, (_, i) => FIRST_WEEK + i).flatMap((week) =>
      p.days.map((day): CalendarEvent => ({
        id: `evt_sample_busy_${p.slug}_w${week + 10}d${day}` as EventId,
        kind: "busy",
        title: p.title,
        start: ctx.at(day, p.start, week),
        end: ctx.at(day, p.end, week),
        importId: SAMPLE.importId,
        seriesId: `sample_busy_${p.slug}`,
        ...(p.location ? { location: p.location } : {}),
      })),
    ),
  );
}

export function sampleEvents(ctx: SampleContext): CalendarEvent[] {
  const deadlines = DEADLINES.map((d) =>
    deadlineEvent({
      id: d.id ?? eventId(d.course, `due_${d.short.replace(/\W/g, "").toLowerCase()}`, d.week, d.day),
      start: ctx.at(d.day, d.time, d.week),
      importId: SAMPLE.importId,
      courseId: d.course,
      label: d.label,
      short: d.short,
      effort: d.effort,
    }),
  );
  const tests: CalendarEvent[] = TESTS.map((t) => ({
    id: t.id,
    kind: "test",
    courseId: t.course,
    start: ctx.at(t.day, "18:00", t.week),
    end: ctx.at(t.day, "19:50", t.week),
    importId: SAMPLE.importId,
    label: t.label,
    short: t.short,
    weight: t.weight,
    location: t.room,
  }));
  const thanksgiving: CalendarEvent = {
    id: "evt_sample_note_thanksgiving" as EventId,
    kind: "note",
    start: ctx.at(1, "00:00", -2),
    end: ctx.at(2, "00:00", -2),
    importId: SAMPLE.importId,
    text: "Thanksgiving · no class",
  };
  return [...lectures(ctx), ...deadlines, ...tests, thanksgiving, ...personal(ctx)];
}

export function sampleImport(ctx: SampleContext): ImportBatch {
  return {
    id: SAMPLE.importId,
    at: ctx.now,
    planFrom: ctx.at(1, "00:00", 1),
    source: { kind: "sample" },
    courses: SAMPLE_COURSES.map((c) => c.id),
  };
}

const lec = lectureId;
const review = (course: CourseId, week: number, day: Weekday, n: 1 | 2 = 1): BlockAnchor => ({ kind: "review", lecture: lec(course, week, day), n });
const midweek = (course: CourseId, week: string): BlockAnchor => ({ kind: "midweek", course, week: week as IsoWeek });
const eow = (week: string): BlockAnchor => ({ kind: "endOfWeek", week: week as IsoWeek });
const prep = (test: EventId, index: number, of: number): BlockAnchor => ({ kind: "testPrep", test, index, of });
const work = (deadline: EventId, index: number, of: number): BlockAnchor => ({ kind: "work", deadline, index, of });
const t = (full: string, short: string): Topic => ({ full, short });

const EOW = t("End-of-week review", "End of week");
const TT1 = "evt_sample_mat137_tt1" as EventId;

/** Every study block Paper draws from Sep 28 to Nov 1, as authored overrides with the anchor the rules would give it. */
const AUTHORED: readonly { week: number; day: Weekday; start: string; end: string; anchor: BlockAnchor; topic: Topic; note?: string }[] = [
  { week: -4, day: 4, start: "11:15", end: "11:45", anchor: review(CSC, -4, 3), topic: t("Linked lists", "Lists") },
  { week: -4, day: 5, start: "15:15", end: "15:45", anchor: review(PSY, -4, 5), topic: t("Chapter 3: Sensation", "Ch. 3") },
  { week: -4, day: 6, start: "11:00", end: "12:30", anchor: eow("2026-W40"), topic: EOW },
  { week: -3, day: 1, start: "11:15", end: "11:45", anchor: review(CSC, -3, 1), topic: t("Lecture 5", "Lec 5") },
  { week: -3, day: 2, start: "10:15", end: "10:45", anchor: review(MAT, -3, 2), topic: t("Limits", "Limits") },
  { week: -3, day: 3, start: "14:15", end: "14:45", anchor: review(ECO, -3, 3), topic: t("Supply", "Supply") },
  { week: -3, day: 4, start: "16:00", end: "16:30", anchor: midweek(CSC, "2026-W41"), topic: t("Stacks and queues", "CSC") },
  { week: -3, day: 5, start: "15:15", end: "15:45", anchor: review(PSY, -3, 5), topic: t("Chapter 4: Consciousness", "Ch. 4") },
  { week: -3, day: 6, start: "11:00", end: "12:30", anchor: eow("2026-W41"), topic: EOW },
  { week: -2, day: 2, start: "10:15", end: "10:45", anchor: review(MAT, -2, 2), topic: t("Lecture 6", "Lec 6") },
  { week: -2, day: 3, start: "14:15", end: "14:45", anchor: review(ECO, -2, 3), topic: t("Demand", "Demand") },
  { week: -2, day: 3, start: "16:00", end: "16:30", anchor: midweek(PSY, "2026-W42"), topic: t("Learning", "PSY") },
  { week: -2, day: 4, start: "10:15", end: "10:45", anchor: review(MAT, -2, 4), topic: t("Chain rule", "Chain rule") },
  { week: -2, day: 5, start: "11:15", end: "11:45", anchor: review(CSC, -2, 5), topic: t("Lecture 7", "Lec 7") },
  { week: -2, day: 6, start: "11:00", end: "12:30", anchor: eow("2026-W42"), topic: EOW },
  { week: -2, day: 7, start: "13:00", end: "14:00", anchor: prep(TT1, 1, 3), topic: t("Term Test 1", "Test 1") },
  { week: -1, day: 1, start: "08:30", end: "09:30", anchor: prep(TT1, 2, 3), topic: t("Term Test 1", "Test 1") },
  { week: -1, day: 1, start: "11:15", end: "11:45", anchor: review(CSC, -1, 1), topic: t("Lecture 8", "Lec 8") },
  { week: -1, day: 2, start: "13:00", end: "14:00", anchor: prep(TT1, 3, 3), topic: t("Term Test 1", "Test 1") },
  { week: -1, day: 3, start: "14:15", end: "14:45", anchor: review(ECO, -1, 3), topic: t("Price elasticity of demand", "Elasticity") },
  { week: -1, day: 4, start: "16:00", end: "16:30", anchor: midweek(CSC, "2026-W43"), topic: t("Recursion", "CSC") },
  { week: -1, day: 5, start: "15:15", end: "15:45", anchor: review(PSY, -1, 5), topic: t("Chapter 7: Memory", "Ch. 7") },
  { week: -1, day: 6, start: "11:00", end: "12:30", anchor: eow("2026-W43"), topic: EOW },
  { week: 0, day: 1, start: "11:15", end: "12:00", anchor: review(CSC, 0, 1, 1), topic: t("Recursion & tree traversal", "Trees") },
  { week: 0, day: 1, start: "15:00", end: "15:30", anchor: review(PSY, 0, 1), topic: t("Memory & learning", "Memory") },
  { week: 0, day: 2, start: "10:30", end: "11:15", anchor: review(CSC, 0, 1, 2), topic: t("Recursion & tree traversal", "Recursion") },
  { week: 0, day: 2, start: "14:00", end: "14:30", anchor: midweek(PSY, "2026-W44"), topic: t("Memory & learning", "PSY") },
  { week: 0, day: 2, start: "19:00", end: "21:00", anchor: work(SAMPLE.events.eco101Ps4, 1, 1), topic: t("Problem Set 4", "PS4") },
  { week: 0, day: 3, start: "11:15", end: "12:00", anchor: review(CSC, 0, 3), topic: t("Lecture 9", "Lec 9") },
  { week: 0, day: 3, start: "14:00", end: "14:30", anchor: review(ECO, 0, 3), topic: t("Elasticity and total revenue", "Elasticity") },
  { week: 0, day: 3, start: "18:00", end: "20:00", anchor: work(SAMPLE.events.csc148A2, 2, 2), topic: t("Assignment 2", "A2") },
  { week: 0, day: 4, start: "10:15", end: "11:00", anchor: review(MAT, 0, 4), topic: t("Integration by parts, continued", "By parts") },
  { week: 0, day: 4, start: "16:00", end: "16:45", anchor: midweek(CSC, "2026-W44"), topic: t("Recursion & tree traversal", "CSC") },
  { week: 0, day: 5, start: "15:00", end: "15:30", anchor: review(PSY, 0, 5), topic: t("Thinking & language", "Ch. 8") },
  { week: 0, day: 6, start: "11:00", end: "12:30", anchor: eow("2026-W44"), topic: EOW },
  { week: 0, day: 7, start: "13:00", end: "14:00", anchor: prep(SAMPLE.events.mat137TermTest2, 1, 4), topic: t("Term Test 2", "Test 2") },
  { week: 0, day: 7, start: "15:00", end: "17:00", anchor: prep(SAMPLE.events.csc148Midterm, 3, 6), topic: t("Midterm", "Midterm"), note: "Past paper, timed" },
];

export function sampleAuthoredBlocks(ctx: SampleContext): AuthoredBlock[] {
  return AUTHORED.map((a) => ({
    anchor: a.anchor,
    at: { start: ctx.at(a.day, a.start, a.week), end: ctx.at(a.day, a.end, a.week) },
    topic: a.topic,
    ...(a.note ? { note: a.note } : {}),
  }));
}

export function sampleOverrides(ctx: SampleContext): PlanOverride[] {
  return sampleAuthoredBlocks(ctx).map((block) => ({
    blockId: ids.block(block.anchor),
    placement: { kind: "authored", block },
    updatedAt: ctx.now as EpochMs,
  }));
}
