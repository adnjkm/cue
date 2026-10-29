import {
  ids,
  isTimed,
  type BlockAnchor,
  type BlockId,
  type BlockStatus,
  type CalendarEvent,
  type CourseId,
  type EpochMs,
  type EventId,
  type ImportId,
  type Interval,
  type IsoWeek,
  type LocalDate,
  type OverrideConflict,
  type PlanInput,
  type PlanOutput,
  type PlanOverride,
  type StudyBlock,
  type StudySession,
  type Topic,
  type Unplaced,
  type Zone,
} from "@/lib/domain";
import { addDays, daysBetween, isoWeekOfDay, minutesOfDay, mondayOfWeek, wallMinutes, wallTime, zoneOf } from "@/lib/time";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** A block before placement. */
interface Demand {
  id: BlockId;
  anchor: BlockAnchor;
  courseId: CourseId | null;
  topic: Topic;
  note?: string;
  minutes: number;
  allowed: Interval;
  /** Candidate days in preference order, each with the wall-clock minute the search starts from. */
  candidates: readonly { day: LocalDate; from: number }[];
  rank: 1 | 2 | 3 | 4 | 5;
  /** The import whose planFrom clips this demand. */
  planFrom: EpochMs;
}

type Lecture = Extract<CalendarEvent, { kind: "lecture" }>;
type Test = Extract<CalendarEvent, { kind: "test" }>;
type Deadline = Extract<CalendarEvent, { kind: "deadline" }>;

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const byStartThenId = (a: { start: number; id: string }, b: { start: number; id: string }) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function topicFor(input: PlanInput, lecture: Lecture): Topic {
  const known = input.topics.get(lecture.id) ?? lecture.topic;
  if (known) return known;
  return lecture.number === undefined ? { full: "Lecture", short: "Lecture" } : { full: `Lecture ${lecture.number}`, short: `Lec ${lecture.number}` };
}

function courseShort(code: string): string {
  return code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? code;
}

/** Shared state for one schedule() run: the calendar, busy time and what is placed so far, bucketed by local day. */
class Board {
  readonly zone: Zone;
  readonly events = new Map<EventId, CalendarEvent>();
  private readonly busy = new Map<LocalDate, Interval[]>();
  private readonly placed = new Map<LocalDate, Interval[]>();
  private readonly minutes = new Map<LocalDate, number>();
  readonly timed: readonly CalendarEvent[];

  constructor(readonly input: PlanInput) {
    this.zone = zoneOf(input.zone);
    const events = [...input.events].sort(byStartThenId);
    for (const e of events) this.events.set(e.id, e);
    this.timed = events.filter(isTimed);
    const pad = input.prefs.bufferMin * MIN;
    for (const e of this.timed) this.bucket(this.busy, { start: (e.start - pad) as EpochMs, end: (e.end + pad) as EpochMs });
  }

  private bucket(map: Map<LocalDate, Interval[]>, iv: Interval) {
    let day = this.zone.dayOf(iv.start);
    const last = this.zone.dayOf((iv.end - 1) as EpochMs);
    for (;;) {
      const list = map.get(day);
      if (list) list.push(iv);
      else map.set(day, [iv]);
      if (day >= last) break;
      day = addDays(day, 1);
    }
  }

  place(iv: Interval) {
    this.bucket(this.placed, iv);
    const day = this.zone.dayOf(iv.start);
    this.minutes.set(day, (this.minutes.get(day) ?? 0) + (iv.end - iv.start) / MIN);
  }

  /** Raw (unpadded) clash with a fixed timed event, for reporting overrides the calendar moved under. */
  clash(iv: Interval): EventId | null {
    return this.timed.find((e) => overlaps(e, iv))?.id ?? null;
  }

  fit(day: LocalDate, iv: Interval): "ok" | "busy" | "cap" {
    if ((this.busy.get(day) ?? []).some((b) => overlaps(b, iv))) return "busy";
    if ((this.placed.get(day) ?? []).some((b) => overlaps(b, iv))) return "busy";
    if ((this.minutes.get(day) ?? 0) + (iv.end - iv.start) / MIN > this.input.prefs.maxStudyMinPerDay) return "cap";
    return "ok";
  }

