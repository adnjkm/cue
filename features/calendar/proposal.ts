import { ids, type CalendarEvent, type CourseId, type EpochMs, type EffortSize, type ImportBatch, type ImportId, type LocalDate, type TestWeight, type Topic, type Zone } from "@/lib/domain";
import { fmtRange, fmtTime, parseDay, weekdayOf } from "@/lib/time";

/** One course an import found: a checkbox row in the preview, and the events written when it stays checked. */
export interface ProposedCourse {
  id: CourseId;
  title?: string;
  instructor?: string;
  /** "AST101 · Tue, Thu 3–4pm · MP 202". */
  label: string;
  /** "24 lectures · 1 test · 1 deadline". */
  counts: string;
  /** Tests and deadlines, listed under the course: "Midterm · Tue 17 Nov, 6pm". */
  dated: readonly string[];
  events: readonly CalendarEvent[];
}

/** What an import read, before the student confirms it. Every event already carries `importId`. */
export interface ImportProposal {
  importId: ImportId;
  source: ImportBatch["source"];
  courses: readonly ProposedCourse[];
  /** Events with no course: timed ones are busy time, all-day ones are notes. */
  other: readonly CalendarEvent[];
}

const SECTION = /\b(?:LEC|TUT|PRA|LAB|SEM)\d{3,4}\b/g;
const COURSE = /\b(?!(?:LEC|TUT|PRA|LAB|SEM)\d)([A-Z]{2,4})[ -]?(\d{3,4})(?:[A-Z]\d?)?\b/;

/** "AST101H1 LEC0101 The Sun" -> { id: "AST101", rest: "The Sun" }. Codes are upper case letters then digits. */
export function detectCourse(text: string): { id: CourseId; rest: string } | null {
  const m = COURSE.exec(text);
  if (!m) return null;
  const rest = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(SECTION, " ").replace(/\s+/g, " ").replace(/^[\s:–—-]+|[\s:–—-]+$/g, "");
  return { id: ids.course(m[1] + m[2]), rest };
}

export type CourseEventKind = "lecture" | "lab" | "test" | "deadline";

