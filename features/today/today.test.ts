import { describe, expect, it } from "vitest";
import { isTimed, type AgendaItem, type BlockMaterials, type EpochMs, type EventId, type Lecture, type StudyBlock, type StudySession, type TimeZone } from "@/lib/domain";
import { blockStatus, schedule } from "@/lib/plan";
import { SAMPLE, sampleRows } from "@/lib/sample";
import { samplePlanInput } from "@/lib/sample/plan-input";
import { zoneOf } from "@/lib/time";
import { briefInput, cardMeta, countWord, lowerFirst, ruleBrief, summaryText, type BriefFacts } from "./brief";
import { timelineRows, trailingText, type RowFacts } from "./rows";
import { todayTasks } from "./tasks";

const ZONE = "America/Toronto" as TimeZone;
const zone = zoneOf(ZONE);
const SEEDED = Date.parse("2026-10-27T10:12:00-04:00") as EpochMs;
const at = (hhmm: string, day = "2026-10-27") => Date.parse(`${day}T${hhmm}:00-04:00`) as EpochMs;

const input = samplePlanInput({ now: SEEDED, zone: ZONE });
const plan = schedule(input);
const rows = sampleRows({ now: SEEDED, zone: ZONE }).rows;
const lectures = new Map(rows.lectures.flatMap((l) => (l.eventId ? [[l.eventId, l] as const] : [])));
/** The seed's completed sessions: every authored block that ended before 10:12. */
const seededSessions = new Map(rows.sessions.map((s) => [s.id, s] as const));

const inDay = (t: number, day: string) => zone.dayOf(t as EpochMs) === day;
const todayBlocks = (day = "2026-10-27") => plan.blocks.filter((b) => inDay(b.start, day));
const review = plan.blocks.find((b) => b.id === SAMPLE.blocks.recursionReview)!;
const wednesdayReview = plan.blocks.find((b) => b.id === "review.evt_sample_csc148_lec_w10d3.1")!;

function agenda(day = "2026-10-27"): AgendaItem[] {
  return [
    ...input.events.filter(isTimed).filter((e) => inDay(e.start, day)).map((event) => ({ kind: "event" as const, event })),
    ...todayBlocks(day).map((block) => ({ kind: "block" as const, block })),
  ].sort((a, b) => (a.kind === "event" ? a.event.start : a.block.start) - (b.kind === "event" ? b.event.start : b.block.start));
}

const paperMaterials: BlockMaterials = {
  materials: [
    { materialId: SAMPLE.materials.csc148L8Slides, label: "Lecture 8 slides", ref: { kind: "page", materialId: SAMPLE.materials.csc148L8Slides, doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 }, page: 1 } },
  ],
  transcript: { lectureId: SAMPLE.lectures.csc148Lecture8, label: "Lecture 8 transcript" },
  practice: { count: 12, setId: SAMPLE.sets.csc148Midterm2024, topic: "Recursion & tree traversal" },
};