  /** Steps by stepMin from `from` forward, then backward, inside the day window and `allowed`. */
  search(day: LocalDate, from: number, minutes: number, allowed: Interval): Interval | "cap" | null {
    const p = this.input.prefs;
    const step = p.stepMin;
    const dayStart = wallMinutes(p.dayStart);
    const dayEnd = wallMinutes(p.dayEnd);
    const dayEndAt = this.dayAt(day, dayEnd);
    const first = Math.min(Math.max(Math.ceil(from / step) * step, dayStart), dayEnd);
    const starts: number[] = [];
    for (let m = first; m + minutes <= dayEnd; m += step) starts.push(m);
    for (let m = first - step; m >= dayStart; m -= step) starts.push(m);
    let sawCap = false;
    for (const m of starts) {
      const start = this.dayAt(day, m);
      const iv = { start, end: (start + minutes * MIN) as EpochMs };
      if (iv.start < allowed.start || iv.end > allowed.end || iv.end > dayEndAt) continue;
      const verdict = this.fit(day, iv);
      if (verdict === "ok") return iv;
      if (verdict === "cap") sawCap = true;
    }
    return sawCap ? "cap" : null;
  }

  private readonly atCache = new Map<string, EpochMs>();

  /** zone.at is the hot path of the slot search, and the same day and minute repeat across demands. */
  dayAt(day: LocalDate, minutes: number): EpochMs {
    const key = `${day}|${minutes}`;
    let t = this.atCache.get(key);
    if (t === undefined) {
      t = this.zone.at(day, wallTime(minutes));
      this.atCache.set(key, t);
    }
    return t;
  }
}