/** Words decide the kind; an all-day or zero-length item that names coursework is a deadline even without "due". */
export function classify(text: string, pointInTime: boolean): CourseEventKind {
  if (/\b(?:due|deadline|submit|submission)\b/i.test(text)) return "deadline";
  if (pointInTime && /\b(?:assignment|problem set|ps\s?\d+|essay|project|report|quiz)\b/i.test(text)) return "deadline";
  if (/\b(?:midterm|mid-term|exam|final|test|quiz)\b/i.test(text)) return "test";
  if (/\b(?:lab|tutorial|tut|practical|pra|seminar|recitation)\b/i.test(text) || /\b(?:TUT|PRA|LAB)\d{3,4}\b/.test(text)) return "lab";
  return "lecture";
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function testWeight(label: string): TestWeight {
  if (/\b(?:exam|final)\b/i.test(label)) return "exam";
  if (/\bmid-?term\b/i.test(label)) return "midterm";
  if (/\bquiz\b/i.test(label)) return "quiz";
  return "test";
}

/** "Term Test 2" -> "Test 2" (calendar: "Test 2 prep · 1 of 4"); "Midterm" stays. */
export function testShort(label: string, weight: TestWeight): string {
  const n = /(\d+)/.exec(label)?.[1];
  if (weight === "midterm") return "Midterm";
  if (weight === "exam") return "Exam";
  if (weight === "quiz") return n ? `Quiz ${n}` : "Quiz";
  return n ? `Test ${n}` : "Test";
}

export function deadlineLabel(rest: string): string {
  const label = rest.replace(/\b(?:is\s+)?(?:due|deadline|submission|submit)\b.*$/i, "").replace(/[\s:–—-]+$/, "").trim();
  return capital(label || rest || "Deadline");
}

/** "Assignment 2" -> "A2", "Problem Set 4" -> "PS4", "Quiz 3" -> "quiz 3", as Paper writes them. */
export function deadlineShort(label: string): string {
  const n = /(\d+)/.exec(label)?.[1] ?? "";
  if (/\bassignment\b/i.test(label)) return `A${n}`;
  if (/\bproblem set\b|\bps\s?\d/i.test(label)) return `PS${n}`;
  if (/\bquiz\b/i.test(label)) return n ? `quiz ${n}` : "quiz";
  if (/\blab\b/i.test(label)) return n ? `Lab ${n}` : "Lab";
  return label;
}

export function deadlineEffort(label: string): EffortSize {
  if (/\b(?:assignment|project|essay|paper|thesis)\b/i.test(label)) return "large";
  if (/\b(?:quiz|reading|reflection|response|survey)\b/i.test(label)) return "small";
  return "medium";
}

/** A topic named in the item itself: "Lecture 5: Kepler's laws". */
export function lectureTopic(rest: string): { number?: number; topic?: Topic } {
  const m = /\blec(?:ture)?\.?\s*(\d+)\b\s*(?:[:–—-]\s*(.+))?/i.exec(rest);
  if (!m) return {};
  const full = m[2]?.trim();
  return { number: Number(m[1]), ...(full ? { topic: { full, short: full.length <= 16 ? full : full.split(/\s+/)[0].replace(/[,:;.]$/, "") } } : {}) };
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `Tue 27 Oct`. */
export function shortDay(day: LocalDate): string {
  const { m, d } = parseDay(day);
  return `${WEEKDAY_SHORT[weekdayOf(day) - 1]} ${d} ${MONTH_SHORT[m - 1]}`;
}

const shortDate = (t: EpochMs, zone: Zone) => shortDay(zone.dayOf(t));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The preview row for one course: its main weekly pattern, what else it found, and its dated items. */
export function proposeCourse(id: CourseId, events: readonly CalendarEvent[], zone: Zone, extra?: { title?: string; instructor?: string }): ProposedCourse {
  const sorted = [...events].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  const meetings = sorted.filter((e) => e.kind === "lecture").length ? sorted.filter((e) => e.kind === "lecture") : sorted.filter((e) => e.kind === "lab");
  const patterns = new Map<string, { days: Set<number>; sample: CalendarEvent; count: number }>();
  for (const e of meetings) {
    const location = "location" in e ? (e.location ?? "") : "";
    const key = `${fmtRange(e, zone)}|${location}`;
    const p = patterns.get(key) ?? { days: new Set<number>(), sample: e, count: 0 };
    p.days.add(zone.weekday(zone.dayOf(e.start)));
    p.count++;
    patterns.set(key, p);
  }
  const main = [...patterns.values()].sort((a, b) => b.count - a.count)[0];
  const where = main && "location" in main.sample && main.sample.location ? ` · ${main.sample.location}` : "";
  const when = main ? ` · ${[...main.days].sort().map((d) => WEEKDAY_SHORT[d - 1]).join(", ")} ${fmtRange(main.sample, zone)}${where}` : "";

  const count = (kind: CalendarEvent["kind"]) => sorted.filter((e) => e.kind === kind).length;
  const counts = [
    count("lecture") && plural(count("lecture"), "lecture"),
    count("lab") && plural(count("lab"), "lab"),
    count("test") && plural(count("test"), "test"),
    count("deadline") && plural(count("deadline"), "deadline"),
  ].filter(Boolean);
  const dated = sorted.flatMap((e) =>
    e.kind === "test" ? [`${e.label} · ${shortDate(e.start, zone)}, ${fmtTime(e.start, zone)}`] : e.kind === "deadline" ? [`${e.label} due ${shortDate(e.start, zone)}, ${fmtTime(e.start, zone)}`] : [],
  );
  return {
    id,
    ...(extra?.title ? { title: extra.title } : {}),
    ...(extra?.instructor ? { instructor: extra.instructor } : {}),
    label: `${id}${when}`,
    counts: counts.join(" · "),
    dated,
    events: sorted,
  };
}

/** Why a file produced no proposal. The dialog shows `message`, which says how to recover. */
export class ImportError extends Error {
  constructor(readonly kind: "unreadable" | "empty" | "noClasses" | "unsupported") {
    super(
      kind === "empty"
        ? "That file has no classes or events in it. Export the calendar again with events included, or try a timetable PDF."
        : kind === "noClasses"
          ? "Cue couldn't find any classes in that file. Try a sharper screenshot of your weekly timetable, or an .ics file."
          : kind === "unsupported"
          ? "Cue reads .ics calendars, PDFs and PNG or JPG screenshots. Export your timetable as one of those and try again."
          : "Couldn't read that file. Try a PDF or an .ics file.",
    );
    this.name = "ImportError";
  }
}
