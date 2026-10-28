/**
 * Cue architecture: the final type sketch (synthesis of candidates "opus" and "fable").
 *
 * Read docs/architecture.md first. Its usage section is the spec; these types are derived from it.
 * In the app each section becomes the module named in its heading, and only that module's index is
 * importable from outside it. Bodies throw `not implemented`. `// TODO` marks logic that is easy to
 * get wrong. Ownership after the foundation commit is in each heading: F = foundation (frozen for
 * features), T/C/L/S/P/G = Today, Calendar, Lecture notes, Study sessions, Practice, Study guides.
 *
 * Self-contained on purpose (imports only zod's types) so `pnpm typecheck` passes with this file in
 * the tree. Where the app imports a library type (Playwright, lucide), this file uses a local stand-in.
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
/** `review.evt_9f2c.1`, `midweek.CSC148.2026-W44`, `eow.2026-W44`, `prep.evt_x.3`, `work.evt_y.1`, `custom.k3j9`. */
export type BlockId = Brand<string, "BlockId">;
/** `lec.<EventId>` for a scheduled lecture, `lec.adhoc.<id>` otherwise. */
export type LectureId = Brand<string, "LectureId">;
export type LinkId = Brand<string, "LinkId">;
export type SetId = Brand<string, "SetId">;
export type QuestionId = Brand<string, "QuestionId">;
/** `<CourseId>.<slug>`: `ECO101.price-elasticity-of-demand`. The URL carries the slug only. */
export type SectionId = Brand<string, "SectionId">;
export type ChapterId = Brand<string, "ChapterId">;
export type MessageId = Brand<string, "MessageId">;
/** `session:<BlockId>` | `lecture:<LectureId>` | `question:<QuestionId>`. */
export type ThreadKey = Brand<string, "ThreadKey">;
export type HoldId = Brand<string, "HoldId">;