function demands(input: PlanInput, board: Board): Demand[] {
  const { prefs } = input;
  const zone = board.zone;
  const planFromByImport = new Map<ImportId, EpochMs>(input.imports.map((i) => [i.id, i.planFrom]));
  const planFromOf = (e: CalendarEvent) => planFromByImport.get(e.importId) ?? (0 as EpochMs);
  const inWindow = (e: CalendarEvent) => {
    const day = zone.dayOf(e.start);
    return day >= input.window.from && day <= input.window.to;
  };
  const events = [...board.events.values()].filter(inWindow);
  const lectures = events.filter((e): e is Lecture => e.kind === "lecture");
  const tests = events.filter((e): e is Test => e.kind === "test");
  const deadlines = events.filter((e): e is Deadline => e.kind === "deadline");
  const out: Demand[] = [];
  const at = (day: LocalDate, hhmm: string) => zone.at(day, hhmm as never);

  for (const lecture of lectures) {
    const day = zone.dayOf(lecture.start);
    const next = addDays(day, 1);
    const topic = topicFor(input, lecture);
    const boost = tests.find((t) => t.courseId === lecture.courseId && t.start >= lecture.end && daysBetween(day, zone.dayOf(t.start)) <= prefs.boostWindowDays);
    const n1Start = (lecture.end + prefs.bufferMin * MIN) as EpochMs;
    out.push({
      id: ids.block({ kind: "review", lecture: lecture.id, n: 1 }),
      anchor: { kind: "review", lecture: lecture.id, n: 1 },
      courseId: lecture.courseId,
      topic,
      minutes: boost ? prefs.review.boostedMin : prefs.review.baseMin,
      allowed: { start: n1Start, end: (lecture.end + 36 * HOUR) as EpochMs },
      candidates: [
        { day, from: minutesOfDay(n1Start, zone) },
        { day: next, from: wallMinutes("09:00" as never) },
      ],
      rank: 3,
      planFrom: planFromOf(lecture),
    });
    if (boost) {
      out.push({
        id: ids.block({ kind: "review", lecture: lecture.id, n: 2 }),
        anchor: { kind: "review", lecture: lecture.id, n: 2 },
        courseId: lecture.courseId,
        topic,
        minutes: prefs.review.boostedMin,
        allowed: { start: at(next, "09:00"), end: at(next, "22:00") },
        candidates: [{ day: next, from: 9 * 60 }],
        rank: 3,
        planFrom: planFromOf(lecture),
      });
    }
  }

  const byCourseWeek = new Map<string, Lecture[]>();
  const byWeek = new Map<IsoWeek, Lecture[]>();
  for (const lecture of lectures) {
    const week = isoWeekOfDay(zone.dayOf(lecture.start));
    const key = `${lecture.courseId}|${week}`;
    byCourseWeek.set(key, [...(byCourseWeek.get(key) ?? []), lecture]);
    byWeek.set(week, [...(byWeek.get(week) ?? []), lecture]);
  }
  const latestPlanFrom = (ls: readonly Lecture[]) => Math.max(...ls.map(planFromOf)) as EpochMs;

  for (const [key, ls] of byCourseWeek) {
    if (ls.length < 2) continue;
    const [courseId, week] = key.split("|") as [CourseId, IsoWeek];
    const monday = mondayOfWeek(week);
    const [tue, wed, thu] = [1, 2, 3].map((n) => addDays(monday, n));
    const windowStart = at(tue, "12:00");
    const before = ls.filter((l) => l.start < windowStart);
    const source = before.length ? before[before.length - 1] : ls[0];
    out.push({
      id: ids.block({ kind: "midweek", course: courseId, week }),
      anchor: { kind: "midweek", course: courseId, week },
      courseId,
      topic: { full: topicFor(input, source).full, short: courseShort(courseId) },
      minutes: prefs.midweekMin,
      allowed: { start: windowStart, end: at(thu, "22:00") },
      candidates: [wed, thu, tue].map((day) => ({ day, from: 14 * 60 })),
      rank: 4,
      planFrom: latestPlanFrom(ls),
    });
  }

  for (const [week, ls] of byWeek) {
    const monday = mondayOfWeek(week);
    const sat = addDays(monday, 5);
    const sun = addDays(monday, 6);
    out.push({
      id: ids.block({ kind: "endOfWeek", week }),
      anchor: { kind: "endOfWeek", week },
      courseId: null,
      topic: { full: "End-of-week review", short: "End of week" },
      minutes: prefs.endOfWeekMin,
      allowed: { start: at(sat, "09:00"), end: at(sun, "22:00") },
      candidates: [
        { day: sat, from: 11 * 60 },
        { day: sun, from: 11 * 60 },
      ],
      rank: 5,
      planFrom: latestPlanFrom(ls),
    });
  }

  for (const test of tests) {
    const { sessions: n, spanDays: span } = prefs.prep[test.weight];
    const testDay = zone.dayOf(test.start);
    for (let i = 1; i <= n; i++) {
      const day = addDays(testDay, -span + (n === 1 ? 0 : Math.round(((i - 1) * (span - 1)) / (n - 1))));
      const last = i === n;
      out.push({
        id: ids.block({ kind: "testPrep", test: test.id, index: i, of: n }),
        anchor: { kind: "testPrep", test: test.id, index: i, of: n },
        courseId: test.courseId,
        topic: { full: test.label, short: test.short },
        ...(last ? { note: "Past paper, timed" } : {}),
        minutes: last ? prefs.prepMin.last : prefs.prepMin.each,
        allowed: { start: at(addDays(day, -1), "09:00"), end: Math.min(at(day, "22:00"), test.start) as EpochMs },
        candidates: [
          { day, from: 13 * 60 },
          { day: addDays(day, -1), from: 13 * 60 },
        ],
        rank: 1,
        planFrom: planFromOf(test),
      });
    }
  }

  for (const deadline of deadlines) {
    const effort = prefs.effortMin[deadline.effort];
    const n = Math.ceil(effort / prefs.workBlockMaxMin);
    if (n === 0) continue;
    const minutes = Math.min(prefs.workBlockMaxMin, Math.ceil(effort / n / prefs.stepMin) * prefs.stepMin);
    const allowed = { start: (deadline.start - 5 * 24 * HOUR) as EpochMs, end: (deadline.start - 3 * HOUR) as EpochMs };
    const firstDay = zone.dayOf(allowed.start);
    const latest = zone.dayOf(allowed.end);
    for (let i = 1; i <= n; i++) {
      const days: LocalDate[] = [];
      for (let d = addDays(latest, -(n - i)); d >= firstDay; d = addDays(d, -1)) days.push(d);
      out.push({
        id: ids.block({ kind: "work", deadline: deadline.id, index: i, of: n }),
        anchor: { kind: "work", deadline: deadline.id, index: i, of: n },
        courseId: deadline.courseId,
        topic: { full: deadline.label, short: deadline.short },
        minutes,
        allowed,
        candidates: days.map((day) => ({ day, from: 18 * 60 })),
        rank: 2,
        planFrom: planFromOf(deadline),
      });
    }
  }
  return out;
}

function anchorEvent(board: Board, anchor: BlockAnchor): CalendarEvent | undefined {
  switch (anchor.kind) {
    case "review":
      return board.events.get(anchor.lecture);
    case "testPrep":
      return board.events.get(anchor.test);
    case "work":
      return board.events.get(anchor.deadline);
    default:
      return undefined;
  }
}

