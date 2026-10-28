/**
 * Cue architecture, candidate "opus": the type sketch.
 *
 * One file for review. In the app each section becomes the module named in its heading, and only
 * that module's index is importable. Bodies throw `not implemented`; `// TODO` marks tricky logic.
 * Read README.md first: the usage there is the spec, and these types are derived from it.
 *
 * Self-contained on purpose (imports only zod's types) so `pnpm typecheck` passes with it in the tree.
 */
import type { z } from "zod";

function todo(what: string): never {
  throw new Error(`not implemented: ${what}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §1 Brands and ids                                                         lib/domain/ids.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

declare const BRAND: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [BRAND]: Name };

/** Milliseconds since the epoch. Every stored instant is one; IndexedDB indexes numbers fast. */
export type EpochMs = Brand<number, "EpochMs">;
/** `YYYY-MM-DD` in the user's zone. */
export type LocalDate = Brand<string, "LocalDate">;
/** `HH:MM`, 24-hour, local wall time. */
export type WallTime = Brand<string, "WallTime">;
/** `2026-W44`. */
export type IsoWeek = Brand<string, "IsoWeek">;
/** An IANA zone id such as `America/Toronto`. */
export type TimeZone = Brand<string, "TimeZone">;
/** Integer micro-dollars, so ledger sums never drift. */
export type MicroUsd = Brand<number, "MicroUsd">;

/** Normalized course code, upper case: `CSC148`. Also the URL segment for guides. */
export type CourseId = Brand<string, "CourseId">;
/** `evt_` + base32 of a hash of the source identity (ICS UID + recurrence id, or timetable slot). */
export type EventId = Brand<string, "EventId">;
export type ImportId = Brand<string, "ImportId">;
/** `mat_` + the first 16 hex chars of the file's SHA-256, so a re-upload finds the same row. */
export type MaterialId = Brand<string, "MaterialId">;
export type BlobId = Brand<string, "BlobId">;
/** `<sourceKey>#<n>`. */
export type ChunkId = Brand<string, "ChunkId">;
/** `mat:<id>` | `lec:<id>` | `set:<id>`: everything chunked from one source, replaced together. */
export type SourceKey = Brand<string, "SourceKey">;
/** `review.evt_9f2c`, `midweek.CSC148.2026-W44`, `eow.2026-W44`, `prep.evt_x.3`, `work.evt_y.1`, `custom.k3j9`. */
export type BlockId = Brand<string, "BlockId">;
/** `lec.<EventId>` for a scheduled lecture, `lec.adhoc.<id>` otherwise. */
export type LectureId = Brand<string, "LectureId">;
export type LinkId = Brand<string, "LinkId">;
export type SetId = Brand<string, "SetId">;
export type QuestionId = Brand<string, "QuestionId">;
export type SectionId = Brand<string, "SectionId">;
export type ChapterId = Brand<string, "ChapterId">;
export type MessageId = Brand<string, "MessageId">;
/** `session:<BlockId>` | `lecture:<LectureId>` | `question:<QuestionId>` | `section:<SectionId>`. */
export type ThreadKey = Brand<string, "ThreadKey">;

/** Id constructors are the only way to build derived ids. They keep ids URL-safe. */
export const ids = {
  course: (code: string): CourseId => todo("ids.course: upper-case, strip spaces"),
  eventFromIcs: (uid: string, recurrenceId?: string): EventId => todo("ids.eventFromIcs"),
  eventFromSlot: (course: CourseId, kind: EventKind, start: EpochMs): EventId => todo("ids.eventFromSlot"),
  material: (sha256Hex: string): MaterialId => todo("ids.material"),
  block: (anchor: BlockAnchor): BlockId => todo("ids.block"),
  lectureForEvent: (event: EventId): LectureId => `lec.${event}` as LectureId,
  adhocLecture: (): LectureId => todo("ids.adhocLecture"),
  chunk: (key: SourceKey, n: number): ChunkId => `${key}#${n}` as ChunkId,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §2 Time                                                                         lib/time (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Interval {
  start: EpochMs;
  end: EpochMs;
}

/** Zone arithmetic. Days are wall-clock days, so the 25-hour Sun 1 Nov 2026 in Toronto works. */
export interface Zone {
  readonly id: TimeZone;
  dayOf(t: EpochMs): LocalDate;
  weekOf(t: EpochMs | LocalDate): IsoWeek;
  /** 1 = Monday … 7 = Sunday. */
  weekday(day: LocalDate): 1 | 2 | 3 | 4 | 5 | 6 | 7;
  at(day: LocalDate, time: WallTime): EpochMs;
  startOfDay(day: LocalDate): EpochMs;
  addDays(day: LocalDate, n: number): LocalDate;
  daysOfWeek(week: IsoWeek): readonly LocalDate[];
}

export function zoneOf(id: TimeZone): Zone {
  return todo("zoneOf: wrap @date-fns/tz TZDate");
}
export function currentZone(): TimeZone {
  return todo("currentZone: Intl.DateTimeFormat().resolvedOptions().timeZone");
}
/** Re-renders on the minute or second boundary. Reads Date.now(), which Playwright's clock controls. */
export function useNow(granularity: "minute" | "second"): EpochMs {
  return todo("useNow");
}

// Paper's formats. Each is unit-tested against strings copied from docs/design.
/** `9am`, `10:30am`, `12pm`. */
export function fmtTime(t: EpochMs, zone: Zone): string {
  return todo("fmtTime");
}
/** `10:30–11:15am`, `11:15am–12pm`, `9–10am` (en dash, one meridiem when shared). */
export function fmtRange(span: Interval, zone: Zone): string {
  return todo("fmtRange");
}
/** `45m`, `2h`, `3h 15m`. */
export function fmtDuration(ms: number): string {
  return todo("fmtDuration");
}
/** Countdown `31:48`, `45:00`. */
export function fmtCountdown(ms: number): string {
  return todo("fmtCountdown");
}
/** Transcript stamp `41:05`, `1:02:03`. */
export function fmtStamp(ms: number): string {
  return todo("fmtStamp");
}
/** `Due Thu`, `Tuesday 27 October` (accessible names), `October 2026`, `Oct – Nov 2026`. */
export function fmtDay(day: LocalDate, zone: Zone, style: "weekdayShort" | "long" | "month" | "monthSpan"): string {
  return todo("fmtDay");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §3 Courses and calendar events                                   lib/domain, lib/courses.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Course {
  id: CourseId;
  code: string; // "CSC148"
  short: string; // "CSC", used in "Mid-week · CSC"
  title?: string;
  instructor?: string; // "Prof. Liu"
}

/** The only writer of `courses`. Idempotent: merges by code. */
export function ensureCourse(code: string, patch?: Partial<Omit<Course, "id" | "code">>): Promise<CourseId> {
  return todo("ensureCourse");
}

/** Full title for headings, short for calendar blocks: { full: "Recursion & tree traversal", short: "Recursion" }. */
export interface Topic {
  full: string;
  short: string;
}

export type EventKind = "lecture" | "lab" | "test" | "deadline" | "busy" | "note";
export type TestWeight = "quiz" | "test" | "midterm" | "exam";
export type EffortSize = "small" | "medium" | "large";

interface EventBase {
  id: EventId;
  /** Every event has start and end for range queries. Kind-specific meaning is below. */
  start: EpochMs;
  end: EpochMs;
  importId: ImportId | "sample";
  /** Shared by instances expanded from one RRULE or one weekly timetable slot. */
  seriesId?: string;
}

/** A union by kind, so a deadline cannot have a duration and a note cannot have a room. */
export type CalendarEvent =
  | (EventBase & { kind: "lecture"; courseId: CourseId; number: number; topic?: Topic; location?: string })
  | (EventBase & { kind: "lab"; courseId: CourseId; title: string; location?: string })
  | (EventBase & { kind: "test"; courseId: CourseId; label: string; weight: TestWeight; location?: string })
  /** Invariant: end === start === due. Built only by `deadlineEvent()`. */
  | (EventBase & { kind: "deadline"; courseId: CourseId; label: string; short: string; effort: EffortSize })
  | (EventBase & { kind: "busy"; title: string })
  /** All-day text: start is the local day start, end the next day start. "Thanksgiving · no class". */
  | (EventBase & { kind: "note"; text: string });

export type TimedEvent = Extract<CalendarEvent, { kind: "lecture" | "lab" | "test" | "busy" }>;

export function deadlineEvent(fields: Omit<Extract<CalendarEvent, { kind: "deadline" }>, "kind" | "end">): CalendarEvent {
  return { ...fields, kind: "deadline", end: fields.start };
}

export interface ImportBatch {
  id: ImportId;
  at: EpochMs;
  source: { kind: "ics"; fileName: string } | { kind: "vision"; materialId: MaterialId } | { kind: "manual" };
  courses: CourseId[]; // created by this import, removed on Undo when nothing else uses them
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §4 Materials                                                               lib/materials (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type MaterialKind = "slides" | "textbook" | "handout" | "problemSet" | "pastPaper" | "notes" | "syllabus" | "other";

export interface Material {
  id: MaterialId;
  courseId: CourseId;
  kind: MaterialKind;
  title: string; // "Lecture 8 slides", "Course notes", "A2 handout"
  short?: string; // "A2 handout", used in chips
  lecture?: EventId; // slides and handouts tied to one lecture
  lectureNumber?: number;
  file?: BlobId;
  fileName?: string;
  pageCount: number;
  addedAt: EpochMs;
  updatedAt: EpochMs;
}

export interface SlideContent {
  heading: string;
  body: string;
  code?: { lang: string; text: string };
}

export interface MaterialPage {
  materialId: MaterialId;
  index: number; // 1-based
  label?: string; // "p. 214", "§5.2"
  section?: string; // "§5.2" for textbook pages, carried into chunks
  text: string;
  slide?: SlideContent;
  image?: BlobId;
  readBy: "textLayer" | "vision" | "sample" | "failed";
}

export interface IngestOptions {
  courseId: CourseId;
  kind: MaterialKind;
  title?: string;
  lecture?: EventId;
  /** "auto": vision only for pages whose text layer is under 200 chars. Past papers use "never" (Practice parses them). */
  vision?: "auto" | "never";
}
export type IngestProgress = { stage: "rendering" | "reading" | "indexing"; done: number; total: number };

/**
 * The one way a file enters Cue. Resumable and idempotent: the id is the file hash, pages already
 * read are skipped, and indexing replaces the source's chunks in one transaction.
 */
export function ingestFile(file: File, opts: IngestOptions, onProgress?: (p: IngestProgress) => void): Promise<MaterialId> {
  // TODO: hash -> materials row -> renderPages (lib/materials/pages.ts, from lib/pages.ts)
  //       -> per page: text layer; if thin and vision "auto", batch up to 3 pages into ai("material.read")
  //       -> pages rows -> reindexSource(sourceKey.material(id))
  return todo("ingestFile");
}

/** Ingest status is derived from rows, not stored. */
export type IngestStatus = { status: "ready" } | { status: "partial"; read: number; failed: number; total: number };
export function ingestStatus(material: Material, pages: readonly MaterialPage[]): IngestStatus {
  return todo("ingestStatus");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §5 Sources and citations                                                   lib/sources.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Display facts copied at citation time, so labels need no lookup and survive deletion. */
export interface DocFacts {
  kind: MaterialKind;
  title: string;
  short?: string;
  lectureNumber?: number;
}

export type SourceRef =
  | { kind: "page"; materialId: MaterialId; doc: DocFacts; page: number; to?: number; label?: string }
  | { kind: "transcript"; lectureId: LectureId; courseId: CourseId; lectureNumber?: number; atMs: number; toMs?: number }
  | { kind: "question"; setId: SetId; questionId: QuestionId; setTitle: string; number: string }
  | { kind: "assessment"; eventId: EventId; label: string; at: EpochMs };

/** How a guide footnote relates to its source: "Used in Problem Set 4, Q1", "Tested in …". */
export type FootnoteSource = SourceRef & { relation?: "used" | "tested" };

/**
 * chip:     "Slide 17", "Transcript 41:05", "A2 handout §3"
 * meta:     "Lecture 8 slides · Slide 17", "Lecture 8 transcript · 41:05", "Course notes · §5.3"
 * footnote: "Lecture 7 at 4:15", "Lecture 7 slides 6–8", "Textbook ch. 5, p. 92", "Used in Problem Set 4, Q1"
 */
export function sourceLabel(ref: SourceRef | FootnoteSource, style: "chip" | "meta" | "footnote"): string {
  return todo("sourceLabel");
}
/** "Lecture 7 at 4:15. Textbook ch. 5, p. 92." */
export function footnoteText(sources: readonly FootnoteSource[]): string {
  return todo("footnoteText");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §6 Retrieval                                                               lib/retrieval (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type EmbedderId = "qwen3-embedding-8b@1024" | "hash@1024";

export interface Chunk {
  id: ChunkId;
  courseId: CourseId;
  sourceKey: SourceKey;
  ref: SourceRef;
  text: string;
  /** Missing = pending; the indexer fills it. Only vectors from the active embedder are compared. */
  vector?: { by: EmbedderId; v: Float32Array };
}

export type ChunkDraft = Omit<Chunk, "id" | "vector">;

export const sourceKey = {
  material: (id: MaterialId): SourceKey => `mat:${id}` as SourceKey,
  lecture: (id: LectureId): SourceKey => `lec:${id}` as SourceKey,
  set: (id: SetId): SourceKey => `set:${id}` as SourceKey,
} as const;

/** Pure chunkers. Slides: one per slide. Text: paragraph windows up to 350 tokens. Transcript: 45–90 s windows. */
export function chunkMaterial(material: Material, pages: readonly MaterialPage[]): ChunkDraft[] {
  return todo("chunkMaterial");
}
export function chunkLecture(lecture: Lecture, segments: readonly Segment[]): ChunkDraft[] {
  return todo("chunkLecture");
}
export function chunkQuestions(set: PracticeSet, questions: readonly Question[], solutions: readonly Solution[]): ChunkDraft[] {
  return todo("chunkQuestions");
}
/** Re-chunk one source and replace its rows in one transaction. Idempotent. */
export function reindexSource(key: SourceKey): Promise<void> {
  return todo("reindexSource");
}
/** Deterministic feature hashing into 1,024 dims; the embedder for mock and OpenRouter modes. */
export function hashEmbed(text: string): Float32Array {
  return todo("hashEmbed");
}
/** Started by <Boot>. Embeds chunks missing a vector in batches of 32; backs off; stops on budget. */
export function startIndexer(signal: AbortSignal): void {
  todo("startIndexer");
}

/** A passage as the model sees it: `[S1] Lecture 8 slides · Slide 17\n<text>`. */
export interface Passage {
  id: `S${number}`;
  ref: SourceRef;
  label: string;
  text: string;
}

export interface RetrieveQuery {
  /** null searches every course (the end-of-week review spans them all). */
  courseId: CourseId | null;
  text: string;
  k?: number; // default 8
  within?: readonly SourceKey[]; // hard filter
  prefer?: readonly SourceKey[]; // +0.1 boost
  /** Transcript-only time window, for "Uses the last 5 minutes". */
  sinceMs?: { lectureId: LectureId; fromMs: number };
}

/** Hybrid: 0.65 cosine + 0.35 BM25, prefer boost, MMR (λ 0.7), at most 2 per page or transcript minute. */
export function retrieve(q: RetrieveQuery): Promise<Passage[]> {
  return todo("retrieve");
}

/** Strips `[S#]` markers, keeps citations in order of first mention, drops ids that were not sent. */
export function parseCitations(text: string, passages: readonly Passage[]): { text: string; citations: SourceRef[] } {
  return todo("parseCitations");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §7 Plan: the scheduler and its views                                           lib/plan (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** What a block is for. The block id is derived from this, never from its time. */
export type BlockAnchor =
  | { kind: "review"; lecture: EventId }
  | { kind: "midweek"; course: CourseId; week: IsoWeek }
  | { kind: "endOfWeek"; week: IsoWeek }
  | { kind: "testPrep"; test: EventId; index: number; of: number }
  | { kind: "work"; deadline: EventId; index: number; of: number }
  | { kind: "custom"; key: string };

export type BlockKind = BlockAnchor["kind"];

export interface StudyBlock extends Interval {
  id: BlockId;
  anchor: BlockAnchor;
  courseId: CourseId | null; // null: end-of-week review across all courses
  topic: Topic;
  note?: string; // "Past paper, timed"
  why: {
    /** Whole local days between the anchor and the final placement, pins included (review 1 day after lecture). */
    offsetDays: number;
    /** Set when an upcoming test lengthened or promoted this block (Today: "so Cue moved this morning's review up"). */
    boostedBy?: { test: EventId; daysUntil: number };
  };
  pinned: boolean;
}

/** The only stored plan state. One row per block. Written only by planActions. */
export interface PlanOverride {
  blockId: BlockId;
  pin?: Interval;
  status?: "done" | "skipped";
  /** Only for anchor kind "custom". A custom block is always pinned. */
  custom?: { courseId: CourseId | null; topic: Topic; minutes: number };
  updatedAt: EpochMs;
}

export interface PlanPrefs {
  dayStart: WallTime; // 08:00
  dayEnd: WallTime; // 22:00
  bufferMin: number; // 15, around fixed timed events
  stepMin: number; // 15, slot granularity
  maxStudyMinPerDay: number; // 240
  reviewMin: { base: number; boosted: number }; // 30 / 45
  boostWindowDays: number; // 14
  prep: Record<TestWeight, { sessions: number; spanDays: number }>; // quiz 0, test 4/12, midterm 6/7, exam 8/14
  effortMin: Record<EffortSize, number>; // 0 / 120 / 240
  /** Lectures start this many minutes past the hour; the note taker's length is the slot minus this. */
  lectureStartsPastMin: number; // 10
}

export interface PlanInput {
  zone: TimeZone;
  window: { from: LocalDate; to: LocalDate };
  courses: readonly Course[];
  events: readonly CalendarEvent[];
  /** Lecture topic: Lecture record after notes, else the event's topic, else `Lec 9`. */
  topics: ReadonlyMap<EventId, Topic>;
  overrides: readonly PlanOverride[];
  prefs: PlanPrefs;
}

export interface Unplaced {
  blockId: BlockId;
  anchor: BlockAnchor;
  minutes: number;
  reason: "noFreeSlot" | "dailyCap" | "windowInPast";
}
export interface OverrideConflict {
  blockId: BlockId;
  pin: Interval;
  clashesWith: EventId;
}

export interface PlanOutput {
  blocks: readonly StudyBlock[]; // sorted by start, then id
  unplaced: readonly Unplaced[];
  conflicts: readonly OverrideConflict[];
}

/** A demand is a block before placement. Internal to lib/plan. */
interface Demand {
  id: BlockId;
  anchor: BlockAnchor;
  courseId: CourseId | null;
  topic: Topic;
  minutes: number;
  allowed: Interval;
  preferredDays: readonly LocalDate[];
  preferredAt: WallTime;
  rank: 0 | 1 | 2 | 3 | 4 | 5; // pinned, testPrep, work, review, midweek, endOfWeek
  note?: string;
  why: StudyBlock["why"];
}

/**
 * Pure and deterministic. No clock input, no Date.now(): placement depends on the calendar,
 * overrides and prefs only, so a past block stays where it was and becomes "missed".
 */
export function schedule(input: PlanInput): PlanOutput {
  // TODO: 1. busy map per local day: timed events ± bufferMin (zone-aware wall times, DST-safe)
  //       2. demands(input): review per lecture, midweek per course-week with ≥2 lectures,
  //          endOfWeek per week, testPrep i of n per test, work i of n per deadline, custom from overrides
  //       3. place pinned/custom as given; a pin overlapping busy time -> conflicts, then place by rule
  //       4. sort the rest by (rank, allowed.end, id); first fit per demand (findSlotFor)
  //       5. drop skipped; collect unplaced
  const demands: Demand[] = [];
  return todo(`schedule (${demands.length} demands)`);
}

/** First free interval of `minutes` after `after` (and before `before`), using schedule's rules. */
export function findSlot(input: PlanInput, minutes: number, range: { after: EpochMs; before?: EpochMs }): Interval | null {
  return todo("findSlot");
}

export type BlockStatus = "upcoming" | "now" | "inProgress" | "done" | "missed" | "skipped";

/** Derived. skipped > done (session completed/ended, or marked) > inProgress > now > missed > upcoming. */
export function blockStatus(block: StudyBlock, ctx: { now: EpochMs; session?: StudySession; override?: PlanOverride }): BlockStatus {
  return todo("blockStatus");
}

/** calendar: "Review · Recursion"; timeline: "Review — Recursion & tree traversal"; card: "Recursion & tree traversal". */
export function blockTitle(block: StudyBlock, style: "calendar" | "timeline" | "card"): string {
  return todo("blockTitle");
}
/** trailing: "After-lecture · 45m", "Mid-week · 30m", "Due Thu · 2h"; sentence: "Review 1 day after lecture". */
export function blockReasonText(block: StudyBlock, style: "trailing" | "sentence"): string {
  return todo("blockReasonText");
}

export interface BlockMaterials {
  materials: readonly { materialId: MaterialId; label: string }[]; // "Lecture 8 slides", "Lab 6 handout"
  transcript?: { lectureId: LectureId; label: string }; // "Lecture 8 transcript"
  practiceCount: number; // "+ 12 practice Qs"
}
export function blockMaterials(block: StudyBlock): Promise<BlockMaterials> {
  return todo("blockMaterials");
}

/** One agenda row for Today's timeline and the day view: a fixed event or a study block. */
export type AgendaItem = { kind: "event"; event: TimedEvent } | { kind: "block"; block: StudyBlock };

export interface PlanView {
  zone: Zone;
  range: Interval;
  blocks: readonly StudyBlock[];
  events: readonly CalendarEvent[];
  agenda: readonly AgendaItem[]; // timed events and blocks in the range, by start
  unplaced: readonly Unplaced[];
  status(block: StudyBlock): BlockStatus;
  /** No courses and no events at all: show the first-run state. */
  isEmpty: boolean;
}

export type PlanRange = { day: EpochMs | LocalDate } | { week: IsoWeek } | { month: `${number}-${number}` } | Interval;

/** Reads every plan input with useLive and runs schedule() once per input change for the whole window. */
export function usePlan(range: PlanRange): PlanView | undefined {
  return todo("usePlan");
}

/** The only writer of `overrides`. Every action is idempotent. */
export const planActions = {
  /** Pins the block to the next free slot after `after`; null when nothing fits within 7 days. */
  reschedule: (blockId: BlockId, opts: { after: EpochMs }): Promise<Interval | null> => todo("reschedule"),
  /** Rejects an interval that overlaps fixed busy time. */
  pin: (blockId: BlockId, at: Interval): Promise<void> => todo("pin"),
  markDone: (blockId: BlockId): Promise<void> => todo("markDone"),
  skip: (blockId: BlockId): Promise<void> => todo("skip"),
  restore: (blockId: BlockId): Promise<void> => todo("restore"),
  addCustom: (fields: { courseId: CourseId | null; topic: Topic; at: Interval }): Promise<BlockId> => todo("addCustom"),
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §8 Study sessions                                     lib/domain/session.ts (F), features/study (S)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type AskMode = "quick" | "deep";
export type StepKind = "recall" | "reread" | "explain" | "practice" | "reflect";

export interface PlanStep {
  title: string; // "Re-read key slides"
  kind: StepKind;
  minutes: number;
  source?: SourceRef; // slides 12–17
  check?: string; // "Why does preorder need the empty-tree check first?"
}

export interface SessionPlan {
  steps: readonly PlanStep[]; // minutes sum to the session's minutes (normalized in code)
  /** The transcript moment shown under the material. */
  moment?: { ref: Extract<SourceRef, { kind: "transcript" }>; quote: string; examHint: boolean };
}

/** Timer state as timestamps. Time left is derived, so nothing ticks into the database. */
export type SessionState =
  | { status: "running"; startedAt: EpochMs; pausedMs: number }
  | { status: "paused"; startedAt: EpochMs; pausedAt: EpochMs; pausedMs: number }
  | { status: "completed"; startedAt: EpochMs; endedAt: EpochMs; pausedMs: number }
  | { status: "ended"; startedAt: EpochMs; endedAt: EpochMs; pausedMs: number };

export interface StudySession {
  /** One session per block. Opening /study/[blockId] twice finds this row. */
  id: BlockId;
  courseId: CourseId | null;
  topic: Topic; // snapshot, so history survives a calendar change
  minutes: number;
  lectureId?: LectureId;
  /** Missing = not generated yet. Generation runs in memory and restarts after a reload. */
  plan?: SessionPlan;
  state: SessionState;
  step: number;
  stepsDone: readonly number[];
  mode: AskMode;
  viewer: { tab: "slides" | "transcript" | "textbook"; ref?: SourceRef };
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface SessionClock {
  elapsedMs: number;
  leftMs: number; // negative when over
  fraction: number; // 0..1, the 160px bar
  phase: "focus" | "break" | "over";
  phaseLeftMs: number; // "Break · 4:12 left"
}

/** Pure. Pomodoro phase from elapsed time: 25 min focus, 5 min break, repeating inside the block. */
export function sessionClock(s: StudySession, now: EpochMs, pomodoro = { focusMin: 25, breakMin: 5 }): SessionClock {
  return todo("sessionClock");
}

/** Pure transitions; each returns the same state when it does not apply (idempotent). */
export const sessionTransitions = {
  open: (block: StudyBlock, now: EpochMs, lectureId?: LectureId): StudySession => todo("open"),
  pause: (s: StudySession, now: EpochMs): StudySession => todo("pause"),
  resume: (s: StudySession, now: EpochMs): StudySession => todo("resume"),
  gotoStep: (s: StudySession, step: number): StudySession => todo("gotoStep"),
  nextStep: (s: StudySession, now: EpochMs): StudySession => todo("nextStep: completes on the last step"),
  end: (s: StudySession, now: EpochMs): StudySession => todo("end: completed if all steps done, else ended"),
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §9 Lectures and transcription                    lib/domain/lecture.ts (F), features/lectures (L)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type EngineId = "parakeet" | "demo";

export type LectureState =
  | { status: "ready" }
  | { status: "recording"; engine: EngineId; since: EpochMs; capturedMs: number; heartbeatAt: EpochMs }
  | { status: "paused"; engine: EngineId; capturedMs: number }
  | { status: "saved"; savedAt: EpochMs; capturedMs: number };

export interface LectureNotes {
  summary: string;
  keyPoints: readonly { atMs: number; text: string }[];
  generatedAt: EpochMs;
}

export interface Lecture {
  id: LectureId;
  courseId: CourseId;
  eventId?: EventId;
  number?: number;
  topic?: Topic;
  professor?: string;
  scheduledMs: number; // slot length minus prefs.lectureStartsPastMin: "of 50:00"
  state: LectureState;
  /** Missing after save = the notes pass is pending. */
  notes?: LectureNotes;
  updatedAt: EpochMs;
}

/** Derived: a recording whose heartbeat is older than 15 s is "interrupted" (tab closed or crashed). */
export type LectureLive = LectureState["status"] | "interrupted";
export function lectureLive(l: Lecture, now: EpochMs): LectureLive {
  return todo("lectureLive");
}
export function lectureElapsedMs(l: Lecture, now: EpochMs): number {
  return todo("lectureElapsedMs");
}

export interface AssessmentMention {
  label: string; // "Term Test 2"
  eventId?: EventId; // resolved against the course's test events
}

export interface Segment {
  lectureId: LectureId;
  seq: number;
  chunkSeq: number; // the audio chunk it came from
  atMs: number;
  endMs: number;
  raw: string; // engine output, lower case for CTC
  /** Missing = cleanup pending or failed; the line shows `raw`. */
  text?: string;
  flag?: { by: "model"; assessment: AssessmentMention | null } | { by: "user" };
}

export interface RelatedLink {
  id: LinkId; // hash of (lectureId, target), so a repeated mention dedupes
  lectureId: LectureId;
  atMs: number;
  target: SourceRef;
  title: string; // "Problem Set 5, Q3–Q6"
  meta: string; // "Due Thursday · same technique"
  why: "hint" | "mention" | "similar";
}

/** Durable transcription queue: a chunk without transcribedAt is still owed segments. */
export interface AudioChunk {
  lectureId: LectureId;
  seq: number;
  startMs: number;
  durationMs: number;
  blob: Blob; // audio/webm;codecs=opus, one recorder restart per chunk so each decodes alone
  transcribedAt?: EpochMs;
}

export type EngineSource =
  | { kind: "mic"; stream: MediaStream; resumeAtMs: number }
  | { kind: "script"; script: DemoScript; resumeAtMs: number };

export interface DemoScript {
  lines: readonly { atMs: number; raw: string }[];
  partialEveryMs: number;
}

export type EngineEvent =
  | { type: "partial"; atMs: number; text: string }
  | { type: "final"; chunkSeq: number; atMs: number; endMs: number; raw: string }
  | { type: "audio"; chunk: Omit<AudioChunk, "lectureId" | "transcribedAt"> }
  | { type: "level"; rms: number };

/**
 * Engine behind the note taker. Parakeet: transformers.js `onnx-community/parakeet-ctc-0.6b-ONNX`
 * (q4f16, 454 MB) in a Web Worker, WebGPU with WASM fallback. Demo: replays a script on timers.
 * Pause aborts run(); resume calls run() again with resumeAtMs. No pause method to keep in sync.
 */
export interface TranscriptionEngine {
  readonly id: EngineId;
  readonly capabilities: { partials: boolean; needsDownloadBytes: number };
  prepare(onProgress: (p: { loadedBytes: number; totalBytes: number }) => void, signal: AbortSignal): Promise<void>;
  run(source: EngineSource, signal: AbortSignal): AsyncIterable<EngineEvent>;
  /** Re-transcribe a stored chunk (queue drain after a reload or a slow WASM backlog). */
  transcribeStored(chunk: AudioChunk, signal: AbortSignal): Promise<{ raw: string }>;
}

export type EngineState =
  | { status: "idle" }
  | { status: "preparing"; loadedBytes: number; totalBytes: number }
  | { status: "ready" }
  | { status: "running" }
  | { status: "stopped" }
  | { status: "failed"; reason: "noBackend" | "download" | "runtime" | "micDenied" };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §10 Practice                                         lib/domain/practice.ts (F), features/practice (P)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type Box = [x0: number, y0: number, x1: number, y1: number];
export interface Option {
  label: string;
  text: string;
}
export interface TreeNode {
  v: string;
  l?: TreeNode;
  r?: TreeNode;
}

export type Figure = { kind: "crop"; blob: BlobId; page: number; box: Box } | { kind: "tree"; root: TreeNode };

export type GenerationScope =
  | { kind: "topic"; courseId: CourseId; topic: string | "missedMost"; missedOnly: boolean; count: 3 | 5 | 10; note?: string }
  | { kind: "similar"; questionId: QuestionId }
  | { kind: "guideSection"; courseId: CourseId; sectionId: SectionId }
  | { kind: "message"; courseId: CourseId; messageId: MessageId };

export interface PracticeSet {
  id: SetId;
  courseId: CourseId | null;
  title: string; // "2024 Midterm"
  origin: { kind: "paper"; materialId: MaterialId; answerKey: boolean } | { kind: "generated"; scope: GenerationScope };
  view: { current: QuestionId; topic: string | null };
  createdAt: EpochMs;
}

export interface Question {
  id: QuestionId;
  setId: SetId;
  order: number;
  number: string; // as printed; generated ones continue after the paper's last
  topic: string;
  type: "multipleChoice";
  marks?: number;
  prompt: string;
  options: readonly Option[];
  /** The single source of truth for grading. Written by the parser, or by a solution for keyless papers. */
  answer?: string;
  answerSource: "document" | "model" | "none";
  origin: "paper" | "generated";
  figure?: Figure;
  generatedFrom?: readonly SourceRef[];
}

/** Only the choice is stored. */
export interface Attempt {
  questionId: QuestionId;
  setId: SetId;
  choice: string;
  at: EpochMs;
}

export type Grade = { status: "unanswered" } | { status: "checking"; choice: string } | { status: "answered"; choice: string; correct: boolean };

/** Derived: checking means a choice exists and the answer is not known yet. Survives reloads. */
export function gradeOf(q: Question, attempt: Attempt | undefined): Grade {
  if (!attempt) return { status: "unanswered" };
  if (!q.answer) return { status: "checking", choice: attempt.choice };
  return { status: "answered", choice: attempt.choice, correct: attempt.choice === q.answer };
}

export interface Solution {
  questionId: QuestionId;
  answer: string;
  explanation: string;
  steps: readonly { label: string; text: string }[];
  conclusion?: string;
  whyNot: Readonly<Record<string, string>>;
  resources: readonly SourceRef[];
  provenance: { by: "document" | "model"; groundedIn?: SourceRef };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §11 Study guides                                        lib/domain/guide.ts (F), features/guides (G)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface GuideChapter {
  id: ChapterId;
  title: string;
  textbookChapter?: number; // kept apart from guide order ("Elasticity" is 4th here, textbook ch. 5)
  sections: readonly { id: SectionId; title: string }[];
}

export interface Guide {
  courseId: CourseId;
  chapters: readonly GuideChapter[];
  outlinedAt: EpochMs;
  sourceVersion: number;
}

export type FootnoteN = number;
export interface Point {
  x: number;
  y: number;
}

/** Charts are data, drawn by features/guides/charts. "levels" reproduces Paper's demand panels exactly. */
export type ChartSpec =
  | {
      kind: "levels";
      axes: { x: string; y: string }; // "Q", "P"
      domain: { xMax: number; yMax: number };
      curve: { from: Point; to: Point; label: string };
      levels: readonly [y1: number, y2: number]; // P1, P2; the matching x values are computed from the curve
      levelNames?: readonly [string, string];
    }
  | { kind: "series"; axes: { x: string; y: string }; domain: { xMax: number; yMax: number }; series: readonly { label: string; points: readonly Point[] }[] }
  | { kind: "bars"; axes: { x: string; y: string }; bars: readonly { label: string; value: number }[] };

export type GuideBlock =
  | { kind: "prose"; text: string; refs: readonly FootnoteN[] }
  | { kind: "formula"; lhs: string; numerator: string; denominator: string; tex?: string; note?: string; noteRefs: readonly FootnoteN[] }
  | { kind: "figure"; panels: readonly { title: string; description: string; chart: ChartSpec }[]; caption: string; refs: readonly FootnoteN[] }
  | {
      kind: "callout";
      label: string; // "Common mistake"
      examHint?: string; // "will be on the midterm"; drives the ink border
      text: string;
      refs: readonly FootnoteN[];
      quote?: { text: string; attribution: string };
    };

export interface GuideDraft {
  blocks: readonly GuideBlock[];
  footnotes: readonly { n: FootnoteN; sources: readonly FootnoteSource[] }[];
  generatedAt: EpochMs;
  sourceVersion: number;
}

export interface GuideSection {
  id: SectionId;
  courseId: CourseId;
  chapterId: ChapterId;
  order: number;
  title: string;
  /** Missing = not written yet. */
  draft?: GuideDraft;
  failed?: { kind: AiErrorKind; at: EpochMs };
}

/** Derived: newer materials or lectures than the draft used. */
export function sectionStale(section: GuideSection, courseSourceVersion: number): boolean {
  return section.draft !== undefined && section.draft.sourceVersion < courseSourceVersion;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §12 Chat                                                                       lib/chat (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface ChatMessage {
  id: MessageId;
  thread: ThreadKey;
  courseId: CourseId | null;
  role: "user" | "assistant";
  text: string; // citation markers removed
  citations: readonly SourceRef[];
  mode?: AskMode;
  at: EpochMs;
  savedToGuideAt?: EpochMs; // "Add to study guide"; Guides reads these
}

/** The four ask contexts in the product. Each maps to one prompt and one retrieval filter in lib/chat. */
export type AskScope =
  | { kind: "lecture"; courseId: CourseId | null; lectureId?: LectureId; focus?: SourceRef } // study session; null = all courses
  | { kind: "liveLecture"; courseId: CourseId; lectureId: LectureId; windowMs: number } // "Uses the last 5 minutes"
  | { kind: "question"; questionId: QuestionId } // practice; hints only until answered
  | { kind: "guideSection"; courseId: CourseId; sectionId: SectionId };

export const threadKey = {
  session: (id: BlockId): ThreadKey => `session:${id}` as ThreadKey,
  lecture: (id: LectureId): ThreadKey => `lecture:${id}` as ThreadKey,
  question: (id: QuestionId): ThreadKey => `question:${id}` as ThreadKey,
  section: (id: SectionId): ThreadKey => `section:${id}` as ThreadKey,
} as const;

export interface PendingReply {
  question: string;
  mode: AskMode;
  text: string; // streamed so far, markers not yet parsed
  thinking: string;
  phase: "retrieving" | "thinking" | "answering";
}

export interface ChatHandle {
  messages: readonly ChatMessage[];
  pending: PendingReply | null;
  error: AiError | null;
  mode: AskMode;
  setMode(mode: AskMode): void;
  suggestions: readonly string[]; // empty-state prompts from the scope
  send(text: string): void;
  stop(): void;
  retry(): void;
  saveToGuide(id: MessageId): Promise<void>;
}

/**
 * Retrieval for the scope, the scope's prompt, streaming, stop, citation parsing, and one write per
 * settled message. A message is written when the reply finishes or is stopped, never per chunk.
 */
export function useChat(opts: { thread: ThreadKey; scope: AskScope; defaultMode?: AskMode }): ChatHandle {
  return todo("useChat");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §13 AI layer                                                                     lib/ai (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Closed set: Super 120B and Nano cannot be named. */
export type ModelKey = "superVL" | "ultra" | "lightning" | "qwenEmbed";

export interface ModelSpec {
  tokenFactory: string;
  /** Literal free-tier ids only, so the uncapped path cannot reach a paid model. null: not offered. */
  openRouter: `${string}:free` | null;
  usdPerM: { input: number; output: number };
}

export const MODELS = {
  superVL: { tokenFactory: "nvidia/Nemotron-3.5-Super-VL", openRouter: "nvidia/nemotron-3.5-super-vl:free", usdPerM: { input: 0.3, output: 0.9 } },
  ultra: { tokenFactory: "nvidia/Nemotron-3-Ultra-550b-a55b", openRouter: "nvidia/nemotron-3-ultra-550b-a55b:free", usdPerM: { input: 1, output: 3 } },
  lightning: { tokenFactory: "nvidia/Nemotron-3_5-Lightning", openRouter: "nvidia/nemotron-3.5-lightning:free", usdPerM: { input: 0.06, output: 0.24 } },
  qwenEmbed: { tokenFactory: "Qwen/Qwen3-Embedding-8B", openRouter: null, usdPerM: { input: 0.01, output: 0 } },
} as const satisfies Record<ModelKey, ModelSpec>;

/** Measured: one image costs up to 3,317 prompt tokens; 3,400 keeps the hold a true worst case. */
export const IMAGE_TOKENS = 3400;

export type ChatProfileKey = "vision" | "reason" | "chat" | "fast";
export type ProfileKey = ChatProfileKey | "embed";

export type Profile =
  | { kind: "chat"; model: Exclude<ModelKey, "qwenEmbed">; thinking: boolean; temperature: number }
  | { kind: "embed"; model: "qwenEmbed"; dimensions: 1024 };

export const PROFILES = {
  vision: { kind: "chat", model: "superVL", thinking: false, temperature: 0.1 },
  reason: { kind: "chat", model: "ultra", thinking: true, temperature: 0.6 },
  chat: { kind: "chat", model: "ultra", thinking: false, temperature: 0.4 },
  fast: { kind: "chat", model: "lightning", thinking: false, temperature: 0.2 },
  embed: { kind: "embed", model: "qwenEmbed", dimensions: 1024 },
} as const satisfies Record<ProfileKey, Profile>;

export type ContentPart = { type: "text"; text: string } | { type: "image"; dataUrl: string };
export interface Prompt {
  system: string;
  user: string | readonly ContentPart[];
  /** Earlier turns for chat tasks; trimmed to 12 by lib/chat. */
  history?: readonly { role: "user" | "assistant"; content: string }[];
}

export type StreamEvent = { type: "text"; delta: string } | { type: "thinking"; delta: string } | { type: "done" };

interface TaskCommon<I> {
  input: z.ZodType<I>;
  /** Called by scripts/check-nemotron.mjs against the live provider. */
  example: I;
  maxTokens: number | ((input: I) => number);
  /** Optional per-call override, e.g. ask picks chat or reason by mode. */
  temperature?: number;
}

export interface JsonTask<I, O> extends TaskCommon<I> {
  kind: "json";
  profile: ChatProfileKey | ((input: I) => ChatProfileKey);
  /** Gate for model output. response_format's JSON schema is derived from it with z.toJSONSchema. */
  output: z.ZodType<O>;
  prompt(input: I): Prompt;
  mock(input: I): O | Promise<O>;
}

export interface StreamTask<I> extends TaskCommon<I> {
  kind: "stream";
  profile: ChatProfileKey | ((input: I) => ChatProfileKey);
  prompt(input: I): Prompt;
  mock(input: I): AsyncIterable<StreamEvent>;
}

export interface EmbedTask {
  kind: "embed";
  profile: "embed";
  input: z.ZodType<EmbedInput>;
  example: EmbedInput;
}
export interface EmbedInput {
  texts: readonly string[]; // up to 32
  as: "document" | "query"; // queries get the Instruct prefix
}
export interface EmbedOutput {
  vectors: readonly Float32Array[];
}

// `any` because task inputs are contravariant in `profile` and `prompt`; the registry keeps each task's real types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTask = JsonTask<any, any> | StreamTask<any> | EmbedTask;

export function jsonTask<I, O>(t: Omit<JsonTask<I, O>, "kind">): JsonTask<I, O> {
  return { ...t, kind: "json" };
}
export function streamTask<I>(t: Omit<StreamTask<I>, "kind">): StreamTask<I> {
  return { ...t, kind: "stream" };
}

/** Prefixes every key, so `defineTasks("lecture", { clean })` registers `lecture.clean`. Server-only module. */
export function defineTasks<P extends string, T extends Record<string, AnyTask>>(
  prefix: P,
  tasks: T,
): { [K in keyof T & string as `${P}.${K}`]: T[K] } {
  return Object.fromEntries(Object.entries(tasks).map(([k, v]) => [`${prefix}.${k}`, v])) as never;
}

/**
 * In the app this is `typeof registry` from lib/ai/registry.ts, derived from the nine task files.
 * Written out here so the sketch shows every role and its I/O.
 */
export interface TaskSignatures {
  ask: { kind: "stream"; input: AskInput };
  embed: { kind: "embed"; input: EmbedInput; output: EmbedOutput };
  "material.read": { kind: "json"; input: { pages: readonly PageImage[] }; output: { pages: readonly MaterialPageRead[] } };
  "today.brief": { kind: "json"; input: TodayBriefInput; output: { headline: string; subline: string } };
  "calendar.read": { kind: "json"; input: { pages: readonly PageImage[]; termStart: LocalDate }; output: TimetableRead };
  "lecture.clean": { kind: "json"; input: { raw: string; before: string }; output: { sentences: readonly string[] } };
  "lecture.hints": { kind: "json"; input: LectureHintsInput; output: LectureHintsOutput };
  "lecture.notes": { kind: "json"; input: LectureNotesInput; output: Omit<LectureNotes, "generatedAt"> & { hints: readonly { atMs: number; quote: string }[] } };
  "study.plan": { kind: "json"; input: StudyPlanInput; output: StudyPlanOutput };
  "practice.parse": { kind: "json"; input: { pages: readonly PageImage[]; totalPages: number }; output: PaperChunkRead };
  "practice.solve": { kind: "json"; input: SolveInput; output: SolveOutput };
  "practice.generate": { kind: "json"; input: GenerateInput; output: { questions: readonly GeneratedQuestion[] } };
  "practice.check": { kind: "json"; input: { prompt: string; options: readonly Option[] }; output: { answer: string } };
  "guide.outline": { kind: "json"; input: GuideOutlineInput; output: { chapters: readonly { title: string; textbookChapter?: number; sections: readonly string[] }[] } };
  "guide.section": { kind: "json"; input: GuideSectionInput; output: GuideSectionOutput };
}

export type TaskName = keyof TaskSignatures;
export type JsonTaskName = { [N in TaskName]: TaskSignatures[N]["kind"] extends "json" | "embed" ? N : never }[TaskName];
export type StreamTaskName = { [N in TaskName]: TaskSignatures[N]["kind"] extends "stream" ? N : never }[TaskName];
export type TaskInput<N extends TaskName> = TaskSignatures[N]["input"];
export type TaskOutput<N extends JsonTaskName> = TaskSignatures[N] extends { output: infer O } ? O : never;

// Task payloads (summaries; each task file owns the zod schema that is the real gate).
export interface PageImage {
  page: number;
  image: string; // data URL, 1240–1600 px wide
  text: string; // text layer, may be empty
}
export interface MaterialPageRead {
  page: number;
  text: string;
  slide?: SlideContent;
  section?: string;
}
export interface TimetableRead {
  courses: readonly {
    code: string;
    meetings: readonly { kind: "lecture" | "lab"; day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"; start: string; end: string; room?: string }[];
  }[];
  dated: readonly { code: string; kind: "deadline" | "test"; label: string; date: string; time?: string }[];
}
export interface AskInput {
  scope: AskScope["kind"];
  mode: AskMode;
  question: string;
  history: readonly { role: "user" | "assistant"; text: string }[];
  passages: readonly Passage[];
  /** Scope facts the prompt needs: step title, question stem and options, whether it is answered. */
  subject: { title: string; lines: readonly string[]; hideAnswer: boolean };
}
export interface TodayBriefInput {
  sessions: readonly { title: string; reason: string }[];
  nextTest?: { course: string; label: string; daysUntil: number };
  ruleBased: { headline: string; subline: string };
}
export interface LectureHintsInput {
  course: CourseId;
  window: string; // last 60 s of cleaned text
  assessments: readonly string[]; // labels of the course's tests and deadlines, for matching
}
export interface LectureHintsOutput {
  hints: readonly { quote: string; assessment: string | null }[];
  tasks: readonly string[];
  mentions: readonly { kind: "assessment" | "assignment" | "reading" | "practice" | "slides"; text: string }[];
}
export interface LectureNotesInput {
  course: CourseId;
  topic?: string;
  transcript: readonly { atMs: number; text: string; flagged: boolean }[];
}
export interface StudyPlanInput {
  block: { kind: BlockKind; minutes: number; title: string; why: StudyBlock["why"] };
  passages: readonly Passage[];
  flagged: readonly { atMs: number; quote: string }[];
  practiceCount: number;
}
export interface StudyPlanOutput {
  steps: readonly { title: string; kind: StepKind; minutes: number; source?: Passage["id"]; check?: string }[];
  moment?: Passage["id"];
}
export interface PaperChunkRead {
  title?: string;
  course?: string;
  questions: readonly { number: string; topic: string; prompt: string; options: readonly Option[]; answer?: string; marks?: number; figure?: { page: number; box: Box } }[];
  answerKey: readonly { number: string; answer: string }[];
}
export interface SolveInput {
  question: { number: string; topic: string; prompt: string; options: readonly Option[]; answer?: string };
  passages: readonly Passage[];
}
export interface SolveOutput {
  answer: string;
  explanation: string;
  steps: readonly { label: string; text: string }[];
  conclusion?: string;
  whyNot: Readonly<Record<string, string>>;
  resources: readonly Passage["id"][];
}
export interface GenerateInput {
  scope: GenerationScope;
  style: readonly { prompt: string; options: readonly Option[] }[]; // up to 6 from the paper
  passages: readonly Passage[];
  count: number;
}
export interface GeneratedQuestion {
  topic: string;
  prompt: string;
  options: readonly Option[];
  answer: string;
  whyNot: Readonly<Record<string, string>>;
  steps: readonly { label: string; text: string }[];
  sources: readonly Passage["id"][];
}
export interface GuideOutlineInput {
  course: CourseId;
  materials: readonly { title: string; kind: MaterialKind; headings: readonly string[] }[];
  lectures: readonly { number?: number; topic?: string }[];
}
export interface GuideSectionInput {
  course: CourseId;
  chapter: string;
  section: string;
  passages: readonly Passage[];
  hints: readonly { quote: string; attribution: string; assessment?: string }[];
  savedAnswers: readonly string[];
}
/** The model cites passage ids; the client numbers them into footnotes. */
type CiteByPassage<B> = { [K in keyof B]: K extends "refs" | "noteRefs" ? readonly Passage["id"][] : B[K] };
export type GuideBlockDraft = GuideBlock extends infer B ? (B extends GuideBlock ? CiteByPassage<B> : never) : never;
export interface GuideSectionOutput {
  blocks: readonly GuideBlockDraft[];
}

export type AiErrorKind = "bad_input" | "missing_key" | "budget" | "rate_limited" | "too_large" | "bad_output" | "upstream" | "offline" | "aborted";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly retryAfterMs?: number,
    /** For budget errors: the configured cap, so copy never hard-codes "$30". */
    readonly capUsd?: number,
  ) {
    super(message);
  }
}

/** The one place UI copy for AI errors lives. budget -> "The $30 spending cap is reached." */
export function errorCopy(e: AiError): { title: string; detail?: string; retry: boolean } {
  return todo("errorCopy");
}

/** Client. Imports the registry with `import type`, so prompts and mocks never reach the browser. */
export function ai<N extends JsonTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): Promise<TaskOutput<N>> {
  return todo("ai: POST /api/ai/<name>, map { error } to AiError");
}
export function aiStream<N extends StreamTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): AsyncIterable<StreamEvent> {
  return todo("aiStream: read NDJSON lines; an error line throws AiError");
}

export type AiMode = "token-factory" | "openrouter" | "mock";
export interface AiStatus {
  mode: AiMode;
  embedder: EmbedderId;
  spend?: { spentUsd: number; capUsd: number }; // Token Factory only
}
export function useAiStatus(): AiStatus | undefined {
  return todo("useAiStatus: GET /api/status, revalidated after each settled call");
}

// Server side (lib/ai/server.ts, `import "server-only"`).

export interface LedgerStore {
  /** Atomic across instances: drop expired holds, sum live holds, refuse if spent + held + hold > cap. */
  reserve(hold: { id: string; amount: MicroUsd; expiresAt: EpochMs }, cap: MicroUsd): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  /** Idempotent: a second settle for the same id is a no-op. Records actual cost even if the hold expired. */
  settle(holdId: string, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<{ spent: MicroUsd; held: MicroUsd; calls: number }>;
}

/** Local dev: today's JSON file and promise queue, in micro-dollars. Fails closed on a corrupt file. */
export declare class FileLedger implements LedgerStore {
  constructor(path: string);
  reserve(hold: { id: string; amount: MicroUsd; expiresAt: EpochMs }, cap: MicroUsd): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  settle(holdId: string, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<{ spent: MicroUsd; held: MicroUsd; calls: number }>;
}
/** Vercel: Upstash Redis REST, reserve and settle as Lua scripts (sorted set of holds by expiry). */
export declare class RedisLedger implements LedgerStore {
  constructor(url: string, token: string);
  reserve(hold: { id: string; amount: MicroUsd; expiresAt: EpochMs }, cap: MicroUsd): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  settle(holdId: string, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<{ spent: MicroUsd; held: MicroUsd; calls: number }>;
}

/** Redis if configured; file locally; on Vercel without Redis, null, and every paid call fails closed. */
export function ledgerFromEnv(env: Record<string, string | undefined>): LedgerStore | null {
  return todo("ledgerFromEnv");
}
/** SPEND_CAP_USD must parse as a positive finite number; anything else fails closed. */
export function capFromEnv(env: Record<string, string | undefined>): MicroUsd | null {
  return todo("capFromEnv");
}
/** CUE_AI=mock wins (refused when VERCEL_ENV=production); then NEBIUS_API_KEY; then LLM_API_KEY; then mock outside production. */
export function aiModeFromEnv(env: Record<string, string | undefined>): AiMode | { error: "missing_key" } {
  return todo("aiModeFromEnv");
}

/**
 * The gateway. Validates input, mocks or calls the provider with up to 3 attempts (a reservation per
 * attempt, SDK maxRetries 0, req.signal passed through), validates output with one repair attempt,
 * and maps errors to { error } with status 400/402/413/429/500/502. Streams answer in NDJSON.
 */
export function runTask(name: string, body: unknown, signal: AbortSignal): Promise<Response> {
  return todo("runTask");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §14 Database                                                                     lib/db (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Settings {
  key: "app";
  zone: TimeZone;
  prefs: PlanPrefs;
  planningSince: LocalDate;
  termEnd?: LocalDate;
  engine: EngineId;
  parakeetConsentAt?: EpochMs;
  lastGuide?: { courseId: CourseId; sectionId?: SectionId };
  sample?: { seededAt: EpochMs; anchorWeek: IsoWeek };
}

export interface BlobRow {
  id: BlobId;
  blob: Blob;
  type: string;
}

/** Row type per table. Dexie's `EntityTable<Row, Key>` is built from this map. */
export interface Tables {
  settings: Settings;
  courses: Course;
  events: CalendarEvent;
  imports: ImportBatch;
  overrides: PlanOverride;
  materials: Material;
  pages: MaterialPage;
  blobs: BlobRow;
  chunks: Chunk;
  lectures: Lecture;
  segments: Segment;
  links: RelatedLink;
  audio: AudioChunk;
  sessions: StudySession;
  messages: ChatMessage;
  practiceSets: PracticeSet;
  questions: Question;
  attempts: Attempt;
  solutions: Solution;
  guides: Guide;
  guideSections: GuideSection;
}
export type TableName = keyof Tables;

export type Owner = "foundation" | "today" | "calendar" | "lectures" | "study" | "practice" | "guides";

/** One writer per table. eslint and check-ownership read the same mapping from workstreams.json. */
export const TABLE_WRITERS = {
  settings: "foundation",
  courses: "foundation",
  events: "calendar",
  imports: "calendar",
  overrides: "foundation",
  materials: "foundation",
  pages: "foundation",
  blobs: "foundation",
  chunks: "foundation",
  lectures: "lectures",
  segments: "lectures",
  links: "lectures",
  audio: "lectures",
  sessions: "study",
  messages: "foundation",
  practiceSets: "practice",
  questions: "practice",
  attempts: "practice",
  solutions: "practice",
  guides: "guides",
  guideSections: "guides",
} as const satisfies Record<TableName, Owner>;

export const SCHEMA_V1 = {
  settings: "key",
  courses: "id",
  events: "id, kind, start, courseId, importId, seriesId",
  imports: "id",
  overrides: "blockId",
  materials: "id, courseId, kind, lecture",
  pages: "[materialId+index], materialId",
  blobs: "id",
  chunks: "id, courseId, sourceKey",
  lectures: "id, courseId, eventId, state.status",
  segments: "[lectureId+seq], lectureId",
  links: "id, lectureId",
  audio: "[lectureId+seq], lectureId",
  sessions: "id, state.status, courseId",
  messages: "id, thread, [thread+at], courseId, savedToGuideAt",
  practiceSets: "id, courseId",
  questions: "id, setId, [setId+order]",
  attempts: "questionId, setId",
  solutions: "questionId",
  guides: "courseId",
  guideSections: "id, courseId, [courseId+order]",
} as const satisfies Record<TableName, string>;

/** Dexie liveQuery as a hook; undefined until the first answer. Safe to import on the server (lazy open). */
export function useLive<T>(query: () => Promise<T> | T, deps: readonly unknown[]): T | undefined {
  return todo("useLive");
}

/** Shell badges read the database, never feature code. */
export function useLiveActivity(): { recording?: Lecture; session?: { session: StudySession; leftMs: number } } | undefined {
  return todo("useLiveActivity");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §15 Routes, nav and test ids                                    lib/routes.ts, lib/testids.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type CalendarView = "day" | "week" | "month";

/** Every cross-feature link is built here. Features parse their own search params. */
export const href = {
  today: (): string => "/",
  calendar: (p?: { view?: CalendarView; date?: LocalDate }): string => todo("href.calendar"),
  studyIndex: (): string => "/study",
  study: (block: BlockId): string => `/study/${block}`,
  lectures: (): string => "/lectures",
  lecture: (id: LectureId, p?: { atMs?: number }): string => todo("href.lecture"),
  practice: (p?: { generate?: GenerationScope }): string => todo("href.practice: scope as base64url JSON"),
  practiceSet: (id: SetId, p?: { q?: QuestionId }): string => todo("href.practiceSet"),
  guides: (): string => "/guides",
  guide: (course: CourseId, section?: SectionId): string => (section ? `/guides/${course}/${section}` : `/guides/${course}`),
  guideExport: (course: CourseId): string => `/export/guide/${course}`,
} as const;

export const NAV = [
  { key: "today", label: "Today", href: "/", icon: "Sun" },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "Calendar" },
  { key: "study", label: "Study sessions", href: "/study", icon: "BookOpen" },
  { key: "lectures", label: "Lecture notes", href: "/lectures", icon: "Mic" },
  { key: "practice", label: "Practice", href: "/practice", icon: "SquareCheckBig" },
  { key: "guides", label: "Study guides", href: "/guides", icon: "FileText" },
] as const;

/** Only for regions with no role. Everything else is found by role and accessible name. */
export const tid = {
  shell: { spend: "shell-spend" },
  today: { nextUp: "today-next-up", timeline: "today-timeline" },
  calendar: { weekGrid: "calendar-week-grid", hours: "calendar-hours", monthGrid: "calendar-month-grid" },
  study: { plan: "study-plan", viewer: "study-viewer" },
  chat: { thread: "chat-thread" },
  lectures: { related: "lectures-related" },
  practice: { bar: "practice-bar" },
  guides: { section: "guides-section", footnotes: "guides-footnotes" },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §16 Sample semester                                                              lib/sample (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Stable ids, independent of the date, so mocks and walkthrough steps can name sample rows. */
export const SAMPLE = {
  courses: { csc148: "CSC148" as CourseId, mat137: "MAT137" as CourseId, eco101: "ECO101" as CourseId, psy100: "PSY100" as CourseId },
  events: {
    csc148Lecture8: "evt_sample_csc148_l08" as EventId, // Mon of the current week, 10–11am, BA 1160
    mat137LectureTue: "evt_sample_mat137_tue" as EventId, // Tue 9–10am, "Integration by parts", transcript ready
    mat137LectureThu: "evt_sample_mat137_thu" as EventId, // Thu 9–10am, recorded live by the walkthrough
    csc148Midterm: "evt_sample_csc148_midterm" as EventId, // Fri of next week ("in 10 days")
    mat137TermTest2: "evt_sample_mat137_tt2" as EventId, // Fri two weeks on ("Nov 13")
  },
  materials: { csc148L8Slides: "mat_sample_csc148_l08_slides" as MaterialId, eco101Textbook: "mat_sample_eco101_text" as MaterialId },
  sets: { csc148Midterm2024: "set_sample_csc148_2024mt" as SetId },
  sections: { priceElasticity: "price-elasticity-of-demand" as SectionId },
} as const;

export interface SampleSummary {
  courses: number;
  events: number;
  blocksThisWeek: number;
  overridesUsed: number; // the golden-week test keeps this at 8 or fewer
}

/**
 * Clears every table and writes the sample in one transaction. Paper's week (Mon 26 Oct 2026)
 * maps to the current week by weekday, so the demo always looks current; with the clock at
 * Tue 27 Oct 2026 10:12 America/Toronto it reproduces the Paper screens exactly. Idempotent.
 */
export function seedSampleSemester(opts: { now: number; zone: TimeZone }): Promise<SampleSummary> {
  return todo("seedSampleSemester");
}
export function resetAll(): Promise<void> {
  return todo("resetAll");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §17 Workstream manifest                                                    workstreams.json (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Workstream {
  key: Owner;
  /** Globs this workstream may change after the foundation commit. Disjoint across workstreams. */
  owns: readonly string[];
  /** Must equal the TABLE_WRITERS entries for this key; check-ownership fails otherwise. */
  writes: readonly TableName[];
  /** Task-name prefix; tasks.ts must use defineTasks(prefix, …). */
  tasks?: string;
  /** scripts/e2e/steps/<file>.mjs, run in manifest order. */
  e2eStep: string;
}

export const WORKSTREAMS = [
  {
    key: "today",
    owns: ["app/(browse)/page.tsx", "features/today/**", "scripts/e2e/steps/today.mjs"],
    writes: [],
    tasks: "today",
    e2eStep: "today",
  },
  {
    key: "calendar",
    owns: ["app/(browse)/calendar/**", "features/calendar/**", "scripts/e2e/steps/calendar.mjs", "scripts/fixtures/calendar/**"],
    writes: ["events", "imports"],
    tasks: "calendar",
    e2eStep: "calendar",
  },
  {
    key: "lectures",
    owns: ["app/(browse)/lectures/**", "app/(focus)/lectures/**", "features/lectures/**", "scripts/e2e/steps/lectures.mjs", "scripts/fixtures/lectures/**"],
    writes: ["lectures", "segments", "links", "audio"],
    tasks: "lecture",
    e2eStep: "lectures",
  },
  {
    key: "study",
    owns: ["app/(browse)/study/**", "app/(focus)/study/**", "features/study/**", "scripts/e2e/steps/study.mjs"],
    writes: ["sessions"],
    tasks: "study",
    e2eStep: "study",
  },
  {
    key: "practice",
    owns: ["app/(browse)/practice/**", "app/(focus)/practice/**", "features/practice/**", "scripts/e2e/steps/practice.mjs", "scripts/fixtures/practice/**"],
    writes: ["practiceSets", "questions", "attempts", "solutions"],
    tasks: "practice",
    e2eStep: "practice",
  },
  {
    key: "guides",
    owns: ["app/(browse)/guides/**", "app/(focus)/export/**", "features/guides/**", "scripts/e2e/steps/guides.mjs", "scripts/fixtures/guides/**"],
    writes: ["guides", "guideSections"],
    tasks: "guide",
    e2eStep: "guides",
  },
] as const satisfies readonly Workstream[];