function running(block: StudyBlock, startedAt: EpochMs): StudySession {
  return {
    id: block.id,
    anchor: block.anchor,
    planned: { start: block.start, end: block.end },
    courseId: block.courseId,
    topic: block.topic,
    minutes: (block.end - block.start) / 60_000,
    state: { status: "running", startedAt, pausedMs: 0 },
    step: 0,
    stepSince: 0,
    stepsDone: [],
    mode: "quick",
    viewer: { tab: "slides" },
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function completed(block: StudyBlock): StudySession {
  return { ...running(block, block.start), state: { status: "completed", startedAt: block.start, endedAt: block.end, pausedMs: 0 } };
}

function facts(now: EpochMs, opts: { sessions?: StudySession[]; materials?: BlockMaterials | null; day?: string; later?: StudyBlock } = {}): BriefFacts {
  const sessions = new Map([...seededSessions, ...(opts.sessions ?? []).map((s) => [s.id, s] as const)]);
  const tests = new Map(input.events.flatMap((e) => (e.kind === "test" ? [[e.id, e] as const] : [])));
  return {
    zone,
    now,
    blocks: todayBlocks(opts.day),
    status: (b) => blockStatus(b, { now, session: sessions.get(b.id) }),
    agendaCount: agenda(opts.day).length,
    later: opts.later,
    testFor: (b) => {
      const t = b.why.boostedBy && tests.get(b.why.boostedBy.test);
      return t ? { course: t.courseId, label: t.label, day: zone.dayOf(t.start) } : undefined;
    },
    materialsFor: (b) => (b.id === review.id && opts.materials !== null ? (opts.materials ?? paperMaterials) : undefined),
  };
}

describe("ruleBrief", () => {
  it("writes Paper’s brief at 10:12 on Tuesday", () => {
    expect(ruleBrief(facts(SEEDED))).toEqual({
      headline: "Three sessions today. Start with recursion.",
      subline: "Your CSC148 midterm is in 10 days, so Cue moved this morning’s review up. Everything you need is already pulled from yesterday’s lecture.",
    });
  });

  it("says how to get material when the lecture has none", () => {
    expect(ruleBrief(facts(SEEDED, { materials: { materials: [], practice: { count: 0, topic: "Recursion & tree traversal" } } })).subline).toBe(
      "Your CSC148 midterm is in 10 days, so Cue moved this morning’s review up. Add slides or notes for yesterday’s lecture and Cue opens them in the session.",
    );
  });

  it("names a missed session and how to move it", () => {
    expect(ruleBrief(facts(at("11:40")))).toEqual({
      headline: "Two of three sessions left. Next, memory & learning.",
      subline: "This morning’s review was missed. Pick Reschedule in the list to move it.",
    });
  });

  it("resumes a session in progress", () => {
    expect(ruleBrief(facts(at("10:45"), { sessions: [running(review, at("10:31"))] })).headline).toBe("Three sessions today. Resume recursion.");
  });

  it("moves on once a session is done, with the next block’s own reason", () => {
    expect(ruleBrief(facts(at("11:20"), { sessions: [completed(review)] }))).toEqual({
      headline: "Two of three sessions left. Next, memory & learning.",
      subline: "PSY100 meets more than once a week, so Cue added a mid-week review.",
    });
    const [, midweek] = todayBlocks();
    expect(ruleBrief(facts(at("18:00"), { sessions: [completed(review), completed(midweek)] }))).toEqual({
      headline: "One of three sessions left. Next, PS4.",
      subline: "ECO101 Problem Set 4 is due Thursday, so Cue set aside 2h this evening.",
    });
  });

  it("closes a finished day and points at the next session", () => {
    const done = todayBlocks().map(completed);
    expect(ruleBrief(facts(at("22:00"), { sessions: done, later: wednesdayReview }))).toEqual({
      headline: "All three sessions done.",
      subline: "Next up is the Lecture 9 review tomorrow at 11:15am.",
    });
  });

  it("tells an empty day from a day with only lectures", () => {
    const empty: BriefFacts = { ...facts(SEEDED), blocks: [], agendaCount: 0 };
    expect(ruleBrief(empty)).toEqual({
      headline: "Nothing scheduled today.",
      subline: "Add lectures, tests or deadlines to the calendar and Cue plans study time around them.",
    });
    expect(ruleBrief({ ...empty, agendaCount: 1, later: wednesdayReview }).headline).toBe("No study sessions today.");
  });

  it("builds the today.brief input the task’s own schema accepts", () => {
    const f = facts(SEEDED);
    const value = briefInput(f, ruleBrief(f));
    expect(value.nextTest).toEqual({ course: "CSC148", label: "Midterm", daysUntil: 10 });
    expect(value.sessions.map((s) => `${s.when} · ${s.title} · ${s.status}`)).toEqual([
      "10:30–11:15am · Review — Recursion & tree traversal · upcoming",
      "2–2:30pm · Mid-week review — Memory & learning · upcoming",
      "7–9pm · Work block — Problem Set 4 · upcoming",
    ]);
    expect(todayTasks["today.brief"].input.safeParse(value).success).toBe(true);
  });

  it("keeps names and lowercases plain words", () => {
    expect(["Recursion", "Midterm", "By parts", "Term Test 2", "PS4", "Ch. 8", "PSY"].map(lowerFirst)).toEqual(["recursion", "midterm", "by parts", "Term Test 2", "PS4", "Ch. 8", "PSY"]);
    expect([1, 3, 10, 12].map(countWord)).toEqual(["one", "three", "ten", "12"]);
  });
});

describe("summary and card meta", () => {
  it("counts lectures and study blocks but not busy time, and only study blocks as study time", () => {
    const items = agenda();
    expect(items.filter((a) => a.kind === "event" && a.event.kind === "busy")).toHaveLength(1);
    expect(summaryText(items, todayBlocks())).toBe("4 blocks · 3h 15m of study");
    expect(summaryText(items.slice(0, 1), [])).toBe("1 block");
    expect(summaryText([], [])).toBe("0 blocks");
  });

  it("reads Paper’s meta line, and names the day for a later block", () => {
    expect(cardMeta(review, "upcoming", zone, SEEDED)).toBe("Next up · 10:30–11:15am · Review 1 day after lecture");
    expect(cardMeta(review, "now", zone, at("10:40"))).toBe("Now · 10:30–11:15am · Review 1 day after lecture");
    expect(cardMeta(wednesdayReview, "upcoming", zone, at("22:00"))).toBe("Next up · Wed 11:15am–12pm · Review after lecture");
  });
});

function rowFacts(now: EpochMs, opts: { sessions?: StudySession[]; lectures?: ReadonlyMap<EventId, Lecture> } = {}): RowFacts {
  const sessions = new Map([...seededSessions, ...(opts.sessions ?? []).map((s) => [s.id, s] as const)]);
  const status = (b: StudyBlock) => blockStatus(b, { now, session: sessions.get(b.id) });
  return { zone, now, agenda: agenda(), status, lectures: opts.lectures ?? lectures, sessions, next: todayBlocks().find((b) => ["upcoming", "now", "inProgress"].includes(status(b))) };
}

const read = (f: RowFacts) => timelineRows(f).map((r) => [r.time, r.course, r.title, trailingText(r.trailing, f.now)].filter(Boolean).join(" "));

describe("timelineRows", () => {
  it("draws Paper’s four rows and the café shift, with the review current", () => {
    const f = rowFacts(SEEDED);
    expect(read(f)).toEqual([
      "9am MAT137 Lecture — Integration by parts Transcript ready",
      "10:30am CSC148 Review — Recursion & tree traversal After-lecture · 45m",
      "2pm PSY100 Mid-week review — Memory & learning Mid-week · 30m",
      "3pm Café shift Campus café",
      "7pm ECO101 Work block — Problem Set 4 Due Thu · 2h",
    ]);
    const out = timelineRows(f);
    expect(out.map((r) => r.state)).toEqual(["past", "current", "upcoming", "upcoming", "upcoming"]);
    expect(out.map((r) => r.current)).toEqual([false, true, false, false, false]);
    expect(out.map((r) => r.personal)).toEqual([false, false, false, true, false]);
    expect(out.map((r) => r.trailing.kind)).toEqual(["dot", "text", "text", "text", "text"]);
    expect(out.map((r) => r.href)).toEqual([
      "/lectures/lec.evt_sample_mat137_tue",
      "/study/review.evt_sample_csc148_l08.2",
      "/study/midweek.PSY100.2026-W44",
      "/calendar?view=day&date=2026-10-27",
      `/study/work.${SAMPLE.events.eco101Ps4}.1`,
    ]);
  });

  it("marks a block missed after it ends and moves current to the next one", () => {
    const out = timelineRows(rowFacts(at("11:40")));
    expect(trailingText(out[1].trailing, at("11:40"))).toBe("Missed · Reschedule");
    expect(out.map((r) => r.state)).toEqual(["past", "missed", "current", "upcoming", "upcoming"]);
  });

  it("shows done, and the time left with a resume link while a session runs", () => {
    expect(trailingText(timelineRows(rowFacts(at("11:20"), { sessions: [completed(review)] }))[1].trailing, at("11:20"))).toBe("Done · 45m");
    const now = (at("10:43") + 12_000) as EpochMs;
    const live = timelineRows(rowFacts(now, { sessions: [running(review, at("10:30"))] }))[1];
    expect(trailingText(live.trailing, now)).toBe("In progress · 31:48 left");
    expect(live).toMatchObject({ state: "current", current: true, href: "/study/review.evt_sample_csc148_l08.2?start=1" });
  });

  it("follows the lecture through its note taker states", () => {
    const tue = SAMPLE.events.mat137LectureTue;
    const saved = lectures.get(tue)!;
    const trailing = (now: EpochMs, lecture?: Lecture) => {
      const row = timelineRows(rowFacts(now, { lectures: new Map(lecture ? [[tue, lecture]] : []) }))[0];
      return `${row.state}: ${trailingText(row.trailing, now)}`;
    };
    expect(trailing(at("08:30"))).toBe("upcoming: Record notes");
    expect(trailing(at("09:20"))).toBe("upcoming: Now · Record notes");
    expect(trailing(at("10:12"))).toBe("past: Not recorded");
    const recording: Lecture = { ...saved, notes: undefined, state: { status: "recording", engine: "demo", since: at("09:10"), capturedMs: 0, heartbeatAt: at("09:30") } };
    expect(trailing(at("09:30"), recording)).toBe("live: Recording");
    expect(trailing((at("09:30") + 60_000) as EpochMs, recording)).toBe("live: Interrupted");
    expect(trailing(at("10:12"), { ...saved, notes: undefined })).toBe("past: Transcribing…");
    expect(trailing(at("10:12"), saved)).toBe("past: Transcript ready");
  });
});