function courseOf(board: Board, anchor: BlockAnchor): CourseId | null {
  const event = anchorEvent(board, anchor);
  if (event && "courseId" in event) return event.courseId;
  if (anchor.kind === "midweek") return anchor.course;
  if (anchor.kind === "custom") return anchor.course;
  return null;
}

function whyFor(board: Board, input: PlanInput, anchor: BlockAnchor, start: EpochMs): StudyBlock["why"] {
  const event = anchorEvent(board, anchor);
  if (!event) return { offsetDays: 0 };
  const zone = board.zone;
  const anchorDay = zone.dayOf(event.start);
  const why: StudyBlock["why"] = { offsetDays: daysBetween(anchorDay, zone.dayOf(start)), anchorDay };
  if (anchor.kind === "review" && event.kind === "lecture") {
    const test = [...board.events.values()].find(
      (t) => t.kind === "test" && t.courseId === event.courseId && t.start >= event.end && daysBetween(anchorDay, zone.dayOf(t.start)) <= input.prefs.boostWindowDays,
    );
    if (test) why.boostedBy = { test: test.id, daysUntil: daysBetween(anchorDay, zone.dayOf(test.start)) };
  }
  return why;
}

/**
 * Pure and deterministic. No clock input: placement depends on the calendar, imports, overrides,
 * sessions and prefs only, so a past block stays where it was and becomes "missed".
 */
export function schedule(input: PlanInput): PlanOutput {
  const board = new Board(input);
  const all = demands(input, board);
  const demandById = new Map(all.map((d) => [d.id, d]));
  const blocks: StudyBlock[] = [];
  const unplaced: Unplaced[] = [];
  const conflicts: OverrideConflict[] = [];
  const claimed = new Set<BlockId>();
  const authoredText = new Map<BlockId, { topic: Topic; note?: string }>();

  const emit = (id: BlockId, anchor: BlockAnchor, at: Interval, topic: Topic, note: string | undefined, placement: StudyBlock["placement"], courseId?: CourseId | null) => {
    blocks.push({
      id,
      anchor,
      courseId: courseId === undefined ? courseOf(board, anchor) : courseId,
      topic,
      ...(note ? { note } : {}),
      start: at.start,
      end: at.end,
      why: whyFor(board, input, anchor, at.start),
      placement,
    });
    board.place(at);
    claimed.add(id);
  };

  for (const s of [...input.sessions].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    emit(s.id, s.anchor, s.planned, s.topic, demandById.get(s.id)?.note, "locked", s.courseId ?? courseOf(board, s.anchor));
  }

  const overrides = [...input.overrides].sort((a, b) => (a.blockId < b.blockId ? -1 : 1));
  const resolve = (o: PlanOverride) => {
    if (!o.placement) return null;
    if (o.placement.kind === "authored") {
      const b = o.placement.block;
      return { anchor: b.anchor, at: b.at, topic: b.topic, note: b.note, authored: true };
    }
    const d = demandById.get(o.blockId);
    return d ? { anchor: d.anchor, at: o.placement.at, topic: d.topic, note: d.note, authored: false } : null;
  };
  for (const o of overrides) {
    if (claimed.has(o.blockId)) continue;
    if (o.status === "skipped") {
      claimed.add(o.blockId);
      continue;
    }
    if (o.status !== "done") continue;
    const r = resolve(o);
    if (r) emit(o.blockId, r.anchor, r.at, r.topic, r.note, "locked");
  }
  for (const kind of ["pinned", "authored"] as const) {
    for (const o of overrides) {
      if (claimed.has(o.blockId) || o.placement?.kind !== kind) continue;
      const r = resolve(o);
      if (!r) continue;
      const clash = board.clash(r.at);
      if (clash) {
        conflicts.push({ blockId: o.blockId, at: r.at, clashesWith: clash });
        if (r.authored) {
          if (r.anchor.kind === "custom") {
            claimed.add(o.blockId);
            unplaced.push({ blockId: o.blockId, anchor: r.anchor, minutes: (r.at.end - r.at.start) / MIN, reason: "noFreeSlot" });
          } else authoredText.set(o.blockId, { topic: r.topic, note: r.note });
        }
        continue;
      }
      emit(o.blockId, r.anchor, r.at, r.topic, r.note, kind);
    }
  }

  const open = all
    .filter((d) => !claimed.has(d.id))
    .map((d) => ({ ...d, allowed: { start: Math.max(d.allowed.start, d.planFrom) as EpochMs, end: d.allowed.end } }))
    .filter((d) => d.allowed.start + d.minutes * MIN <= d.allowed.end)
    .sort((a, b) => a.rank - b.rank || a.allowed.end - b.allowed.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const d of open) {
    let sawCap = false;
    let placed: Interval | null = null;
    for (const c of d.candidates) {
      const r = board.search(c.day, c.from, d.minutes, d.allowed);
      if (r === "cap") sawCap = true;
      else if (r) {
        placed = r;
        break;
      }
    }
    if (!placed) {
      unplaced.push({ blockId: d.id, anchor: d.anchor, minutes: d.minutes, reason: sawCap ? "dailyCap" : "noFreeSlot" });
      continue;
    }
    const text = authoredText.get(d.id);
    emit(d.id, d.anchor, placed, text?.topic ?? d.topic, text ? text.note : d.note, "rule", d.courseId);
  }

  for (const [id] of authoredText) {
    if (!claimed.has(id)) {
      const d = demandById.get(id);
      if (d) unplaced.push({ blockId: id, anchor: d.anchor, minutes: d.minutes, reason: "noFreeSlot" });
    }
  }

  blocks.sort(byStartThenId);
  unplaced.sort((a, b) => (a.blockId < b.blockId ? -1 : 1));
  return { blocks, unplaced, conflicts };
}

