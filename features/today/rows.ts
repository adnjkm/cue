import { ids, lectureLive, sessionElapsedMs, type AgendaItem, type BlockId, type BlockStatus, type CourseId, type EpochMs, type EventId, type Lecture, type StudyBlock, type StudySession, type TimedEvent, type Zone } from "@/lib/domain";
import { blockReasonText, blockTitle } from "@/lib/plan";
import { href } from "@/lib/routes";
import { fmtCountdown, fmtDuration, fmtTime } from "@/lib/time";

/** What sits in a row's right-hand lane. Each kind draws differently; `trailingText` is its plain reading. */
export type Trailing =
  | { kind: "text"; text: string }
  /** 6px graphite dot, as Paper draws `Transcript ready`. */
  | { kind: "dot"; text: string }
  /** 8px ink dot and `Recording`, the note taker's live mark. */
  | { kind: "recording" }
  | { kind: "missed"; block: StudyBlock }
  | { kind: "inProgress"; session: StudySession };

/** data-state on the row, for styling and the walkthrough. */
export type RowState = "current" | "upcoming" | "missed" | "done" | "live" | "past";

export interface TodayRow {
  key: string;
  start: EpochMs;
  time: string;
  course: CourseId | null;
  title: string;
  href: string;
  /** The next-up block: emphasised and aria-current="time". */
  current: boolean;
  state: RowState;
  trailing: Trailing;
  /** Busy time from the student's own calendar, drawn quieter so the studying leads. */
  personal: boolean;
}

export interface RowFacts {
  zone: Zone;
  now: EpochMs;
  agenda: readonly AgendaItem[];
  status(block: StudyBlock): BlockStatus;
  /** By event id; a lecture with no row has never been opened in the note taker. */
  lectures: ReadonlyMap<EventId, Lecture>;
  sessions: ReadonlyMap<BlockId, StudySession>;
  next?: StudyBlock;
}

export function leftMs(session: StudySession, now: EpochMs): number {
  return session.minutes * 60_000 - sessionElapsedMs(session.state, now);
}

export function trailingText(t: Trailing, now: EpochMs): string {
  switch (t.kind) {
    case "text":
    case "dot":
      return t.text;
    case "recording":
      return "Recording";
    case "missed":
      return "Missed · Reschedule";
    case "inProgress":
      return `In progress · ${fmtCountdown(Math.max(0, leftMs(t.session, now)))} left`;
  }
}

function lectureTitle(event: Extract<TimedEvent, { kind: "lecture" }>, lecture: Lecture | undefined): string {
  const topic = (lecture?.notes && lecture.topic) || event.topic;
  if (topic) return `Lecture — ${topic.full}`;
  return event.number === undefined ? "Lecture" : `Lecture ${event.number}`;
}

function lectureTrailing(event: TimedEvent, lecture: Lecture | undefined, now: EpochMs): { trailing: Trailing; state: RowState } {
  const live = lecture ? lectureLive(lecture, now) : "ready";
  if (live === "recording") return { trailing: { kind: "recording" }, state: "live" };
  if (live === "paused") return { trailing: { kind: "text", text: "Paused" }, state: "live" };
  if (live === "interrupted") return { trailing: { kind: "text", text: "Interrupted" }, state: "live" };
  if (live === "saved") return { trailing: lecture?.notes ? { kind: "dot", text: "Transcript ready" } : { kind: "text", text: "Transcribing…" }, state: "past" };
  if (now < event.start) return { trailing: { kind: "text", text: "Record notes" }, state: "upcoming" };
  if (now < event.end) return { trailing: { kind: "text", text: "Now · Record notes" }, state: "upcoming" };
  return { trailing: { kind: "text", text: "Not recorded" }, state: "past" };
}

function eventRow(event: TimedEvent, f: RowFacts): TodayRow {
  const base = { key: event.id, start: event.start, time: fmtTime(event.start, f.zone), current: false, personal: event.kind === "busy" };
  const dayView = href.calendar({ view: "day", date: f.zone.dayOf(event.start) });
  const past = f.now >= event.end;
  switch (event.kind) {
    case "lecture": {
      const lecture = f.lectures.get(event.id);
      return { ...base, course: event.courseId, title: lectureTitle(event, lecture), href: href.lecture(ids.lectureForEvent(event.id)), ...lectureTrailing(event, lecture, f.now) };
    }
    case "lab":
      return {
        ...base,
        course: event.courseId,
        title: /^lab\b/i.test(event.title) ? event.title : `Lab — ${event.title}`,
        href: dayView,
        state: past ? "past" : "upcoming",
        trailing: { kind: "text", text: event.location ?? "" },
      };
    case "test":
      return { ...base, course: event.courseId, title: event.label, href: dayView, state: past ? "past" : "upcoming", trailing: { kind: "text", text: event.location ?? "" } };
    case "busy":
      return { ...base, course: null, title: event.title, href: dayView, state: past ? "past" : "upcoming", trailing: { kind: "text", text: event.location ?? "" } };
  }
}

function blockRow(block: StudyBlock, f: RowFacts): TodayRow {
  const status = f.status(block);
  const current = block.id === f.next?.id;
  const session = f.sessions.get(block.id);
  const base = {
    key: block.id,
    start: block.start,
    time: fmtTime(block.start, f.zone),
    course: block.courseId,
    title: blockTitle(block, "timeline"),
    href: status === "inProgress" ? href.study(block.id, { start: true }) : href.study(block.id),
    current,
    personal: false,
  };
  switch (status) {
    case "done":
      return { ...base, state: "done", trailing: { kind: "text", text: `Done · ${fmtDuration(block.end - block.start)}` } };
    case "missed":
      return { ...base, state: "missed", trailing: { kind: "missed", block } };
    case "skipped":
      return { ...base, state: "past", trailing: { kind: "text", text: "Skipped" } };
    case "inProgress":
      return { ...base, state: "current", trailing: session ? { kind: "inProgress", session } : { kind: "text", text: "In progress" } };
    case "now":
    case "upcoming":
      return { ...base, state: current ? "current" : "upcoming", trailing: { kind: "text", text: blockReasonText(block, "trailing") } };
  }
}

export function timelineRows(f: RowFacts): TodayRow[] {
  return f.agenda.map((item) => (item.kind === "event" ? eventRow(item.event, f) : blockRow(item.block, f)));
}
