import type { AgendaItem, BlockMaterials, BlockStatus, CourseId, EpochMs, LocalDate, StudyBlock, Zone } from "@/lib/domain";
import { blockReasonText, blockTitle } from "@/lib/plan";
import { daysBetween, fmtDay, fmtDuration, fmtRange, fmtTime, minutesOfDay } from "@/lib/time";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const countWord = (n: number): string => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** "Recursion" -> "recursion", "Midterm" -> "midterm"; names with a digit or a second capital ("Term Test 2", "PS4") keep their case. */
export function lowerFirst(text: string): string {
  const [first, ...rest] = text.split(" ");
  if (!/^[A-Z][a-z']+$/.test(first) || /\d/.test(text) || rest.some((w) => /^[A-Z]/.test(w))) return text;
  return first.toLowerCase() + text.slice(first.length);
}

export function isRemaining(status: BlockStatus): boolean {
  return status === "upcoming" || status === "now" || status === "inProgress";
}

const UNNAMED = /^(Lec|Lecture)\b/;

/** What the headline calls a block: "recursion", "memory & learning", "the Lecture 9 review", "PS4". */
function sessionPhrase(b: StudyBlock): string {
  const { anchor, topic } = b;
  switch (anchor.kind) {
    case "review":
      return UNNAMED.test(topic.short) ? `the ${topic.full} review` : lowerFirst(topic.short);
    case "midweek":
      return UNNAMED.test(topic.full) ? `the ${anchor.course} mid-week review` : lowerFirst(topic.full);
    case "endOfWeek":
      return "the end-of-week review";
    case "testPrep":
      return `${lowerFirst(topic.short)} prep`;
    case "work":
      return anchor.of >= 2 && anchor.index === anchor.of ? `the ${topic.short} final push` : topic.short;
    case "custom":
      return lowerFirst(topic.short);
  }
}

function kindNoun(b: StudyBlock): string {
  switch (b.anchor.kind) {
    case "review":
      return "review";
    case "midweek":
      return "mid-week review";
    case "endOfWeek":
      return "end-of-week review";
    case "testPrep":
      return "prep session";
    case "work":
      return "work block";
    case "custom":
      return "session";
  }
}

function partOfDay(t: EpochMs, zone: Zone): "morning" | "afternoon" | "evening" {
  const m = minutesOfDay(t, zone);
  return m < 12 * 60 ? "morning" : m < 17 * 60 ? "afternoon" : "evening";
}

function relativeDay(day: LocalDate, today: LocalDate, zone: Zone): string {
  const d = daysBetween(today, day);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return WEEKDAYS[zone.weekday(day) - 1];
}

const possessive = (day: string) => (day === "today" ? "today’s" : `${day}’s`);

function inDays(n: number): string {
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

/** The test that boosted a block, resolved from the calendar: course code, label and day. */
export interface BriefTest {
  course: CourseId;
  label: string;
  day: LocalDate;
}

export interface BriefFacts {
  zone: Zone;
  now: EpochMs;
  /** Today's study blocks, by start. */
  blocks: readonly StudyBlock[];
  status(block: StudyBlock): BlockStatus;
  /** Every timed item on today's calendar, lectures included. */
  agendaCount: number;
  /** The first study block after today, used when nothing is left today. */
  later?: StudyBlock;
  /** Resolves `why.boostedBy` for the block the brief talks about. */
  testFor(block: StudyBlock): BriefTest | undefined;
  materialsFor(block: StudyBlock): BlockMaterials | undefined;
}

export interface Brief {
  headline: string;
  subline: string;
}

/** Why this block sits where it does, from the scheduler's own reasons. */
function reasonSentence(b: StudyBlock, f: BriefFacts, today: LocalDate): string | undefined {
  const { anchor } = b;
  const when = `this ${partOfDay(b.start, f.zone)}`;
  const test = f.testFor(b);
  const testIn = test && `Your ${test.course} ${lowerFirst(test.label)} is ${inDays(daysBetween(today, test.day))}`;
  switch (anchor.kind) {
    case "review":
      if (!testIn || !b.why.boostedBy) return undefined;
      return anchor.n === 2 ? `${testIn}, so Cue moved ${when}’s review up.` : `${testIn}, so Cue gave ${when}’s review extra time.`;
    case "testPrep":
      return testIn ? `${testIn}. This is prep ${anchor.index} of ${anchor.of}.` : `This is prep ${anchor.index} of ${anchor.of} for ${b.topic.full}.`;
    case "work": {
      const due = b.why.anchorDay ? relativeDay(b.why.anchorDay, today, f.zone) : "soon";
      return `${b.courseId ? `${b.courseId} ` : ""}${b.topic.full} is due ${due}, so Cue set aside ${fmtDuration(b.end - b.start)} ${when}.`;
    }
    case "midweek":
      return `${anchor.course} meets more than once a week, so Cue added a mid-week review.`;
    case "endOfWeek":
      return "The end-of-week review covers every lecture from this week.";
    case "custom":
      return b.note && (/[.!?]$/.test(b.note) ? b.note : `${b.note}.`);
  }
}

/** Where the session's material comes from. Only reviews have a lecture to pull from. */
function materialsSentence(b: StudyBlock, f: BriefFacts, today: LocalDate): string | undefined {
  if (b.anchor.kind !== "review" || !b.why.anchorDay) return undefined;
  const m = f.materialsFor(b);
  if (!m) return undefined;
  const lecture = possessive(relativeDay(b.why.anchorDay, today, f.zone));
  return m.materials.length > 0 || m.transcript
    ? `Everything you need is already pulled from ${lecture} lecture.`
    : `Add slides or notes for ${lecture} lecture and Cue opens them in the session.`;
}

function laterSentence(later: StudyBlock | undefined, f: BriefFacts, today: LocalDate): string {
  if (!later) return "Add lectures, tests or deadlines to the calendar and Cue plans study time around them.";
  const day = relativeDay(f.zone.dayOf(later.start), today, f.zone);
  return `Next up is ${sessionPhrase(later)} ${day === "tomorrow" ? "tomorrow" : `on ${day}`} at ${fmtTime(later.start, f.zone)}.`;
}

/**
 * The rule-based brief. It always renders first; today.brief may only reword the subline.
 * Sessions are study blocks; lectures count toward `agendaCount` but never toward the session count.
 */
export function ruleBrief(f: BriefFacts): Brief {
  const today = f.zone.dayOf(f.now);
  const total = f.blocks.length;
  const statuses = f.blocks.map((b) => f.status(b));
  const done = statuses.filter((s) => s === "done").length;
  const missed = f.blocks.filter((_, i) => statuses[i] === "missed");
  const next = f.blocks.find((_, i) => isRemaining(statuses[i]));
  const remaining = statuses.filter(isRemaining).length;

  if (total === 0) {
    return { headline: f.agendaCount === 0 ? "Nothing scheduled today." : "No study sessions today.", subline: laterSentence(f.later, f, today) };
  }

  const missedSentence =
    missed.length === 1
      ? `${cap(possessive(`this ${partOfDay(missed[0].start, f.zone)}`))} ${kindNoun(missed[0])} was missed. Pick Reschedule in the list to move it.`
      : missed.length > 1
        ? `${cap(countWord(missed.length))} sessions were missed. Pick Reschedule in the list to move them.`
        : undefined;

  if (!next) {
    const headline =
      missed.length > 0
        ? `${cap(countWord(missed.length))} ${plural(missed.length, "session")} missed today.`
        : total === 1
          ? "Today’s session is done."
          : total === 2
            ? "Both sessions done."
            : `All ${countWord(total)} sessions done.`;
    return { headline, subline: missedSentence ?? laterSentence(f.later, f, today) };
  }

  const verb = f.status(next) === "inProgress" ? "Resume" : done + missed.length === 0 ? "Start with" : "Next,";
  const count =
    done + missed.length === 0
      ? `${cap(countWord(total))} ${plural(total, "session")} today.`
      : `${cap(countWord(remaining))} of ${countWord(total)} sessions left.`;
  const headline = `${count} ${verb} ${sessionPhrase(next)}.`;
  const sentences = [missedSentence ?? reasonSentence(next, f, today), materialsSentence(next, f, today)].filter(Boolean);
  return { headline, subline: sentences.join(" ") };
}

/** "4 blocks · 3h 15m of study": lectures and study blocks count as blocks, busy time from the student's own calendar does not. */
export function summaryText(agenda: readonly AgendaItem[], blocks: readonly StudyBlock[]): string {
  const studyMs = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  const n = agenda.filter((a) => a.kind === "block" || a.event.kind !== "busy").length;
  const count = `${n} ${plural(n, "block")}`;
  return studyMs > 0 ? `${count} · ${fmtDuration(studyMs)} of study` : count;
}

/** Card meta: "Next up · 10:30–11:15am · Review 1 day after lecture"; another day adds its weekday. */
export function cardMeta(b: StudyBlock, status: BlockStatus, zone: Zone, now: EpochMs): string {
  const day = zone.dayOf(b.start);
  const range = day === zone.dayOf(now) ? fmtRange(b, zone) : `${fmtDay(day, zone, "weekdayShort")} ${fmtRange(b, zone)}`;
  return `${status === "now" ? "Now" : "Next up"} · ${range} · ${blockReasonText(b, "sentence")}`;
}

/** The today.brief input: today's sessions, the test behind the next one, and the rule-based draft. */
export function briefInput(f: BriefFacts, rule: Brief) {
  const next = f.blocks.find((b) => isRemaining(f.status(b)));
  const test = next && f.testFor(next);
  const today = f.zone.dayOf(f.now);
  return {
    sessions: f.blocks.map((b) => ({
      title: blockTitle(b, "timeline"),
      when: fmtRange(b, f.zone),
      reason: blockReasonText(b, "sentence"),
      status: f.status(b),
    })),
    ...(test ? { nextTest: { course: test.course, label: test.label, daysUntil: Math.max(0, daysBetween(today, test.day)) } } : {}),
    ruleBased: rule,
  };
}