/** First free interval of `minutes` after `after` (and before `before`), using schedule's rules. */
export function findSlot(input: PlanInput, minutes: number, range: { after: EpochMs; before?: EpochMs }): Interval | null {
  const out = schedule(input);
  const board = new Board(input);
  for (const b of out.blocks) board.place(b);
  const before = (range.before ?? range.after + 7 * 24 * HOUR) as EpochMs;
  const allowed = { start: range.after, end: before };
  const zone = board.zone;
  const lastDay = zone.dayOf(before);
  for (let day = zone.dayOf(range.after); day <= lastDay; day = addDays(day, 1)) {
    const from = day === zone.dayOf(range.after) ? minutesOfDay(range.after, zone) : 0;
    const p = input.prefs;
    const dayStart = wallMinutes(p.dayStart);
    const dayEnd = wallMinutes(p.dayEnd);
    for (let m = Math.max(dayStart, Math.ceil(from / p.stepMin) * p.stepMin); m + minutes <= dayEnd; m += p.stepMin) {
      const start = board.dayAt(day, m);
      const iv = { start, end: (start + minutes * MIN) as EpochMs };
      if (iv.start < allowed.start || iv.end > allowed.end) continue;
      if (board.fit(day, iv) === "ok") return iv;
    }
  }
  return null;
}

/** The window every view shares: earliest planFrom or authored block, to the last event plus 7 days. */
export function planWindow(
  zone: Zone,
  parts: { imports: readonly { planFrom: EpochMs }[]; events: readonly CalendarEvent[]; overrides: readonly PlanOverride[]; sessions: readonly Pick<StudySession, "planned">[] },
): PlanInput["window"] {
  const starts = [
    ...parts.imports.map((i) => i.planFrom),
    ...parts.overrides.flatMap((o) => (o.placement?.kind === "authored" ? [o.placement.block.at.start] : [])),
    ...parts.sessions.map((s) => s.planned.start),
    ...parts.events.map((e) => e.start),
  ];
  const ends = [...parts.events.map((e) => e.end), ...starts];
  if (starts.length === 0) {
    const today = zone.dayOf(Date.now() as EpochMs);
    return { from: today, to: today };
  }
  return { from: zone.dayOf(Math.min(...starts) as EpochMs), to: addDays(zone.dayOf(Math.max(...ends) as EpochMs), 7) };
}

/** skipped > done (session completed or ended, or override done) > inProgress > now > missed > upcoming. */
export function blockStatus(block: StudyBlock, ctx: { now: EpochMs; session?: Pick<StudySession, "state">; override?: PlanOverride }): BlockStatus {
  if (ctx.override?.status === "skipped") return "skipped";
  const s = ctx.session?.state.status;
  if (s === "completed" || s === "ended" || ctx.override?.status === "done") return "done";
  if (s === "running" || s === "paused") return "inProgress";
  if (ctx.now >= block.start && ctx.now < block.end) return "now";
  if (ctx.now >= block.end) return "missed";
  return "upcoming";
}