/** Id constructors are the only way to build ids. They keep ids URL-safe and derived from meaning. */
export const ids = {
  course: (code: string): CourseId => todo("ids.course: upper-case, strip spaces and punctuation"),
  eventFromIcs: (uid: string, recurrenceId?: string): EventId => todo("ids.eventFromIcs"),
  eventFromSlot: (course: CourseId, kind: EventKind, start: EpochMs): EventId => todo("ids.eventFromSlot"),
  eventManual: (): EventId => todo("ids.eventManual: random"),
  importBatch: (): ImportId => todo("ids.importBatch: random"),
  material: (sha256Hex: string): MaterialId => todo("ids.material"),
  blob: (sha256Hex: string): BlobId => todo("ids.blob"),
  block: (anchor: BlockAnchor): BlockId => todo("ids.block: see BlockId doc; `of` is not part of the id"),
  lectureForEvent: (event: EventId): LectureId => `lec.${event}` as LectureId,
  adhocLecture: (): LectureId => todo("ids.adhocLecture: lec.adhoc.<random>"),
  set: (): SetId => todo("ids.set: random"),
  question: (set: SetId, n: number): QuestionId => `${set}.q${n}` as QuestionId,
  section: (course: CourseId, slug: string): SectionId => `${course}.${slug}` as SectionId,
  sectionSlug: (id: SectionId): string => todo("ids.sectionSlug"),
  chunk: (key: SourceKey, n: number): ChunkId => `${key}#${n}` as ChunkId,
  message: (): MessageId => todo("ids.message: time-ordered random"),
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §2 Time                                                                         lib/time (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Interval {
  start: EpochMs;
  end: EpochMs;
}

/** Zone arithmetic over wall-clock days, so the 25-hour Sun 1 Nov 2026 in Toronto works. */
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
// §3 Courses, calendar events, imports                    lib/domain/calendar.ts, lib/courses.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Who asserted that a course exists. A course with no source left (and no content) is removed. */
export type CourseSource = ImportId | "manual";

export interface Course {
  id: CourseId;
  code: string; // "CSC148"
  short: string; // "CSC", used in "Mid-week · CSC"
  title?: string;
  instructor?: string; // "Prof. Liu"
  sources: readonly CourseSource[];
}

/** lib/courses.ts: the only writer of `courses`. Calendar, Practice and AddMaterialDialog call it. */
export const courseActions = {
  /** Idempotent: merges by code and adds `by` to `sources`. */
  ensure: (code: string, by: CourseSource, patch?: Partial<Pick<Course, "short" | "title" | "instructor">>): Promise<CourseId> =>
    todo("courses.ensure"),
  /**
   * Undo of an import: removes `by` from every course's sources. A course left with no source is
   * deleted when no material, lecture or practice set references it, else it keeps "manual".
   */
  release: (by: ImportId): Promise<readonly CourseId[]> => todo("courses.release"),
} as const;

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
  /** The sample semester is an import too (SAMPLE.importId). */
  importId: ImportId;
  /** Shared by instances expanded from one RRULE or one weekly timetable slot. */
  seriesId?: string;
}

/** A union by kind, so a deadline cannot have a duration and a note cannot have a room. Written by Calendar. */
export type CalendarEvent =
  | (EventBase & { kind: "lecture"; courseId: CourseId; number?: number; topic?: Topic; location?: string })
  | (EventBase & { kind: "lab"; courseId: CourseId; title: string; location?: string })
  /** label "Term Test 2", short "Test 2" (calendar: "Test 2 prep · 1 of 4"). */
  | (EventBase & { kind: "test"; courseId: CourseId; label: string; short: string; weight: TestWeight; location?: string })
  /** Invariant: end === start === due. Built only by `deadlineEvent()`. label "Problem Set 4", short "PS4". */
  | (EventBase & { kind: "deadline"; courseId: CourseId; label: string; short: string; effort: EffortSize })
  /** Any non-course timed event from a personal calendar. Busy time for the scheduler. */
  | (EventBase & { kind: "busy"; title: string; location?: string })
  /** All-day text: start is the local day start, end the next day start. "Thanksgiving · no class". */
  | (EventBase & { kind: "note"; text: string });

export type TimedEvent = Extract<CalendarEvent, { kind: "lecture" | "lab" | "test" | "busy" }>;

export function deadlineEvent(fields: Omit<Extract<CalendarEvent, { kind: "deadline" }>, "kind" | "end">): CalendarEvent {
  return { ...fields, kind: "deadline", end: fields.start };
}

/** Written by Calendar (and the sample seed). */
export interface ImportBatch {
  id: ImportId;
  at: EpochMs;
  /**
   * The scheduler never places a rule block before this instant for anchors from this import.
   * ICS/vision/manual imports: the import time. The sample: Monday 00:00 after the Paper week, so the
   * Paper weeks are exactly the authored blocks and the rules plan everything after them.
   */
  planFrom: EpochMs;
  source: { kind: "ics"; fileName: string } | { kind: "vision"; materialId: MaterialId } | { kind: "manual" } | { kind: "sample" };
  courses: readonly CourseId[];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §4 Materials                                                   lib/domain/materials.ts, lib/materials (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type MaterialKind = "slides" | "textbook" | "handout" | "problemSet" | "pastPaper" | "notes" | "syllabus" | "other";

export interface Material {
  id: MaterialId;
  courseId: CourseId;
  kind: MaterialKind;
  title: string; // "Lecture 8 slides", "Course notes", "A2 handout"
  short?: string; // "A2 handout", used in chips
  /** Slides and handouts tied to one lecture. One field, so the number cannot disagree with the link. */
  lecture?: { number: number; eventId?: EventId };
  file?: BlobId;
  fileName?: string;
  pageCount: number;
  addedAt: EpochMs;
}

export interface SlideContent {
  heading: string;
  body: string;
  code?: { lang: string; text: string };
}

export interface MaterialPage {
  materialId: MaterialId;
  index: number; // 1-based
  label?: string; // "p. 214", "Q1"
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
  lecture?: Material["lecture"];
  /** "auto": vision only for pages whose text layer is under 200 chars. Past papers use "never" (Practice parses them). */
  vision?: "auto" | "never";
}
/** UI copy comes from lib/materials ("Reading page 4 of 12"), so callers never see pipeline stages. */
export interface IngestProgress {
  done: number;
  total: number;
  message: string;
}

/**
 * The one way a file enters Cue. Resumable and idempotent: the id is the file hash, pages already
 * read are skipped, and indexing replaces the source's chunks in one transaction.
 */
export function ingestFile(file: File, opts: IngestOptions, onProgress?: (p: IngestProgress) => void): Promise<MaterialId> {
  // TODO: hash -> blobs + materials row -> renderPages -> per page: text layer; if thin and vision "auto",
  //       batch up to 3 pages into ai("material.read") -> pages rows -> reindexSource(sourceKey.material(id))
  return todo("ingestFile");
}
/** Re-reads missing or failed pages from the stored file. <Boot> calls it for every pending material. */
export function resumeIngest(id: MaterialId, onProgress?: (p: IngestProgress) => void): Promise<void> {
  return todo("resumeIngest");
}
/** Deletes the material, its pages, blobs and chunks. Citations survive: SourceRef carries DocFacts. */
export function removeMaterial(id: MaterialId): Promise<void> {
  return todo("removeMaterial");
}

/** Derived from rows, never stored. */
export type IngestStatus =
  | { status: "ready" }
  | { status: "pending"; read: number; total: number }
  | { status: "partial"; read: number; failed: number; total: number };
export function ingestStatus(material: Material, pages: readonly MaterialPage[]): IngestStatus {
  return todo("ingestStatus");
}

/** lib/materials/pages.ts (from today's lib/pages.ts): JPEG Blobs, not data URLs. Calendar and Practice reuse it. */
export interface RenderedPage {
  index: number;
  image: Blob;
  width: number;
  height: number;
  text: string;
}
export function renderPages(file: File, opts?: { maxPages?: number; widthPx?: number }): Promise<RenderedPage[]> {
  return todo("renderPages: pdf.js worker or createImageBitmap; 1240–1600 px wide");
}
/** What a vision task receives. */
export interface PageImage {
  page: number;
  image: string; // data URL, made at call time only
  text: string; // text layer, may be empty
}
export function toPageImage(p: RenderedPage): Promise<PageImage> {
  return todo("toPageImage");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §5 Sources and citations                                                   lib/sources.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Display facts copied at citation time, so labels need no lookup and survive deletion. */
export interface DocFacts {
  kind: MaterialKind;
  title: string; // "Lecture 8 slides", "Problem Set 4", "Textbook"
  short?: string;
  lectureNumber?: number;
}

/** The one citation type. Chips, resource rows, footnotes, related cards and plan steps all use it. */
export type SourceRef =
  | { kind: "page"; materialId: MaterialId; doc: DocFacts; page: number; to?: number; label?: string; figure?: string }
  | { kind: "transcript"; lectureId: LectureId; courseId: CourseId; lectureNumber?: number; atMs: number; toMs?: number }
  | { kind: "question"; setId: SetId; questionId: QuestionId; setTitle: string; number: string }
  | { kind: "assessment"; eventId: EventId; label: string; at: EpochMs }
  | { kind: "section"; courseId: CourseId; sectionId: SectionId; title: string };

/** A footnote source: "Used in Problem Set 4, Q1", "Lecture 7 at 18:40, redrawn from the whiteboard sketch". */
export interface FootnoteSource {
  ref: SourceRef;
  relation?: "used" | "tested";
  note?: string;
}

/**
 * The only label formatter. Unit-tested against every Paper string:
 * chip:     "Slide 17", "Transcript 41:05", "A2 handout §3", "Textbook §5.2"
 * meta:     "Lecture 8 slides · Slide 17", "Lecture 8 transcript · 41:05", "Course notes · §5.3"
 * footnote: "Lecture 7 at 4:15", "Lecture 7 slides 6–8", "Textbook ch. 5, p. 92", "Textbook Figure 5-1"
 */
export function sourceLabel(ref: SourceRef, style: "chip" | "meta" | "footnote"): string {
  return todo("sourceLabel");
}
/** "Lecture 7 at 4:15. Textbook ch. 5, p. 92." and "Lecture 7 slides 6–8. Used in Problem Set 4, Q1." */
export function footnoteText(sources: readonly FootnoteSource[]): string {
  return todo("footnoteText");
}

/** Opens a ref without losing the current screen: page and transcript refs open SourcePeek; others navigate. */
export function useOpenSource(): (ref: SourceRef) => void {
  return todo("useOpenSource");
}

/** What a course's guide was written from. stamp = newest material addedAt or lecture savedAt. */
export interface CourseSources {
  stamp: EpochMs;
  newest?: { label: string; at: EpochMs }; // "Lecture 8 added"
}
export function useCourseSources(courseId: CourseId): CourseSources | undefined {
  return todo("useCourseSources");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §6 Retrieval                                                               lib/retrieval (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Only one real embedder. Mock and OpenRouter modes run lexical retrieval only (deterministic). */
export type EmbedderId = "qwen3-embedding-8b@1024";

export interface Chunk {
  id: ChunkId;
  courseId: CourseId;
  sourceKey: SourceKey;
  ref: SourceRef;
  text: string;
  /** Missing = not embedded yet. The indexer fills it in token-factory mode only. */
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
/** Re-chunk one source and replace its rows in one transaction. Idempotent. The only writer of `chunks`. */
export function reindexSource(key: SourceKey): Promise<void> {
  return todo("reindexSource");
}
/** Started by <Boot> in token-factory mode. Embeds chunks missing a vector, batches of 32; backs off; stops on budget. */
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
  prefer?: readonly SourceKey[]; // small boost (the session's lecture)
  /** interactive: the query embedding gets 500 ms, then lexical only. thorough: waits for it. */
  latency?: "interactive" | "thorough";
}

/** Lexical BM25 always; dense cosine when vectors exist; reciprocal-rank fusion; at most 2 per page or transcript minute. */
export function retrieve(q: RetrieveQuery): Promise<Passage[]> {
  return todo("retrieve");
}
/** The live note taker's context: transcript windows read straight from `segments`, no index needed. */
export function livePassages(lectureId: LectureId, fromMs: number): Promise<Passage[]> {
  return todo("livePassages");
}
/** Strips `[S#]` markers, keeps citations in order of first mention, drops ids that were not sent. */
export function parseCitations(text: string, passages: readonly Passage[]): { text: string; citations: SourceRef[] } {
  return todo("parseCitations");
}
/** The one resolver for passage ids returned in structured task output (plans, solutions, guide blocks). */
export function refsFor(passageIds: readonly string[], passages: readonly Passage[]): SourceRef[] {
  return todo("refsFor: unknown ids dropped, order kept, duplicates removed");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §7 Plan: the scheduler and its views                                           lib/plan (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** What a block is for. The block id is derived from this, never from its time. */
export type BlockAnchor =
  /** n 1: the after-lecture review. n 2: the spaced next-day review, only when a test is near. */
  | { kind: "review"; lecture: EventId; n: 1 | 2 }
  | { kind: "midweek"; course: CourseId; week: IsoWeek }
  | { kind: "endOfWeek"; week: IsoWeek }
  | { kind: "testPrep"; test: EventId; index: number; of: number }
  | { kind: "work"; deadline: EventId; index: number; of: number }
  | { kind: "custom"; key: string; course: CourseId | null };

export type BlockKind = BlockAnchor["kind"];

/** Derived, never stored. courseId comes from the anchor (null only for endOfWeek and course-less custom blocks). */
export interface StudyBlock extends Interval {
  id: BlockId;
  anchor: BlockAnchor;
  courseId: CourseId | null;
  topic: Topic;
  note?: string; // "Past paper, timed"
  why: {
    /** Whole local days between the anchor event and this placement: "Review 1 day after lecture". */
    offsetDays: number;
    /** A test within prefs.boostWindowDays lengthened or added this block (Today's subline). */
    boostedBy?: { test: EventId; daysUntil: number };
  };
  placement: "rule" | "pinned" | "authored" | "locked";
}

/** A block whose placement and display were written by hand: the sample's Paper weeks, or a user's custom block. */
export interface AuthoredBlock {
  /** Any anchor kind. An authored block whose anchor matches a rule demand replaces that demand. */
  anchor: BlockAnchor;
  at: Interval;
  topic: Topic;
  note?: string;
}

/** Where a block sits when it is not where the rules would put it. */
export type Placement =
  /** Reschedule or move; also written by Mark done on a rule block, so a done block keeps its time. */
  | { kind: "pinned"; at: Interval }
  /** Hand-written: the sample's Paper weeks, or a user's custom block. Reschedule rewrites `block.at`. */
  | { kind: "authored"; block: AuthoredBlock };

/**
 * The only stored plan state, one row per block id, written only by planActions (and the sample seed).
 * Placement and status are independent facts about one block, so an authored block can be done or
 * rescheduled without losing its authored text. A row is never empty, and done always has a placement.
 */
export type PlanOverride =
  | { blockId: BlockId; placement: Placement; status?: "done" | "skipped"; updatedAt: EpochMs }
  | { blockId: BlockId; placement?: undefined; status: "skipped"; updatedAt: EpochMs };

export interface PlanPrefs {
  dayStart: WallTime; // 08:00
  dayEnd: WallTime; // 22:00
  bufferMin: number; // 15, around fixed timed events
  stepMin: number; // 15, slot granularity
  maxStudyMinPerDay: number; // 240
  review: { baseMin: number; boostedMin: number }; // 30 / 45
  boostWindowDays: number; // 21: a test this close boosts the course's reviews and adds review n 2
  midweekMin: number; // 30
  endOfWeekMin: number; // 90
  prep: Record<TestWeight, { sessions: number; spanDays: number }>; // quiz 0/0, test 4/12, midterm 6/7, exam 8/14
  prepMin: { each: number; last: number }; // 60 / 120 ("Past paper, timed")
  effortMin: Record<EffortSize, number>; // 0 / 120 / 240
  workBlockMaxMin: number; // 120
  /** Lectures start this many minutes past the hour; the note taker's length is the slot minus this. */
  lectureStartsPastMin: number; // 10
}

export interface PlanInput {
  zone: TimeZone;
  window: { from: LocalDate; to: LocalDate };
  courses: readonly Course[];
  events: readonly CalendarEvent[];
  imports: readonly Pick<ImportBatch, "id" | "planFrom">[];
  /** Lecture topic: the Lecture record after notes, else the event's topic, else `Lec 9`. */
  topics: ReadonlyMap<EventId, Topic>;
  overrides: readonly PlanOverride[];
  /** Every session row's snapshot. A block with a session never moves (history stays put). */
  sessions: readonly Pick<StudySession, "id" | "anchor" | "planned" | "topic">[];
  prefs: PlanPrefs;
}

export interface Unplaced {
  blockId: BlockId;
  anchor: BlockAnchor;
  minutes: number;
  reason: "noFreeSlot" | "dailyCap";
}
export interface OverrideConflict {
  blockId: BlockId;
  at: Interval;
  clashesWith: EventId;
}

export interface PlanOutput {
  blocks: readonly StudyBlock[]; // sorted by start, then id
  unplaced: readonly Unplaced[];
  conflicts: readonly OverrideConflict[];
}

/** A block before placement. Internal to lib/plan. */
interface Demand {
  id: BlockId;
  anchor: BlockAnchor;
  topic: Topic;
  minutes: number;
  /** Already clipped to start at the anchor import's planFrom; empty windows produce no demand. */
  allowed: Interval;
  preferredDays: readonly LocalDate[];
  preferredAt: WallTime;
  rank: 1 | 2 | 3 | 4 | 5; // testPrep, work, review, midweek, endOfWeek
  note?: string;
}

/**
 * Pure and deterministic. No clock input, no Date.now(): placement depends on the calendar, imports,
 * overrides, sessions and prefs only, so a past block stays where it was and becomes "missed".
 */
export function schedule(input: PlanInput): PlanOutput {
  // TODO: 1. busy map per local day: timed events ± bufferMin (zone-aware wall times, DST-safe)
  //       2. fixed placements first: sessions (locked), then done overrides (locked even if they now
  //          conflict), then pinned, then authored. A pinned/authored block that overlaps a fixed event ->
  //          conflicts; pinned re-places by rule, authored custom -> unplaced
  //       3. demands(input): review n1/n2, midweek, endOfWeek, testPrep, work; clip each to planFrom;
  //          drop demands whose id is already fixed in step 2
  //       4. sort by (rank, allowed.end, id); first fit per demand (findSlotFor)
  //       5. drop skipped; collect unplaced
  const demands: Demand[] = [];
  return todo(`schedule (${demands.length} demands)`);
}

/** First free interval of `minutes` after `after` (and before `before`), using schedule's rules. */
export function findSlot(input: PlanInput, minutes: number, range: { after: EpochMs; before?: EpochMs }): Interval | null {
  return todo("findSlot");
}

export type BlockStatus = "upcoming" | "now" | "inProgress" | "done" | "missed" | "skipped";

/** Derived. skipped > done (session completed/ended, or override status done) > inProgress > now > missed > upcoming. */
export function blockStatus(block: StudyBlock, ctx: { now: EpochMs; session?: StudySession; override?: PlanOverride }): BlockStatus {
  return todo("blockStatus");
}

/** calendar: "Review · Recursion", "A2 final push"; timeline: "Review — Recursion & tree traversal"; card: "Recursion & tree traversal". */
export function blockTitle(block: StudyBlock, style: "calendar" | "timeline" | "card"): string {
  return todo("blockTitle");
}
/** trailing: "After-lecture · 45m", "Mid-week · 30m", "Due Thu · 2h"; sentence: "Review 1 day after lecture". */
export function blockReasonText(block: StudyBlock, style: "trailing" | "sentence"): string {
  return todo("blockReasonText");
}

/** Stemmed token overlap ≥ 0.5 of the smaller set: "Recursion & trees" matches "Recursion & tree traversal". */
export function topicMatch(a: string, b: string): boolean {
  return todo("topicMatch");
}

export interface BlockMaterials {
  materials: readonly { materialId: MaterialId; label: string; ref: SourceRef }[]; // "Lecture 8 slides", "Lab 6 handout"
  transcript?: { lectureId: LectureId; label: string }; // "Lecture 8 transcript"
  practice: { count: number; setId?: SetId; topic: string }; // "+ 12 practice Qs"
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
  conflicts: readonly OverrideConflict[];
  status(block: StudyBlock): BlockStatus;
  /** No courses and no events at all: show the first-run state. */
  isEmpty: boolean;
}

export type PlanRange = { day: EpochMs | LocalDate } | { week: IsoWeek } | { month: `${number}-${number}` } | Interval;

/**
 * Reads every plan input with useLive and runs schedule() for the whole window (earliest planFrom or
 * authored block to the last event + 7 days). Memoized on a fingerprint of the inputs, so a lecture
 * heartbeat that changes no topic does not re-run the scheduler.
 */
export function usePlan(range: PlanRange): PlanView | undefined {
  return todo("usePlan");
}

/** The only writer of `overrides`. Every action is idempotent. */
export const planActions = {
  /** Moves the block to the next free slot after `after` (pins it, or rewrites an authored block's `at`); null when nothing fits within 7 days. */
  reschedule: (blockId: BlockId, opts: { after: EpochMs }): Promise<Interval | null> => todo("reschedule"),
  /** Rejects an interval that overlaps fixed busy time. */
  move: (blockId: BlockId, at: Interval): Promise<void> => todo("move"),
  /** Sets status done; pins a rule block at its current placement so it never moves afterwards. */
  markDone: (blockId: BlockId): Promise<void> => todo("markDone"),
  skip: (blockId: BlockId): Promise<void> => todo("skip"),
  /** Clears the status; deletes the row when no placement is left. */
  restore: (blockId: BlockId): Promise<void> => todo("restore"),
  addCustom: (fields: { course: CourseId | null; topic: Topic; at: Interval; note?: string }): Promise<BlockId> => todo("addCustom"),
  /** Saved notes' "Review now": a custom block now, 45 min, for that lecture. Idempotent per lecture per day. */
  reviewNow: (lectureId: LectureId, now: EpochMs): Promise<BlockId> => todo("reviewNow"),
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §8 Study sessions        lib/domain/study.ts (F); payload lib/domain/payload/study.ts (S after hand-off)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type AskMode = "quick" | "deep";
export type StepKind = "recall" | "reread" | "explain" | "practice" | "reflect";
export type ViewerTab = "slides" | "transcript" | "textbook" | "handout";

/** payload/study.ts (S). */
export interface PlanStep {
  title: string; // "Re-read key slides"
  kind: StepKind;
  minutes: number;
  source?: SourceRef; // slides 12–17
  check?: string; // "Why does preorder need the empty-tree check first?"
}
/** payload/study.ts (S). Step minutes sum to the block's focus minutes (block minus Pomodoro breaks). */
export interface SessionPlan {
  steps: readonly PlanStep[];
  /** The transcript moment shown under the material. */
  moment?: { ref: Extract<SourceRef, { kind: "transcript" }>; quote: string; examHint: boolean };
}

/** Timer as timestamps. Time left is derived, so nothing ticks into the database. */
export type SessionState =
  | { status: "running"; startedAt: EpochMs; pausedMs: number }
  | { status: "paused"; startedAt: EpochMs; pausedAt: EpochMs; pausedMs: number }
  | { status: "completed"; startedAt: EpochMs; endedAt: EpochMs; pausedMs: number }
  | { status: "ended"; startedAt: EpochMs; endedAt: EpochMs; pausedMs: number };

/** Exists only once a block is started. Written only by Study. Opening /study/[blockId] twice finds this row. */
export interface StudySession {
  id: BlockId;
  /** Snapshot of the block, so history survives calendar changes and schedule() can lock it in place. */
  anchor: BlockAnchor;
  planned: Interval;
  courseId: CourseId | null;
  topic: Topic;
  minutes: number;
  lectureId?: LectureId;
  /** Missing = not generated yet. Generation runs in memory and restarts after a reload. */
  plan?: SessionPlan;
  state: SessionState;
  /** Index into plan.steps; transitions clamp it to the plan's length. */
  step: number;
  /** Elapsed ms when the current step began, for "Over by 1 min". */
  stepSince: number;
  stepsDone: readonly number[];
  mode: AskMode;
  viewer: { tab: ViewerTab; ref?: SourceRef };
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface PomodoroPrefs {
  focusMin: number; // 25
  breakMin: number; // 5
}

export interface SessionClock {
  elapsedMs: number;
  leftMs: number; // negative when over
  fraction: number; // 0..1, the 160px bar
  phase: "focus" | "break" | "over";
  phaseLeftMs: number; // "Break · 4:12 left"
  stepOverMs: number; // > 0: "Over by 1 min"
}

/** Pure. Pomodoro phase from elapsed time: focus/break cycles inside the block. */
export function sessionClock(s: StudySession, now: EpochMs, pomodoro: PomodoroPrefs): SessionClock {
  return todo("sessionClock");
}

/** Pure transitions; each returns the same state when it does not apply (idempotent). */
export const sessionTransitions = {
  start: (block: StudyBlock, now: EpochMs, opts: { lectureId?: LectureId; plan?: SessionPlan; mode: AskMode }): StudySession =>
    todo("start"),
  pause: (s: StudySession, now: EpochMs): StudySession => todo("pause"),
  resume: (s: StudySession, now: EpochMs): StudySession => todo("resume"),
  gotoStep: (s: StudySession, step: number, now: EpochMs): StudySession => todo("gotoStep"),
  nextStep: (s: StudySession, now: EpochMs): StudySession => todo("nextStep: completes on the last step"),
  end: (s: StudySession, now: EpochMs): StudySession => todo("end: completed if all steps done, else ended"),
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §9 Lectures and transcription   lib/domain/lectures.ts (F); payload lib/domain/payload/lectures.ts (L)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type EngineId = "parakeet" | "demo";

/** Written only by Lectures. `capturedMs` is audio captured before the current run began. */
export type LectureState =
  | { status: "ready" }
  | { status: "recording"; engine: EngineId; since: EpochMs; capturedMs: number; heartbeatAt: EpochMs }
  | { status: "paused"; engine: EngineId; capturedMs: number }
  | { status: "saved"; savedAt: EpochMs; capturedMs: number };

/** payload/lectures.ts (L). Written once by the end-of-lecture pass. Exam hints are not copied here: they are flagged segments. */
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

/** Durable transcription queue: 16 kHz mono 16-bit WAV per cut. Deleted once the lecture is saved and fully transcribed. */
export interface AudioChunk {
  lectureId: LectureId;
  seq: number;
  startMs: number;
  durationMs: number;
  wav: Blob;
  transcribedAt?: EpochMs;
}

export interface DemoScript {
  lines: readonly { atMs: number; raw: string }[];
  partialEveryMs: number;
}

export type EngineSource =
  | { kind: "mic"; stream: MediaStream; resumeAtMs: number }
  | { kind: "script"; script: DemoScript; resumeAtMs: number };

export type EngineEvent =
  /** Only when capabilities.partials: Parakeet re-decodes the open buffer every 3 s on WebGPU; never on WASM. */
  | { type: "partial"; atMs: number; text: string }
  | { type: "final"; chunkSeq: number; atMs: number; endMs: number; raw: string }
  | { type: "audio"; chunk: Omit<AudioChunk, "lectureId" | "transcribedAt"> }
  | { type: "level"; rms: number };

/**
 * Engine behind the note taker. Parakeet: AudioWorklet capture at 16 kHz mono, cut at the quietest
 * 200 ms between 12 and 18 s (hard cut at 18 s), transformers.js `onnx-community/parakeet-ctc-0.6b-ONNX`
 * (q4f16, 454 MB) in a Web Worker, WebGPU with WASM fallback. Demo: replays a script on timers that
 * Playwright's clock drives. Pause aborts run(); resume calls run() again with resumeAtMs.
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
// §10 Practice          lib/domain/practice.ts (F); payload lib/domain/payload/practice.ts (P after hand-off)
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

/** Where "Write questions" takes its material from. Travels in the URL as base64url JSON. */
export type GenerationScope =
  | { kind: "topic"; courseId: CourseId; topic: string | "missedMost"; missedOnly: boolean; count: 3 | 5 | 10; note?: string }
  | { kind: "similar"; questionId: QuestionId }
  | { kind: "section"; courseId: CourseId; sectionId: SectionId }
  | { kind: "message"; courseId: CourseId; messageId: MessageId };

export interface PracticeSet {
  id: SetId;
  courseId: CourseId | null;
  title: string; // "2024 Midterm"
  origin: { kind: "paper"; materialId: MaterialId } | { kind: "generated"; scope: GenerationScope };
  /** current is null while a generated set is still empty. */
  view: { current: QuestionId | null; topic: string | null };
  createdAt: EpochMs;
}

/** The single source of truth for grading. An answer cannot exist without saying where it came from. */
export type AnswerKey = { source: "document"; answer: string } | { source: "model"; answer: string } | { source: "none" };

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
  key: AnswerKey;
  figure?: Figure;
  origin: { kind: "paper" } | { kind: "generated"; from: readonly SourceRef[] };
}

/** Only the choice is stored. */
export interface Attempt {
  questionId: QuestionId;
  setId: SetId;
  choice: string;
  at: EpochMs;
}

export type Grade = { status: "unanswered" } | { status: "checking"; choice: string } | { status: "answered"; choice: string; correct: boolean };

/** Derived: checking means a choice exists and no key is known yet. Survives reloads. */
export function gradeOf(q: Question, attempt: Attempt | undefined): Grade {
  if (!attempt) return { status: "unanswered" };
  if (q.key.source === "none") return { status: "checking", choice: attempt.choice };
  return { status: "answered", choice: attempt.choice, correct: attempt.choice === q.key.answer };
}

/** payload/practice.ts (P). A row exists or it doesn't; loading and errors live in memory. */
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
// §11 Study guides        lib/domain/guides.ts (F); payload lib/domain/payload/guides.ts (G after hand-off)
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
  /** Drives `/guides` (most recently read course) and the course select (its last section). */
  lastRead?: { sectionId: SectionId; at: EpochMs };
}

export type FootnoteN = number;
export interface Point {
  x: number;
  y: number;
}

/** payload/guides.ts (G). Charts are data. "levels" reproduces Paper's demand panels exactly (study-guide.md §3.3). */
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

/** payload/guides.ts (G). Footnote markers are refs on blocks, never characters in strings. */
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
  /** Plain text of the blocks, so Practice can generate questions without knowing GuideBlock. */
  plainText: string;
  generatedAt: EpochMs;
  /** CourseSources.stamp when written. */
  sourceStamp: EpochMs;
}

export interface GuideSection {
  id: SectionId;
  courseId: CourseId;
  chapterId: ChapterId;
  order: number;
  title: string;
  /** Missing = not written yet. */
  draft?: GuideDraft;
  /** The last write or rewrite failed. With a draft present, the old draft stays on screen beside the error. */
  lastError?: { kind: AiErrorKind; at: EpochMs };
}

/** Derived: newer material or a newer saved lecture than the draft used. */
export function sectionStale(section: GuideSection, sources: CourseSources): { stale: false } | { stale: true; because: string } {
  if (!section.draft || sources.stamp <= section.draft.sourceStamp) return { stale: false };
  return { stale: true, because: sources.newest ? `${sources.newest.label} added` : "New material added" };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §12 Chat                                                                       lib/chat (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** One row per settled message; written once when the reply finishes or is stopped, never per token. */
export interface ChatMessage {
  id: MessageId;
  thread: ThreadKey;
  courseId: CourseId | null;
  role: "user" | "assistant";
  text: string; // citation markers removed
  citations: readonly SourceRef[];
  mode?: AskMode;
  at: EpochMs;
  savedToGuideAt?: EpochMs; // "Add to study guide"; Guides reads these per course
}

/** The four ask contexts the screens draw. Each maps to one prompt and one context source in lib/chat. */
export type AskScope =
  /** Study session. courseId null = all courses (end-of-week review). */
  | { kind: "study"; courseId: CourseId | null; lectureId?: LectureId; focus?: SourceRef }
  /** Note taker: "Uses the last 5 minutes" (livePassages). */
  | { kind: "liveLecture"; lectureId: LectureId; windowMs: number }
  /** Saved notes: "Uses the whole lecture". Same thread as the live scope, so "Your questions" is one list. */
  | { kind: "lecture"; lectureId: LectureId }
  /** Practice "Ask why": hints only until answered. */
  | { kind: "question"; questionId: QuestionId };

export const threadKey = {
  session: (id: BlockId): ThreadKey => `session:${id}` as ThreadKey,
  lecture: (id: LectureId): ThreadKey => `lecture:${id}` as ThreadKey,
  question: (id: QuestionId): ThreadKey => `question:${id}` as ThreadKey,
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

/** Context for the scope, the scope's prompt, streaming, stop, citation parsing, persistence. */
export function useChat(opts: { thread: ThreadKey; scope: AskScope; defaultMode?: AskMode }): ChatHandle {
  return todo("useChat");
}

/** components/cue/chat/ChatThread props. onOpenSource returns true when the screen handled the ref itself. */
export interface ChatThreadProps {
  chat: ChatHandle;
  followUps?: (message: ChatMessage) => unknown;
  onOpenSource?: (ref: SourceRef) => boolean;
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
/** Routes set maxDuration 300; every attempt, retry and repair of one call fits inside this. */
export const ROUTE_BUDGET_MS = 280_000;
/** Longer than ROUTE_BUDGET_MS, so a hold outlives any live call. An expired unsettled hold is charged in full. */
export const HOLD_TTL_MS = 600_000;

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

/** What a stream task yields on the client. The NDJSON wire format is private to lib/ai. */
export type StreamEvent = { type: "text"; delta: string } | { type: "thinking"; delta: string } | { type: "done" };

interface TaskCommon<I> {
  input: z.ZodType<I>;
  /** Posted by scripts/check-nemotron.mjs against the live provider. */
  example: I;
  maxTokens: number | ((input: I) => number);
  /** Overrides the profile's temperature. */
  temperature?: number;
}

/** One JSON object. response_format's JSON schema is derived from `output` with z.toJSONSchema. */
export interface JsonTask<I, O> extends TaskCommon<I> {
  kind: "json";
  profile: ChatProfileKey;
  output: z.ZodType<O>;
  prompt(input: I): Prompt;
  mock(input: I): O | Promise<O>;
}

/**
 * A JSON object `{ items: T[] }` streamed item by item: the server parses each completed array
 * element as it arrives, validates it with `item`, and forwards it. An invalid item is dropped;
 * zero valid items is `bad_output`. Used where the UI fills in as results land.
 */
export interface ListTask<I, T> extends TaskCommon<I> {
  kind: "list";
  profile: ChatProfileKey;
  item: z.ZodType<T>;
  maxItems: number;
  prompt(input: I): Prompt;
  mock(input: I): readonly T[];
}

/** Free text with optional thinking. `profile` may depend on the input (ask: Quick → chat, Deep → reason). */
export interface StreamTask<I> extends TaskCommon<I> {
  kind: "stream";
  profile: ChatProfileKey | ((input: I) => ChatProfileKey);
  prompt(input: I): Prompt;
  mock(input: I): AsyncIterable<StreamEvent>;
}

export interface EmbedInput {
  texts: readonly string[]; // up to 32
  as: "document" | "query"; // queries get the Instruct prefix
}
export interface EmbedOutput {
  vectors: readonly Float32Array[]; // base64 float32 on the wire
}
export interface EmbedTask extends TaskCommon<EmbedInput> {
  kind: "embed";
  profile: "embed";
  /** Used by check-nemotron in mock mode only; the app never embeds in mock mode. */
  mock(input: EmbedInput): EmbedOutput;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance: the registry keeps each task's real types
export type AnyTask = JsonTask<any, any> | ListTask<any, any> | StreamTask<any> | EmbedTask;

export function jsonTask<I, O>(t: Omit<JsonTask<I, O>, "kind">): JsonTask<I, O> {
  return { ...t, kind: "json" };
}
export function listTask<I, T>(t: Omit<ListTask<I, T>, "kind">): ListTask<I, T> {
  return { ...t, kind: "list" };
}
export function streamTask<I>(t: Omit<StreamTask<I>, "kind">): StreamTask<I> {
  return { ...t, kind: "stream" };
}
export function embedTask(t: Omit<EmbedTask, "kind" | "profile">): EmbedTask {
  return { ...t, kind: "embed", profile: "embed" };
}

/** Prefixes every key, so `defineTasks("lecture", { clean })` registers `lecture.clean`. Server-only module. */
export function defineTasks<P extends string, T extends Record<string, AnyTask>>(
  prefix: P,
  tasks: T,
): { [K in keyof T & string as `${P}.${K}`]: T[K] } {
  return Object.fromEntries(Object.entries(tasks).map(([k, v]) => [`${prefix}.${k}`, v])) as never;
}

/**
 * lib/ai/registry.ts: `export const registry = { ...chatTasks, ...retrievalTasks, ...materialTasks,
 * ...todayTasks, ...calendarTasks, ...lectureTasks, ...studyTasks, ...practiceTasks, ...guideTasks }`.
 * Declared here with the type that spread produces; in the app every type below is derived from it.
 */
export declare const registry: {
  readonly ask: StreamTask<AskInput>;
  readonly embed: EmbedTask;
  readonly "material.read": JsonTask<MaterialReadInput, MaterialReadOutput>;
  readonly "today.brief": JsonTask<TodayBriefInput, TodayBriefOutput>;
  readonly "calendar.read": JsonTask<CalendarReadInput, TimetableRead>;
  readonly "lecture.clean": JsonTask<LectureCleanInput, LectureCleanOutput>;
  readonly "lecture.hints": JsonTask<LectureHintsInput, LectureHintsOutput>;
  readonly "lecture.notes": JsonTask<LectureNotesInput, LectureNotesOutput>;
  readonly "study.plan": JsonTask<StudyPlanInput, StudyPlanOutput>;
  readonly "practice.parse": JsonTask<PracticeParseInput, PaperChunkRead>;
  readonly "practice.solve": JsonTask<SolveInput, SolveOutput>;
  readonly "practice.generate": ListTask<GenerateInput, GeneratedQuestion>;
  readonly "practice.check": JsonTask<CheckInput, CheckOutput>;
  readonly "guide.outline": JsonTask<GuideOutlineInput, GuideOutlineOutput>;
  readonly "guide.section": ListTask<GuideSectionInput, GuideBlockDraft>;
};

export type Registry = typeof registry;
export type TaskName = keyof Registry;
export type TaskInput<N extends TaskName> = Registry[N] extends { example: infer I } ? I : never;
export type JsonTaskName = { [N in TaskName]: Registry[N] extends { kind: "json" | "embed" } ? N : never }[TaskName];
export type ListTaskName = { [N in TaskName]: Registry[N] extends { kind: "list" } ? N : never }[TaskName];
export type StreamTaskName = { [N in TaskName]: Registry[N] extends { kind: "stream" } ? N : never }[TaskName];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TaskOutput<N extends JsonTaskName> = Registry[N] extends JsonTask<any, infer O> ? O : Registry[N] extends EmbedTask ? EmbedOutput : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TaskItem<N extends ListTaskName> = Registry[N] extends ListTask<any, infer T> ? T : never;

// Task payloads. Each task file owns the zod schema that is the real gate; these are its inferred types.

/** Cite passages in structured output with these ids; resolve them with `refsFor`. */
export type PassageId = Passage["id"];

export interface AskInput {
  scope: AskScope["kind"];
  mode: AskMode;
  question: string;
  history: readonly { role: "user" | "assistant"; text: string }[];
  passages: readonly Passage[];
  /** Scope facts the prompt needs: step title, question stem and options, whether it is answered. */
  subject: { title: string; lines: readonly string[]; hideAnswer: boolean };
}
export interface MaterialReadInput {
  pages: readonly PageImage[]; // at most 3
}
export interface MaterialPageRead {
  page: number;
  text: string;
  slide?: SlideContent;
  section?: string;
  label?: string;
}
export interface MaterialReadOutput {
  pages: readonly MaterialPageRead[];
}
export interface TodayBriefInput {
  sessions: readonly { title: string; reason: string }[];
  nextTest?: { course: string; label: string; daysUntil: number };
  ruleBased: { headline: string; subline: string };
}
export interface TodayBriefOutput {
  headline: string;
  subline: string;
}
export interface CalendarReadInput {
  pages: readonly PageImage[];
  termStart: LocalDate;
}
/** Strict schema: day enum and HH:MM pattern. Code validates times and expands meetings over the term. */
export interface TimetableRead {
  courses: readonly {
    code: string;
    title?: string;
    instructor?: string;
    meetings: readonly { kind: "lecture" | "lab"; day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"; start: string; end: string; room?: string }[];
  }[];
  dated: readonly { code: string; kind: "deadline" | "test"; label: string; date: string; time?: string }[];
}
export interface LectureCleanInput {
  raw: string; // one audio chunk of CTC text, max 4,000 chars
  before: string; // the previous cleaned sentence, for continuity
}
export interface LectureCleanOutput {
  sentences: readonly string[];
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
export interface LectureNotesOutput {
  summary: string;
  keyPoints: readonly { atMs: number; text: string }[];
}
export interface StudyPlanInput {
  block: { kind: BlockKind; minutes: number; focusMinutes: number; title: string; why: StudyBlock["why"] };
  passages: readonly Passage[];
  flagged: readonly { atMs: number; quote: string }[];
  practiceCount: number;
}
export interface StudyPlanOutput {
  steps: readonly { title: string; kind: StepKind; minutes: number; source?: PassageId; check?: string }[];
  moment?: PassageId;
}
export interface PracticeParseInput {
  pages: readonly PageImage[]; // at most 3
  totalPages: number;
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
  resources: readonly PassageId[];
}
export interface GenerateInput {
  scope: GenerationScope;
  style: readonly { prompt: string; options: readonly Option[] }[]; // up to 6 from the paper
  passages: readonly Passage[];
  count: number;
  note?: string;
}
export interface GeneratedQuestion {
  topic: string;
  prompt: string;
  options: readonly Option[];
  answer: string;
  whyNot: Readonly<Record<string, string>>;
  steps: readonly { label: string; text: string }[];
  sources: readonly PassageId[];
}
export interface CheckInput {
  prompt: string;
  options: readonly Option[];
}
export interface CheckOutput {
  answer: string;
}
export interface GuideOutlineInput {
  course: CourseId;
  materials: readonly { title: string; kind: MaterialKind; headings: readonly string[] }[];
  lectures: readonly { number?: number; topic?: string }[];
}
export interface GuideOutlineOutput {
  chapters: readonly { title: string; textbookChapter?: number; sections: readonly string[] }[];
}
export interface GuideSectionInput {
  course: CourseId;
  chapter: string;
  section: string;
  passages: readonly Passage[];
  hints: readonly { quote: string; attribution: string; assessment?: string }[];
  savedAnswers: readonly string[];
}
/** How the model cites inside a guide block: one footnote per block, one entry per source. */
export interface CiteDraft {
  passage: PassageId;
  relation?: "used" | "tested";
  note?: string; // "redrawn from the whiteboard sketch"
}
type CiteByPassage<B> = { [K in keyof B]: K extends "refs" | "noteRefs" ? readonly CiteDraft[] : B[K] };
/** A GuideBlock as the model writes it; the client numbers the cites into footnotes. */
export type GuideBlockDraft = GuideBlock extends infer B ? (B extends GuideBlock ? CiteByPassage<B> : never) : never;

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
export function aiItems<N extends ListTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): AsyncIterable<TaskItem<N>> {
  return todo("aiItems: read NDJSON item lines; an error line throws AiError");
}
export function aiStream<N extends StreamTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): AsyncIterable<StreamEvent> {
  return todo("aiStream: read NDJSON lines; an error line throws AiError");
}

export type AiMode = "token-factory" | "openrouter" | "mock";
export interface AiStatus {
  mode: AiMode;
  embedder: EmbedderId | null; // null: lexical retrieval only
  spend?: { spentUsd: number; capUsd: number }; // Token Factory only
}
export function useAiStatus(): AiStatus | undefined {
  return todo("useAiStatus: GET /api/status, revalidated after each settled call");
}

// Server side (lib/ai/server/*, `import "server-only"`).

export interface LedgerStore {
  /**
   * Atomic across instances: charge expired unsettled holds at their full amount, sum live holds,
   * refuse if spent + held + hold > cap, else add the hold.
   */
  reserve(hold: { id: HoldId; amount: MicroUsd; expiresAt: EpochMs }, cap: MicroUsd, now: EpochMs): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  /** Idempotent. A live hold is replaced by `actual`; an expired-and-charged hold is corrected down to `actual`. */
  settle(holdId: HoldId, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<{ spent: MicroUsd; held: MicroUsd; calls: number }>;
}

/** Local dev: today's JSON file and promise queue, in micro-dollars. Fails closed on a corrupt file. */
export declare class FileLedger implements LedgerStore {
  constructor(path: string);
  reserve(hold: { id: HoldId; amount: MicroUsd; expiresAt: EpochMs }, cap: MicroUsd, now: EpochMs): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  settle(holdId: HoldId, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<{ spent: MicroUsd; held: MicroUsd; calls: number }>;
}
/** Vercel: Upstash Redis REST, reserve and settle as Lua scripts. Ships behind UPSTASH_REDIS_REST_URL. */
export declare class RedisLedger implements LedgerStore {
  constructor(url: string, token: string);
  reserve(hold: { id: HoldId; amount: MicroUsd; expiresAt: EpochMs }, cap: MicroUsd, now: EpochMs): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  settle(holdId: HoldId, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<{ spent: MicroUsd; held: MicroUsd; calls: number }>;
}

/** Per-client request limit on the public route (same store as the ledger; memory locally). */
export interface ClientThrottle {
  take(clientKey: string, now: EpochMs): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>;
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
 * The gateway, called by app/api/ai/[task]/route.ts. Same-origin check and client throttle, input
 * validation, mock or provider call. Attempts share ROUTE_BUDGET_MS: each reserves its own worst case
 * (SDK maxRetries 0, req.signal passed through); stream and list tasks retry only before their first
 * forwarded byte. JSON output gets one repair attempt. Errors map to { error } with 400/402/413/429/500/502.
 */
export function runTask(name: string, body: unknown, ctx: { signal: AbortSignal; clientKey: string; origin: string | null; host: string }): Promise<Response> {
  return todo("runTask");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §14 Database                                                             lib/db, lib/prefs.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type WorkstreamKey = "today" | "calendar" | "lectures" | "study" | "practice" | "guides";
export type Owner = "foundation" | WorkstreamKey;

/** One typed slice per owner. lib/prefs is the only writer; lint lets features/<x> write only slice "<x>". */
export interface PrefsByOwner {
  foundation: { zone: TimeZone; plan: PlanPrefs; sample?: { seededAt: EpochMs; scenario: SampleScenario } };
  today: Record<string, never>;
  calendar: Record<string, never>;
  lectures: { engine: EngineId; parakeetConsentAt?: EpochMs };
  study: { pomodoro: PomodoroPrefs; defaultMode: AskMode };
  practice: Record<string, never>;
  guides: Record<string, never>;
}
export type PrefsRow = { [O in Owner]: { owner: O } & PrefsByOwner[O] }[Owner];

export function usePrefs<O extends Owner>(owner: O): PrefsByOwner[O] | undefined {
  return todo("usePrefs");
}
export function setPrefs<O extends Owner>(owner: O, patch: Partial<PrefsByOwner[O]>): Promise<void> {
  return todo("setPrefs");
}

export interface BlobRow {
  id: BlobId;
  blob: Blob;
  type: string;
}

/** Row type per table. Dexie's `EntityTable<Row, Key>` is built from this map. */
export interface Tables {
  prefs: PrefsRow;
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

type Leaf = string | number | boolean | bigint | Blob | Float32Array | ReadonlyArray<unknown> | null | undefined;
type KeysOf<T> = T extends unknown ? keyof T & string : never;
/** Dexie key paths of a row type, one level deep: "id", "state.status". A renamed field fails typecheck here. */
export type KeyPath<T> = T extends unknown
  ? { [K in keyof T & string]-?: K | (NonNullable<T[K]> extends Leaf ? never : `${K}.${KeysOf<NonNullable<T[K]>>}`) }[keyof T & string]
  : never;
type IndexEntry<T> = KeyPath<T> | `[${KeyPath<T>}+${KeyPath<T>}]`;
/** Primary key first. lib/db joins entries with ", " for Dexie. */
export type IndexSpec<T> = readonly [primary: IndexEntry<T>, ...secondary: IndexEntry<T>[]];

/** All tables exist from the first foundation commit. Features never bump the version; a new index is a change request. */
export const SCHEMA_V1 = {
  prefs: ["owner"],
  courses: ["id"],
  events: ["id", "kind", "start", "courseId", "importId", "seriesId"],
  imports: ["id"],
  overrides: ["blockId", "status"],
  materials: ["id", "courseId", "kind", "lecture.eventId"],
  pages: ["[materialId+index]", "materialId"],
  blobs: ["id"],
  chunks: ["id", "courseId", "sourceKey"],
  lectures: ["id", "courseId", "eventId", "state.status"],
  segments: ["[lectureId+seq]", "lectureId"],
  links: ["id", "lectureId"],
  audio: ["[lectureId+seq]", "lectureId"],
  sessions: ["id", "state.status", "courseId"],
  messages: ["id", "thread", "[thread+at]", "courseId", "savedToGuideAt"],
  practiceSets: ["id", "courseId"],
  questions: ["id", "setId", "[setId+order]"],
  attempts: ["questionId", "setId"],
  solutions: ["questionId"],
  guides: ["courseId"],
  guideSections: ["id", "courseId", "[courseId+order]"],
} as const satisfies { [K in TableName]: IndexSpec<Tables[K]> };

/** Dexie liveQuery as a hook; undefined until the first answer. lib/db imports "client-only". */
export function useLive<T>(query: () => Promise<T> | T, deps: readonly unknown[]): T | undefined {
  return todo("useLive");
}

/** Shell badges read the database, never feature code. */
export function useLiveActivity(now: EpochMs): { recording?: { lecture: Lecture; live: LectureLive }; session?: { session: StudySession; leftMs: number } } | undefined {
  return todo("useLiveActivity");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §15 Routes, nav and shared test ids                              lib/routes.ts, lib/testids.ts (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type CalendarView = "day" | "week" | "month";

/** Every cross-feature link is built here. Features parse their own search params. */
export const href = {
  today: (): string => "/",
  calendar: (p?: { view?: CalendarView; date?: LocalDate; add?: true }): string => todo("href.calendar"),
  studyIndex: (): string => "/study",
  /** Without `start` the page is a read-only preview and creates no session. */
  study: (block: BlockId, p?: { start?: true; tab?: ViewerTab }): string => todo("href.study"),
  lectures: (): string => "/lectures",
  lecture: (id: LectureId, p?: { atMs?: number }): string => todo("href.lecture"),
  practice: (p?: { generate?: GenerationScope }): string => todo("href.practice: scope as base64url JSON"),
  practiceSet: (id: SetId, p?: { q?: QuestionId; topic?: string }): string => todo("href.practiceSet"),
  guides: (): string => "/guides",
  guide: (course: CourseId, section?: SectionId): string => (section ? `/guides/${course}/${ids.sectionSlug(section)}` : `/guides/${course}`),
  guideExport: (course: CourseId): string => `/export/guide/${course}`,
} as const;

/** In the app `icon` is the lucide component itself (`icon: Sun`); a name here only because this sketch imports nothing but zod. */
export const NAV = [
  { key: "today", label: "Today", href: href.today(), icon: "Sun" },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "Calendar" },
  { key: "study", label: "Study sessions", href: href.studyIndex(), icon: "BookOpen" },
  { key: "lectures", label: "Lecture notes", href: href.lectures(), icon: "Mic" },
  { key: "practice", label: "Practice", href: "/practice", icon: "SquareCheckBig" },
  { key: "guides", label: "Study guides", href: href.guides(), icon: "FileText" },
] as const;
// TODO: "/calendar" and "/practice" call href.calendar() / href.practice() in the app; literal here only because those bodies are stubs.

/**
 * Shared test ids, only for regions with no role. Each feature keeps its own in features/<x>/testids.ts
 * (plain constants, no imports), which its step file imports directly.
 */
export const TID = {
  shell: { spend: "shell-spend", main: "shell-main" },
  chat: { thread: "chat-thread" },
  source: { peek: "source-peek" },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §16 Sample semester              lib/sample/{index,ids,core}.ts (F); lib/sample/<feature>.ts (feature)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** default: Tue 27 Oct as drawn on Today. liveLecture: the Tue MAT137 lecture paused at 37:30, for the Paper note-taker state. */
export type SampleScenario = "default" | "liveLecture";

/** Stable ids, independent of the date, so mocks and walkthrough steps can name sample rows. */
export const SAMPLE = {
  importId: "imp_sample" as ImportId,
  courses: { csc148: "CSC148" as CourseId, mat137: "MAT137" as CourseId, eco101: "ECO101" as CourseId, psy100: "PSY100" as CourseId },
  events: {
    csc148Lecture8: "evt_sample_csc148_l08" as EventId, // Mon 10–11am, BA 1160, "Recursion & tree traversal"
    mat137LectureTue: "evt_sample_mat137_tue" as EventId, // Tue 9–10am, "Integration by parts", transcript ready
    mat137LectureThu: "evt_sample_mat137_thu" as EventId, // Thu 9–10am, ready to record
    csc148Midterm: "evt_sample_csc148_midterm" as EventId, // Fri 6 Nov ("in 10 days")
    mat137TermTest2: "evt_sample_mat137_tt2" as EventId, // Fri 13 Nov
  },
  blocks: {
    recursionReview: "review.evt_sample_csc148_l08.2" as BlockId, // Tue 10:30–11:15, the Paper "Next up"
  },
  materials: { csc148L8Slides: "mat_sample_csc148_l08_slides" as MaterialId, eco101Textbook: "mat_sample_eco101_text" as MaterialId },
  sets: { csc148Midterm2024: "set_sample_csc148_2024mt" as SetId },
  sections: { priceElasticity: "ECO101.price-elasticity-of-demand" as SectionId },
} as const;

/** What a fragment builder gets: wall-clock placement relative to the current week, DST-safe. */
export interface SampleContext {
  zone: Zone;
  scenario: SampleScenario;
  /** Paper's Mon 26 Oct 2026 maps to the Monday of the week containing `now`. weekDelta -4..+3. */
  at(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, time: WallTime, weekDelta?: number): EpochMs;
}

/** A fragment may write only the tables its owner writes, so a feature can fix its own sample rows. */
export type SampleFragment<T extends TableName> = (ctx: SampleContext) => { [K in T]?: readonly Tables[K][] };

export interface SampleSummary {
  courses: number;
  events: number;
  authoredBlocks: number;
}

/** Clears every table and writes all fragments in one transaction, then reindexes every source. Idempotent. */
export function seedSampleSemester(opts: { now: number; zone: TimeZone; scenario?: SampleScenario }): Promise<SampleSummary> {
  return todo("seedSampleSemester");
}
export function resetAll(): Promise<void> {
  return todo("resetAll");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §17 Workstream manifest                                     workstreams.ts at the repo root (F)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Workstream {
  key: Owner;
  /** Globs this workstream may change after the foundation commit. `!` excludes. Every tracked file has exactly one owner. */
  owns: readonly string[];
  /** The tables this workstream writes. TABLE_WRITERS is derived from this, never written by hand. */
  writes: readonly TableName[];
  /** Task-name prefix; features/<x>/tasks.ts must use defineTasks(prefix, …). */
  tasks: string | null;
  /** scripts/e2e/steps/<file>.mjs, run in manifest order. */
  e2eStep: string;
}

/** The only ownership list. eslint.config.mjs, check-ownership.mjs, lib/db and the walkthrough all read it. */
export const WORKSTREAMS = [
  {
    key: "foundation",
    owns: [
      "app/layout.tsx", "app/globals.css", "app/fonts/**", "app/(browse)/layout.tsx", "app/(focus)/layout.tsx", "app/api/**",
      "components/**", "hooks/**", "lib/**", "!lib/domain/payload/**", "!lib/sample/{study,lectures,practice,guides}.ts",
      "eslint-rules/**", "scripts/check-*.mjs", "scripts/e2e/walkthrough.mjs", "scripts/e2e/lib/**", "scripts/e2e/steps/boot.mjs",
      "scripts/fixtures/audio/**", "workstreams.ts", "package.json", "pnpm-lock.yaml", "next.config.ts", "tsconfig.json",
      "eslint.config.mjs", "vitest.config.ts", "components.json", ".env.example", ".gitignore", "AGENTS.md",
      "docs/**", "!docs/change-requests/*-*.md",
    ],
    writes: ["prefs", "courses", "overrides", "materials", "pages", "blobs", "chunks", "messages"],
    tasks: null,
    e2eStep: "boot",
  },
  {
    key: "today",
    owns: ["app/(browse)/page.tsx", "features/today/**", "scripts/e2e/steps/today.mjs", "docs/change-requests/today-*.md"],
    writes: [],
    tasks: "today",
    e2eStep: "today",
  },
  {
    key: "calendar",
    owns: ["app/(browse)/calendar/**", "features/calendar/**", "scripts/e2e/steps/calendar.mjs", "scripts/fixtures/calendar/**", "docs/change-requests/calendar-*.md"],
    writes: ["events", "imports"],
    tasks: "calendar",
    e2eStep: "calendar",
  },
  {
    key: "lectures",
    owns: [
      "app/(browse)/lectures/**", "app/(focus)/lectures/**", "features/lectures/**", "public/lectures/**", "lib/domain/payload/lectures.ts",
      "lib/sample/lectures.ts", "scripts/e2e/steps/lectures.mjs", "scripts/fixtures/lectures/**", "docs/change-requests/lectures-*.md",
    ],
    writes: ["lectures", "segments", "links", "audio"],
    tasks: "lecture",
    e2eStep: "lectures",
  },
  {
    key: "study",
    owns: [
      "app/(browse)/study/**", "app/(focus)/study/**", "features/study/**", "lib/domain/payload/study.ts", "lib/sample/study.ts",
      "scripts/e2e/steps/study.mjs", "docs/change-requests/study-*.md",
    ],
    writes: ["sessions"],
    tasks: "study",
    e2eStep: "study",
  },
  {
    key: "practice",
    owns: [
      "app/(browse)/practice/**", "app/(focus)/practice/**", "features/practice/**", "lib/domain/payload/practice.ts", "lib/sample/practice.ts",
      "scripts/e2e/steps/practice.mjs", "scripts/fixtures/practice/**", "docs/change-requests/practice-*.md",
    ],
    writes: ["practiceSets", "questions", "attempts", "solutions"],
    tasks: "practice",
    e2eStep: "practice",
  },
  {
    key: "guides",
    owns: [
      "app/(browse)/guides/**", "app/(focus)/export/**", "features/guides/**", "lib/domain/payload/guides.ts", "lib/sample/guides.ts",
      "scripts/e2e/steps/guides.mjs", "scripts/fixtures/guides/**", "docs/change-requests/guides-*.md",
    ],
    writes: ["guides", "guideSections"],
    tasks: "guide",
    e2eStep: "guides",
  },
] as const satisfies readonly Workstream[];

type WriterIn<W, T> = W extends { key: infer K; writes: readonly (infer X)[] } ? (T extends X ? K : never) : never;
/** The workstream that writes table T, derived from WORKSTREAMS. */
export type TableWriter<T extends TableName> = WriterIn<(typeof WORKSTREAMS)[number], T>;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type OwnershipError = {
  [T in TableName]: [TableWriter<T>] extends [never] ? `${T}: no writer` : true extends IsUnion<TableWriter<T>> ? `${T}: more than one writer` : never;
}[TableName];
/** Fails typecheck, naming the table, when a table has no writer or two. */
export const OWNERSHIP_CHECK: [OwnershipError] extends [never] ? true : OwnershipError = true;

/** Read by the generated table-writer lint rule and by check-ownership. */
export const TABLE_WRITERS = Object.fromEntries(
  WORKSTREAMS.flatMap((w) => (w.writes as readonly TableName[]).map((t) => [t, w.key] as const)),
) as { [T in TableName]: TableWriter<T> };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §18 Walkthrough step contract                          scripts/e2e/lib/context.mjs (F), steps/*.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Stand-ins for Playwright's types, which the app imports from @playwright/test. */
export interface PlaywrightPage {
  goto(url: string): Promise<unknown>;
}
export type PlaywrightExpect = (target: unknown) => unknown;

export interface StepContext {
  page: PlaywrightPage;
  expect: PlaywrightExpect;
  /** Playwright's page.clock. The walkthrough installs it at 2026-10-27T10:12:00 America/Toronto. */
  clock: { setSystemTime(t: string | number): Promise<void>; runFor(ms: number): Promise<void> };
  /** Reset, then Load sample semester through the sidebar DataMenu, so steps never depend on each other. */
  reseed(opts?: { scenario?: SampleScenario }): Promise<void>;
  /** .verify/e2e/<run>/<name>-1440.png for the Paper judge. */
  shot(name: string): Promise<void>;
  /** Assertions that cross into another workstream's screen. Skipped in a feature worktree; run with --integrated. */
  integrated(label: string, fn: () => Promise<void>): Promise<void>;
  /** Reloads the current URL at 375×812 and fails on horizontal overflow, then restores 1440×900. */
  checkNarrow(): Promise<void>;
  /** Absolute path under scripts/fixtures. */
  fixture(relPath: string): string;
  sample: typeof SAMPLE;
  tid: typeof TID;
}

export type Step = (t: StepContext) => Promise<void>;
