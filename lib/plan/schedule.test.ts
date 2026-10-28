import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_PREFS,
  deadlineEvent,
  isTimed,
  type CalendarEvent,
  type CourseId,
  type EffortSize,
  type EpochMs,
  type EventId,
  type ImportId,
  type LocalDate,
  type PlanInput,
  type PlanOverride,
  type TestWeight,
  type TimeZone,
} from "@/lib/domain";
import { samplePlanInput } from "@/lib/sample/plan-input";
import { addDays, zoneOf } from "@/lib/time";
import { findSlot, planWindow, schedule } from "./schedule";

const ZONE = "America/Toronto" as TimeZone;
const zone = zoneOf(ZONE);
const MIN = 60_000;

/** Mulberry32: a tiny seeded generator so the 200 calendars are the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCalendar(seed: number): PlanInput {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const monday = "2026-10-05" as LocalDate;
  const imp = "imp_rand" as ImportId;
  const events: CalendarEvent[] = [];
  const courses = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => `RND${100 + i}` as CourseId);
  for (const course of courses) {
    const days = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => Math.floor(r() * 5)))];
    const hour = 8 + Math.floor(r() * 11);
    for (let week = 0; week < 6; week++) {
      for (const d of days) {
        const day = addDays(monday, week * 7 + d);
        const start = zone.at(day, `${String(hour).padStart(2, "0")}:00` as never);
        events.push({ id: `evt_${course}_${week}_${d}` as EventId, kind: "lecture", courseId: course, start, end: (start + pick([50, 60, 90]) * MIN) as EpochMs, importId: imp });
      }
    }
    for (let i = 0; i < 2; i++) {
      const day = addDays(monday, 7 + Math.floor(r() * 30));
      const start = zone.at(day, pick(["09:00", "14:00", "18:00"]) as never);
      events.push({
        id: `evt_${course}_test${i}` as EventId,
        kind: "test",
        courseId: course,
        start,
        end: (start + 110 * MIN) as EpochMs,
        importId: imp,
        label: `Test ${i + 1}`,
        short: `T${i + 1}`,
        weight: pick<TestWeight>(["quiz", "test", "midterm", "exam"]),
      });
      const due = zone.at(addDays(monday, 3 + Math.floor(r() * 35)), pick(["12:00", "17:00", "23:59"]) as never);
      events.push(
        deadlineEvent({ id: `evt_${course}_due${i}` as EventId, start: due, importId: imp, courseId: course, label: `Problem Set ${i}`, short: `PS${i}`, effort: pick<EffortSize>(["small", "medium", "large"]) }),
      );
    }
  }
  for (let i = 0; i < 10; i++) {
    const start = zone.at(addDays(monday, Math.floor(r() * 42)), `${String(8 + Math.floor(r() * 12)).padStart(2, "0")}:30` as never);
    events.push({ id: `evt_busy_${i}` as EventId, kind: "busy", title: "Shift", start, end: (start + pick([60, 120, 240]) * MIN) as EpochMs, importId: imp });
  }
  const imports = [{ id: imp, planFrom: zone.at(addDays(monday, Math.floor(r() * 14)), "00:00" as never) }];
  return {
    zone: ZONE,
    window: planWindow(zone, { imports, events, overrides: [], sessions: [] }),
    courses: [],
    events,
    imports,
    topics: new Map(),
    overrides: [],
    sessions: [],
    prefs: DEFAULT_PLAN_PREFS,
  };
}

const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const r = rng(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

describe("scheduler invariants on 200 random calendars", () => {
  it("never breaks a placement rule", () => {
    const p = DEFAULT_PLAN_PREFS;
    for (let seed = 1; seed <= 200; seed++) {
      const input = randomCalendar(seed);
      const { blocks } = schedule(input);
      const byId = new Map(input.events.map((e) => [e.id, e]));
      const busy = input.events.filter(isTimed).map((e) => ({ start: e.start - p.bufferMin * MIN, end: e.end + p.bufferMin * MIN }));
      const planFrom = input.imports[0].planFrom;
      const perDay = new Map<string, number>();
      const broken: string[] = [];
      const check = (ok: boolean, what: string) => ok || broken.push(what);
      blocks.forEach((b, i) => {
        const where = `seed ${seed} ${b.id}`;
        check(!busy.some((x) => x.start < b.end && b.start < x.end), `${where} overlaps busy time`);
        for (const o of blocks.slice(i + 1)) check(!(o.start < b.end && b.start < o.end), `${where} overlaps ${o.id}`);
        const day = zone.dayOf(b.start);
        check(b.start >= zone.at(day, p.dayStart) && b.end <= zone.at(day, p.dayEnd), `${where} outside the day window`);
        check(b.start >= planFrom, `${where} before planFrom`);
        if (b.anchor.kind === "review") check(b.start >= byId.get(b.anchor.lecture)!.end, `${where} before its lecture`);
        if (b.anchor.kind === "testPrep") check(b.end <= byId.get(b.anchor.test)!.start, `${where} after its test`);
        if (b.anchor.kind === "work") check(b.end <= byId.get(b.anchor.deadline)!.start, `${where} after its deadline`);
        perDay.set(day, (perDay.get(day) ?? 0) + (b.end - b.start) / MIN);
      });
      for (const [day, minutes] of perDay) check(minutes <= p.maxStudyMinPerDay, `seed ${seed} ${day} over the daily cap`);
      expect(broken).toEqual([]);
    }
  });

  it("is deterministic for shuffled inputs and repeated runs", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const input = randomCalendar(seed);
      const a = schedule(input);
      expect(schedule(input)).toEqual(a);
      expect(schedule({ ...input, events: shuffle(input.events, seed) })).toEqual(a);
    }
    const sample = samplePlanInput({ now: Date.parse("2026-10-27T14:12:00Z"), zone: ZONE });
    expect(schedule({ ...sample, events: shuffle(sample.events, 7), overrides: shuffle(sample.overrides, 9) })).toEqual(schedule(sample));
  });

  it("keeps block ids when an unrelated event is added", () => {
    const input = randomCalendar(42);
    const idsOf = (i: PlanInput) => {
      const out = schedule(i);
      return [...out.blocks.map((b) => b.id), ...out.unplaced.map((u) => u.blockId)].sort();
    };
    const start = zone.at("2026-10-17" as LocalDate, "08:00" as never);
    const extra: CalendarEvent = { id: "evt_extra" as EventId, kind: "busy", title: "Dentist", start, end: (start + 60 * MIN) as EpochMs, importId: "imp_rand" as ImportId };
    expect(idsOf({ ...input, events: [...input.events, extra] })).toEqual(idsOf(input));
  });
});

describe("history, pins and imports", () => {
  const base = randomCalendar(3);
  const first = schedule(base).blocks.find((b) => b.anchor.kind === "review")!;
  const clashing = (at: { start: EpochMs; end: EpochMs }, id = "evt_new"): CalendarEvent => ({
    id: id as EventId,
    kind: "lecture",
    courseId: "NEW100" as CourseId,
    start: at.start,
    end: at.end,
    importId: "imp_new" as ImportId,
  });

  it("never moves a block that has a session", () => {
    const session = { id: first.id, anchor: first.anchor, planned: { start: first.start, end: first.end }, topic: first.topic, courseId: first.courseId };
    const input = { ...base, sessions: [session], events: [...base.events, clashing(first)] };
    expect(schedule(input).blocks.find((b) => b.id === first.id)).toMatchObject({ start: first.start, end: first.end, placement: "locked" });
  });

  it("keeps a done block where it was, even under a new event", () => {
    const done: PlanOverride = { blockId: first.id, placement: { kind: "pinned", at: { start: first.start, end: first.end } }, status: "done", updatedAt: 0 as EpochMs };
    const input = { ...base, overrides: [done], events: [...base.events, clashing(first)] };
    expect(schedule(input).blocks.find((b) => b.id === first.id)).toMatchObject({ start: first.start, placement: "locked" });
  });

  it("keeps a pinned block through an unrelated change and re-places it under a new lecture", () => {
    const slot = findSlot(base, (first.end - first.start) / MIN, { after: (first.start + 2 * 24 * 60 * MIN) as EpochMs })!;
    expect(slot).not.toBeNull();
    const pin: PlanOverride = { blockId: first.id, placement: { kind: "pinned", at: slot }, updatedAt: 0 as EpochMs };
    const unrelated = clashing({ start: (slot.start + 6 * 60 * MIN) as EpochMs, end: (slot.start + 7 * 60 * MIN) as EpochMs }, "evt_far");
    expect(schedule({ ...base, overrides: [pin], events: [...base.events, unrelated] }).blocks.find((b) => b.id === first.id)).toMatchObject({ start: slot.start, placement: "pinned" });
    const out = schedule({ ...base, overrides: [pin], events: [...base.events, clashing(slot)] });
    expect(out.conflicts).toEqual([{ blockId: first.id, at: slot, clashesWith: "evt_new" }]);
    const moved = out.blocks.find((b) => b.id === first.id);
    const replaced = moved ? `${moved.placement} ${moved.start !== slot.start}` : out.unplaced.some((u) => u.blockId === first.id) ? "unplaced" : "gone";
    expect(["rule true", "unplaced"]).toContain(replaced);
  });

  it("keeps an authored block’s text when its time changes", () => {
    const sample = samplePlanInput({ now: Date.parse("2026-10-27T14:12:00Z"), zone: ZONE });
    const prep = sample.overrides.find((o) => o.placement?.kind === "authored" && o.placement.block.note)!;
    if (prep.placement?.kind !== "authored") throw new Error("expected an authored override");
    const sat = zone.at("2026-10-31" as LocalDate, "14:00" as never);
    const moved: PlanOverride = { ...prep, placement: { kind: "authored", block: { ...prep.placement.block, at: { start: sat, end: (sat + 120 * MIN) as EpochMs } } } };
    const block = schedule({ ...sample, overrides: sample.overrides.map((o) => (o.blockId === prep.blockId ? moved : o)) }).blocks.find((b) => b.id === prep.blockId);
    expect(block).toMatchObject({ start: sat, topic: { full: "Midterm", short: "Midterm" }, note: "Past paper, timed", placement: "authored" });
  });

  it("removes exactly an import’s blocks on Undo", () => {
    const imp = "imp_new" as ImportId;
    const newCourse = Array.from({ length: 4 }, (_, i): CalendarEvent => {
      const start = zone.at(addDays("2026-10-19" as LocalDate, i * 7 + 1), "16:00" as never);
      return { id: `evt_ast_${i}` as EventId, kind: "lecture", courseId: "AST101" as CourseId, start, end: (start + 60 * MIN) as EpochMs, importId: imp };
    });
    const withImport = { ...base, events: [...base.events, ...newCourse], imports: [...base.imports, { id: imp, planFrom: zone.at("2026-10-19" as LocalDate, "00:00" as never) }] };
    const before = schedule(withImport);
    const fromImport = new Set(before.blocks.filter((b) => b.courseId === "AST101").map((b) => b.id));
    expect(fromImport.size).toBeGreaterThan(0);
    const after = schedule(base);
    const allIds = (o: ReturnType<typeof schedule>) => new Set([...o.blocks.map((b) => b.id), ...o.unplaced.map((u) => u.blockId)]);
    expect([...allIds(after)].sort()).toEqual([...allIds(before)].filter((id) => !fromImport.has(id)).sort());
  });
});

describe("findSlot", () => {
  it("returns the first free interval after a time, inside the day window", () => {
    const input = samplePlanInput({ now: Date.parse("2026-10-27T14:12:00Z"), zone: ZONE });
    const after = zone.at("2026-10-27" as LocalDate, "11:40" as never);
    const slot = findSlot(input, 45, { after })!;
    expect(slot).toEqual({ start: zone.at("2026-10-27" as LocalDate, "11:45" as never), end: zone.at("2026-10-27" as LocalDate, "12:30" as never) });
  });
});
