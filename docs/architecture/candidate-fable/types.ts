/**
 * Cue architecture, candidate "fable". Type sketch.
 *
 * Every body is `notImplemented()`. Read top to bottom: ids and entities, then the one citation type,
 * then the IndexedDB schema, then the three pure cores (scheduler, retrieval, AI roles), then the
 * browser-side engines and per-feature commands, then the shell. A reader should be able to trace
 * data from an upload or a microphone to a rendered screen from the signatures alone.
 *
 * Conventions used throughout:
 * - Ids are branded strings. Instants are branded epoch milliseconds (indexable, timezone-free).
 * - One writer per table. The owner is named in the doc comment of each entity.
 * - Derived facts (missed, in progress, transcript ready, nav badges) are computed, never stored.
 * - Wire shapes never leave `lib/ai`. Storage shapes never leave `lib/db`.
 */

import { z } from "zod";
import type { Table } from "dexie";

const notImplemented = (): never => {
  throw new Error("not implemented");
};

// ───────────────────────────────────────────────────────────────────────────────
// 1. Ids, time, branding
// ───────────────────────────────────────────────────────────────────────────────

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CourseId = Brand<string, "CourseId">;
export type MaterialId = Brand<string, "MaterialId">;
export type ChunkId = Brand<string, "ChunkId">;
export type EventId = Brand<string, "EventId">;
export type BlockId = Brand<string, "BlockId">;
export type SessionId = Brand<string, "SessionId">;
export type LectureId = Brand<string, "LectureId">;
export type LineId = Brand<string, "LineId">;
export type LinkId = Brand<string, "LinkId">;
export type SetId = Brand<string, "SetId">;
export type QuestionId = Brand<string, "QuestionId">;
export type GuideId = Brand<string, "GuideId">;
export type SectionId = Brand<string, "SectionId">;
export type ThreadId = Brand<string, "ThreadId">;
export type MessageId = Brand<string, "MessageId">;
export type HoldId = Brand<string, "HoldId">;

/** Epoch milliseconds. Stored as a number so Dexie range queries on time work. Rendered with Intl in the local zone. */
export type Instant = Brand<number, "Instant">;
/** Seconds into a lecture recording. */
export type Seconds = Brand<number, "Seconds">;
/** Minutes of planned work. */
export type Minutes = Brand<number, "Minutes">;

export function newId<T extends string>(prefix: string): Brand<string, T> {
  return notImplemented(); // `${prefix}_${crypto.randomUUID().slice(0, 12)}`
}

// ───────────────────────────────────────────────────────────────────────────────
// 2. Courses and materials
// ───────────────────────────────────────────────────────────────────────────────

/** Written by: calendar import (`lib/calendar/commands.ts`) and the sample seed. */
export type Course = {
  id: CourseId;
  code: string; // "CSC148"
  title?: string; // "Introduction to Computer Science"
  instructor?: string; // "Prof. Liu"
  /** Kept for the unused Paper course tokens; chips stay --color-fill as drawn. */
  color?: "pink" | "green" | "orange";
};

export type MaterialKind = "slides" | "textbook" | "handout" | "past-exam" | "notes";

/**
 * One uploaded file (or one sample document). Pages and chunks hang off it.
 * Written by: `lib/materials/commands.ts` (Materials workstream) and the sample seed.
 */
export type Material = {
  id: MaterialId;
  courseId: CourseId;
  kind: MaterialKind;
  title: string; // "Lecture 8 slides"
  /** Ties slides and handouts to a lecture number so sessions can find "Lecture 8 slides" without text matching. */
  lectureNumber?: number;
  sourceName: string; // original file name
  pageCount: number;
  /** Table of contents when the parser found one; sections cite `section` labels like "§5.2". */
  toc?: { title: string; page: number; section?: string }[];
  status: MaterialStatus;
  createdAt: Instant;
};

/**
 * Ingest state machine. Transitions only move forward except `error → queued` on retry.
 * `reading` carries progress so the dialog can show "page 4 of 12" without a second store.
 */
export type MaterialStatus =
  | { phase: "queued" }
  | { phase: "rendering"; page: number; pages: number }
  | { phase: "reading"; done: number; total: number } // Super VL chunks
  | { phase: "indexing" } // chunking + optional embeddings
  | { phase: "ready" }
  | { phase: "error"; error: ApiError };

/** One rendered page: JPEG blob plus the text the vision model read. Written by Materials. */
export type MaterialPage = {
  materialId: MaterialId;
  page: number; // 1-based
  image?: Blob; // absent for text-only sources (sample textbook chapters)
  text: string; // Markdown subset, as the parser emits
  /** Slides: the slide heading. Textbook: the running section label. Drives `describeRef`. */
  heading?: string;
  section?: string;
};

/**
 * Retrieval unit. One slide, one ~400-token window of a page, or one 60-second transcript window.
 * `ref` is the citation for anything retrieved from it. Written by Materials (`chunkMaterial`) and Lectures (`chunkTranscript`).
 */
export type Chunk = {
  id: ChunkId;
  courseId: CourseId;
  /** Exactly one of these is set; the index is on both so a scope filter is a single `where`. */
  materialId?: MaterialId;
  lectureId?: LectureId;
  kind: MaterialKind | "transcript";
  text: string;
  ref: SourceRef;
  /** Qwen3-Embedding-8B at 1024 dims, unit norm. Absent until the embed pass runs; retrieval works without it. */
  embedding?: Float32Array;
  /** Lowercased token set for the lexical ranker, computed once at chunk time. */
  tokens: string[];
};

// ───────────────────────────────────────────────────────────────────────────────
// 3. The one citation type
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Every place Cue points at course material uses this union: ask-panel source chips, practice
 * resource rows, guide footnotes, lecture related links, session plan steps, retrieval chunks.
 * Adding a new target kind here is the only way to add one anywhere.
 */
export type SourceRef =
  | { kind: "slide"; materialId: MaterialId; page: number }
  | { kind: "slides"; materialId: MaterialId; from: number; to: number }
  | { kind: "page"; materialId: MaterialId; page: number; section?: string }
  | { kind: "transcript"; lectureId: LectureId; atSec: Seconds }
  | { kind: "question"; setId: SetId; questionId: QuestionId }
  | { kind: "event"; eventId: EventId } // a deadline or test
  | { kind: "web"; url: string };

/**
 * A ref plus the label the Paper specs print for it ("Lecture 7 at 4:15", "Textbook ch. 5, p. 92",
 * "Slide 17", "Transcript 41:05", "A2 handout §3"). The label is computed once, when the Resource
 * is created, by `describeRef`, so rendering never needs a lookup and labels survive deletion.
 */
export type Resource = { ref: SourceRef; label: string; title?: string };

/** What `describeRef` needs to turn ids into words. Built once per screen from the DB. */
export type RefLookup = {
  material(id: MaterialId): Pick<Material, "title" | "kind" | "lectureNumber"> | undefined;
  lecture(id: LectureId): Pick<Lecture, "number" | "title"> | undefined;
  event(id: EventId): Pick<CalendarEvent, "title" | "start"> | undefined;
  question(id: QuestionId): Pick<Question, "number"> | undefined;
};

/** `lib/refs.ts`. The only formatter. Wording rules are in README §Retrieval. */
export function describeRef(ref: SourceRef, lookup: RefLookup): Resource {
  return notImplemented();
}

/** Opens a ref in the shared SourceSheet (slides, pages, transcript) or navigates (question, event, web). */
export type OpenRef = (ref: SourceRef) => void;

/**
 * `lib/refs.ts`. Where a ref navigates when it is not shown in the SourceSheet:
 * question → `/practice/[setId]?q=`, event → `/calendar?view=day&date=`, web → the url (new tab).
 * Returns undefined for slide, slides, page and transcript, which the SourceSheet shows in place.
 */
export function hrefForRef(ref: SourceRef, lookup: RefLookup): string | undefined {
  return notImplemented();
}

/** Formats seconds as "41:05" and "1:02:14". Used by transcript lines, chips and describeRef. */
export function formatClock(sec: Seconds): string {
  return notImplemented();
}

// ───────────────────────────────────────────────────────────────────────────────
// 4. Calendar: fixed events and planned study blocks
// ───────────────────────────────────────────────────────────────────────────────

export type EventKind = "lecture" | "deadline" | "exam" | "other";

/**
 * A fixed item on the calendar. Lectures repeat by having one row per occurrence (the importer
 * expands recurrence). Deadlines and exams are the scheduler's anchors.
 * Written by: `lib/calendar/commands.ts` (import, manual add) and the sample seed.
 */
export type CalendarEvent = {
  id: EventId;
  courseId?: CourseId;
  kind: EventKind;
  title: string; // "CSC148 Lecture", "ECO101 PS4 due 5pm", "Thanksgiving · no class"
  start: Instant;
  end: Instant; // deadlines: end === start
  allDay: boolean;
  location?: string; // "BA 1160"
  /** Lectures: the running number and topic once known (from the syllabus or after recording). */
  lectureNumber?: number;
  topic?: string;
  /** Deadlines and exams: how heavy. Drives work-block hours and prep-series length. */
  weight?: "light" | "normal" | "heavy";
  source: "sample" | "ics" | "image" | "manual";
};

export type BlockKind = "review" | "midweek" | "endweek" | "work" | "prep";

/**
 * Stable identity of a planned block across re-plans: `${kind}:${anchor}:${n}`.
 * Examples: `review:evt_csc148_l8:1`, `midweek:crs_psy100:2026-W44`, `endweek:all:2026-W44`,
 * `work:evt_eco101_ps4:2`, `prep:evt_mat137_t2:1/4`.
 * Re-running the scheduler with the same inputs yields the same keys, which is what makes
 * "Reschedule" and re-import idempotent and lets a done block keep its identity.
 */
export type BlockKey = Brand<string, "BlockKey">;

/**
 * A study block the scheduler placed. Placement is immutable: the scheduler replaces rows by key,
 * it never edits them. Whether the block was started, finished or missed lives on `StudySession`
 * (one writer per table) and is derived at read time by `blockState`.
 * Written by: `lib/scheduler/commands.ts` (Calendar workstream) and the sample seed.
 */
export type StudyBlock = {
  id: BlockId;
  key: BlockKey;
  kind: BlockKind;
  courseId?: CourseId; // undefined for the all-course end-of-week review
  title: string; // "Review · Recursion & tree traversal", "Test 2 prep · 1 of 4"
  topic: string; // "Recursion & tree traversal"
  start: Instant;
  end: Instant;
  /** The lecture, deadline or exam this block exists for. Undefined for weekly reviews. */
  anchorEventId?: EventId;
  reason: BlockReason;
  series?: { index: number; count: number }; // "1 of 4"
  note?: string; // "Past paper, timed"
  /** Materials the session should open, resolved at plan time from the anchor lecture. */
  materialIds: MaterialId[];
};

/** Why the scheduler put the block here. Rendered as Today's trailing text and the card's meta sentence. */
export type BlockReason =
  | { kind: "after-lecture"; daysAfter: number }
  | { kind: "mid-week" }
  | { kind: "end-of-week" }
  | { kind: "deadline"; dueAt: Instant }
  | { kind: "test-prep"; examAt: Instant };

/** Derived, never stored. `in_progress` and `done` come from the session; `missed` from the clock. */
export type BlockState = "upcoming" | "next" | "in_progress" | "done" | "missed";

export function blockState(block: StudyBlock, session: StudySession | undefined, now: Instant, nextBlockId?: BlockId): BlockState {
  return notImplemented();
}

// ───────────────────────────────────────────────────────────────────────────────
// 5. Study sessions (the runtime of a block)
// ───────────────────────────────────────────────────────────────────────────────

export type StepKind = "recall" | "reread" | "explain" | "practice" | "flag" | "break";

/** One row of the session plan. `source` is what the material viewer opens for the step. */
export type PlanStep = {
  kind: StepKind;
  title: string; // "Re-read key slides"
  minutes: Minutes;
  source?: SourceRef; // slides range, page, or transcript moment
  /** The transcript moment shown under the viewer, chosen because it is an exam hint for this step. */
  moment?: { ref: Extract<SourceRef, { kind: "transcript" }>; quote: string; examHint?: string };
  check?: string; // "Why does preorder need the empty-tree check first?"
};

export type SessionPlan = {
  steps: PlanStep[];
  /** Which tabs the viewer offers. Hidden when no material of that kind exists; never disabled. */
  tabs: { slides?: MaterialId; transcript?: LectureId; textbook?: { materialId: MaterialId; section?: string } };
  source: "model" | "rules"; // rules = fallback plan when the model fails
};

/**
 * Timer as a state machine that survives reload: elapsed = accumulatedMs + (runningSince ? now - runningSince : 0).
 * Transitions: running ⇄ paused; running → ended; a `break` step is an ordinary step with kind "break".
 */
export type Timer =
  | { status: "running"; accumulatedMs: number; runningSince: Instant }
  | { status: "paused"; accumulatedMs: number }
  | { status: "ended"; accumulatedMs: number; endedAt: Instant };

/**
 * Exists iff the student started (or marked done) a block. Its presence is what makes a block
 * "in progress" or "done". Written only by `lib/sessions/commands.ts`.
 */
export type StudySession = {
  id: SessionId;
  blockId: BlockId;
  startedAt: Instant;
  plannedMinutes: Minutes;
  plan: SessionPlan;
  stepIndex: number;
  stepsDone: number[];
  timer: Timer;
  /** "Mark done" from the calendar creates a session with manual: true and an ended timer. */
  manual?: boolean;
  /** Per-session choice of ask mode, remembered as the spec asks. */
  askMode: AskMode;
  flagged: string[]; // "Flag what's fuzzy" entries
};

export function elapsedMs(timer: Timer, now: Instant): number {
  return notImplemented();
}

// ───────────────────────────────────────────────────────────────────────────────
// 6. Lectures: recording, transcript, related links, saved notes
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Recording state machine (the status column). Legal transitions:
 * idle → starting → recording ⇄ paused → saving → saved; any of starting/recording/paused → error;
 * error → starting (try again); saved → recording ("Continue recording" appends to the same lecture).
 * Written only by `lib/lectures/commands.ts`.
 */
export type LectureStatus = "idle" | "starting" | "recording" | "paused" | "saving" | "saved" | "error";

export type Lecture = {
  id: LectureId;
  courseId: CourseId;
  eventId?: EventId; // the calendar occurrence it belongs to, when opened from one
  number?: number; // Lecture 9
  title: string; // "Integration by parts"
  scheduledSec: Seconds; // 50:00
  status: LectureStatus;
  error?: ApiError | { kind: "microphone"; message: string };
  /** Elapsed recording time as a Timer so pause/resume and reload are exact. */
  timer: Timer;
  startedAt?: Instant;
  savedAt?: Instant;
  engine: TranscriptionEngineId;
};

/**
 * One transcript line. `final: false` is the single live line (at most one per lecture).
 * A flag is either model-found (`assessment` names the test it mentioned) or manual.
 * Written only by `lib/lectures/recorder.ts` through `lib/lectures/commands.ts`.
 */
export type TranscriptLine = {
  id: LineId;
  lectureId: LectureId;
  seq: number;
  atSec: Seconds;
  text: string;
  final: boolean;
  flag?: { by: "model"; assessment?: string } | { by: "you" };
};

/** Raw audio kept so a lecture can be transcribed later if the engine fails mid-way. 16 kHz mono WAV. */
export type AudioChunk = { lectureId: LectureId; seq: number; startSec: Seconds; endSec: Seconds; wav: Blob };

export type LinkKind = "assessment" | "assignment" | "textbook" | "practice" | "slides";

/** "Related coursework" card. Newest first in the UI. `lineId` ties it to the moment that produced it. */
export type RelatedLink = {
  id: LinkId;
  lectureId: LectureId;
  lineId: LineId;
  atSec: Seconds;
  kind: LinkKind;
  resource: Resource; // title + meta come from the resource label and `meta`
  meta: string; // "Due Thursday · same technique"
  /** True for the link tied to an exam hint; the emphasized card. Resolves spec flag 7 as "linked to a hint". */
  fromHint: boolean;
};

/** Written once by the end-of-lecture pass (`lectureNotes` role). */
export type LectureNotes = {
  lectureId: LectureId;
  summary: string;
  keyPoints: { ref: Extract<SourceRef, { kind: "transcript" }>; text: string }[];
  /** Exam hints are derived from flagged lines; stored here only as the model's cleaned quotes. */
  examHints: { lineId: LineId; quote: string; assessment?: string }[];
};

// ───────────────────────────────────────────────────────────────────────────────
// 7. Practice (grown from the existing cue-practice types)
// ───────────────────────────────────────────────────────────────────────────────

export type Box = [x0: number, y0: number, x1: number, y1: number];
export type Option = { label: string; text: string };

/** Written by `lib/practice/commands.ts` (parse, generate, "Quiz me on this section"). */
export type PracticeSet = {
  id: SetId;
  courseId?: CourseId;
  title: string; // "2024 Midterm"
  sourceName: string;
  /** The past-exam material the set was parsed from, when it was. Generated sets have none. */
  materialId?: MaterialId;
  pageCount: number;
  createdAt: Instant;
};

export type Question = {
  id: QuestionId;
  setId: SetId;
  order: number; // display order; generated questions append
  number: string; // as printed, or "16", "17" for generated
  topic: string;
  type: "multiple_choice";
  marks?: number;
  prompt: string; // Markdown subset
  options: Option[];
  answer?: string;
  answerSource: "document" | "model" | "none";
  figure?: { page: number; box: Box };
  origin: { kind: "document" } | { kind: "generated"; from: Resource[] };
};

export type AttemptState =
  | { status: "unanswered" }
  | { status: "checking"; choice: string }
  | { status: "answered"; choice: string; correct: boolean };

export type Attempt = { questionId: QuestionId; state: AttemptState; at: Instant };

export type Solution = {
  answer: string;
  explanation: string;
  steps: { label: string; text: string }[]; // "B's subtree" / "D, E, then B"
  conclusion?: string;
  whyNot: Record<string, string>;
  /** "Relevant resources", grounded in retrieved chunks. */
  resources: Resource[];
  /** Provenance sentence is derived: answerSource + resources[0] → "Cue wrote this from Lecture 8." */
};

export type SolutionState =
  | { status: "loading" }
  | { status: "ready"; solution: Solution }
  | { status: "error"; error: ApiError };

export type SolutionRow = { questionId: QuestionId; state: SolutionState };
export type FigureRow = { questionId: QuestionId; image: Blob };

// ───────────────────────────────────────────────────────────────────────────────
// 8. Study guide
// ───────────────────────────────────────────────────────────────────────────────

export type Guide = {
  id: GuideId;
  courseId: CourseId;
  chapters: { id: string; title: string; textbookChapter?: number; sectionIds: SectionId[] }[];
  /** Last section the student read, for the course select. */
  lastSectionId?: SectionId;
  outlineSource: "model" | "sample";
};

export type SectionStatus =
  | { phase: "pending" }
  | { phase: "writing" }
  | { phase: "ready"; writtenAt: Instant }
  | { phase: "stale"; because: string } // "Lecture 8 added"
  | { phase: "error"; error: ApiError };

/** Footnote markers are refs on blocks, never characters in strings. */
export type GuideBlock =
  | { kind: "prose"; text: string; refs: number[] }
  | { kind: "formula"; lhs: string; numerator: string; denominator: string; note?: string; noteRefs: number[]; tex?: string }
  | { kind: "figure"; panels: { title: string; description: string; chart: ChartSpec }[]; caption: string; refs: number[] }
  | { kind: "callout"; label: string; examHint?: string; text: string; refs: number[]; quote?: { text: string; attribution: string } };

/**
 * Data-driven chart the `GuideChart` SVG renders with the measured geometry (viewBox 440×240, origin (50,204)).
 * Generic enough for the model to emit for any course; the ECO101 demand panels are one instance:
 * series "D" from (1.7,5) to (35,3), guides at p1/p2, brackets on both axes between the derived points.
 */
export type ChartSpec = {
  kind: "xy";
  x: { label: string; max: number };
  y: { label: string; max: number };
  series: { label: string; points: { x: number; y: number }[] }[];
  /** Dashed guides from an axis to a point on a series; `at` is the y (for "y" guides) or x value. */
  guides: { axis: "x" | "y"; at: number; label: string; series: number }[];
  /** Thick bars on an axis between two values, e.g. price change P1→P2 and quantity change Q1→Q2. */
  brackets: { axis: "x" | "y"; from: number; to: number }[];
};

export type Footnote = { n: number; sources: Resource[] };

export type GuideSection = {
  id: SectionId;
  guideId: GuideId;
  chapterId: string;
  order: number;
  title: string;
  status: SectionStatus;
  blocks: GuideBlock[];
  footnotes: Footnote[];
  /** Chunks the section was written from; "Rewrite" diffs these against current chunks to mark stale. */
  sourceChunkIds: ChunkId[];
};

// ───────────────────────────────────────────────────────────────────────────────
// 9. Chat: one thread type for every ask panel
// ───────────────────────────────────────────────────────────────────────────────

export type AskMode = "quick" | "deep";

export type ChatScope =
  | { kind: "question"; questionId: QuestionId }
  | { kind: "session"; sessionId: SessionId; lectureId?: LectureId }
  | { kind: "lecture-live"; lectureId: LectureId } // context = last 5 minutes of transcript
  | { kind: "lecture"; lectureId: LectureId } // saved view, whole lecture
  | { kind: "guide"; sectionId: SectionId };

export function scopeKey(scope: ChatScope): string {
  return notImplemented(); // "question:q_12"
}

export type ChatMessage = {
  id: MessageId;
  role: "user" | "assistant";
  content: string;
  mode?: AskMode;
  thinking?: string; // deep mode reasoning_content, shown collapsed
  sources?: Resource[]; // derived on the client from [n] citations once the stream is done
  followUps?: string[]; // "Quiz me on this", "Add to study guide"
  status: "streaming" | "done" | "error";
  error?: ApiError;
};

/** Written only by `useChat` in `lib/chat/use-chat.ts`. */
export type ChatThread = { id: ThreadId; scopeKey: string; scope: ChatScope; messages: ChatMessage[]; updatedAt: Instant };

/** A retrieved chunk as the ask prompt sees it. The number is what the model cites. */
export type ContextChunk = { n: number; text: string; resource: Resource };

// ───────────────────────────────────────────────────────────────────────────────
// 10. Settings (singleton rows)
// ───────────────────────────────────────────────────────────────────────────────

export type Setting =
  | { key: "sample"; version: number; loadedAt: Instant }
  | { key: "transcription"; engine: TranscriptionEngineId }
  | { key: "scheduler"; prefs: SchedulerPrefs }
  | { key: "practice"; topicFilter: Record<SetId, string | null>; currentQuestion: Record<SetId, QuestionId> }
  | { key: "guide"; lastCourseId: CourseId };

// ───────────────────────────────────────────────────────────────────────────────
// 11. IndexedDB schema (Dexie 4). `lib/db/schema.ts`, client-only. The one place tables are listed.
// ───────────────────────────────────────────────────────────────────────────────

import "client-only"; // importing `lib/db` from a server file fails the build on purpose

export declare class CueDb {
  courses: Table<Course, CourseId>;
  materials: Table<Material, MaterialId>;
  pages: Table<MaterialPage, [MaterialId, number]>;
  chunks: Table<Chunk, ChunkId>;
  events: Table<CalendarEvent, EventId>;
  blocks: Table<StudyBlock, BlockId>;
  sessions: Table<StudySession, SessionId>;
  lectures: Table<Lecture, LectureId>;
  transcript: Table<TranscriptLine, LineId>;
  audio: Table<AudioChunk, [LectureId, number]>;
  links: Table<RelatedLink, LinkId>;
  notes: Table<LectureNotes, LectureId>;
  sets: Table<PracticeSet, SetId>;
  questions: Table<Question, QuestionId>;
  attempts: Table<Attempt, QuestionId>;
  solutions: Table<SolutionRow, QuestionId>;
  figures: Table<FigureRow, QuestionId>;
  chats: Table<ChatThread, ThreadId>;
  guides: Table<Guide, GuideId>;
  sections: Table<GuideSection, SectionId>;
  settings: Table<Setting, Setting["key"]>;
}

/**
 * Version 1 index spec. Primary key first; `[a+b]` is a compound index. Blobs are not indexed.
 * Migrations append `version(2)` here and nowhere else.
 */
export const DB_SCHEMA_V1 = {
  courses: "id, code",
  materials: "id, courseId, kind, lectureNumber, status.phase",
  pages: "[materialId+page], materialId",
  chunks: "id, courseId, materialId, lectureId, [courseId+kind]",
  events: "id, courseId, kind, start, end",
  blocks: "id, &key, courseId, start, end, anchorEventId",
  sessions: "id, blockId, startedAt, timer.status",
  lectures: "id, eventId, courseId, status",
  transcript: "id, [lectureId+seq], lectureId, atSec",
  audio: "[lectureId+seq]",
  links: "id, lectureId, atSec",
  notes: "lectureId",
  sets: "id, courseId",
  questions: "id, setId, [setId+order], topic",
  attempts: "questionId",
  solutions: "questionId",
  figures: "questionId",
  chats: "id, &scopeKey",
  guides: "id, &courseId",
  sections: "id, guideId, [guideId+order]",
  settings: "key",
} as const satisfies Record<keyof CueDb, string>;

export declare const db: CueDb;

/** Wipes every table. The only destructive command; "Load sample semester" and "Reset" call it. */
export function resetDb(): Promise<void> {
  return notImplemented();
}

// ───────────────────────────────────────────────────────────────────────────────
// 12. Scheduler: a pure function. `lib/scheduler/plan.ts` (Calendar workstream), signature fixed here.
// ───────────────────────────────────────────────────────────────────────────────

export type SchedulerPrefs = {
  dayStart: number; // minutes from midnight, 8*60
  dayEnd: number; // 22*60
  maxStudyMinutesPerDay: Minutes; // 240
  reviewMinutes: { afterLecture: Minutes; midWeek: Minutes; endOfWeek: Minutes }; // 45, 30, 90
  workHoursByWeight: Record<NonNullable<CalendarEvent["weight"]>, number>; // light 2, normal 4, heavy 6
  prepSessionsByWeight: Record<NonNullable<CalendarEvent["weight"]>, number>; // 2, 4, 6
  gapAfterLecture: Minutes; // 15: review may start 15 min after the lecture ends
};

export type SchedulerInput = {
  now: Instant;
  window: { from: Instant; to: Instant }; // normally startOfToday → +14 days
  courses: Course[];
  events: CalendarEvent[]; // fixed items inside (and anchors just outside) the window
  existing: StudyBlock[]; // blocks currently in the window
  /** Blocks that have a session (started, done or marked). Passed through untouched and treated as fixed. */
  locked: Set<BlockId>;
  prefs: SchedulerPrefs;
};

export type SchedulerOutput = {
  /** The full desired set for the window, locked blocks included. Caller diffs against `existing` by key. */
  blocks: StudyBlock[];
  added: BlockKey[];
  removed: BlockKey[];
  moved: BlockKey[];
  /** Blocks the rules wanted but no slot fit (a day already at its max). Shown as a toast line. */
  unplaced: { key: BlockKey; reason: string }[];
};

/**
 * Rules, applied in this order so earlier (higher-value) blocks take the better slots:
 * 1. after-lecture review: next day (same day if ≥45 min free gap after the lecture), 45 min, topic = lecture topic;
 * 2. test-prep series: N sessions (by weight) in the 7 days before an exam, one per day, numbered "1 of N",
 *    the last one on the eve, 60–120 min, note "Past paper, timed" on the last;
 * 3. work blocks before a deadline: hours by weight spread over the 3 days before it, evenings first,
 *    the last block on the eve titled "{item} final push";
 * 4. mid-week review per course on Wed or Thu, 30 min;
 * 5. end-of-week review, Saturday 11:00, 90 min, all courses.
 * Placement: never overlaps an event or another block (touching is fine), stays inside dayStart..dayEnd,
 * respects maxStudyMinutesPerDay, prefers the earliest slot after the anchor, falls back to later days.
 * Determinism: same input → same output, keys stable, ids reused from `existing` when the key matches.
 */
export function planStudy(input: SchedulerInput): SchedulerOutput {
  return notImplemented();
}

/** Finds the next free slot ≥ `after` for one block; used by "Reschedule". Pure. */
export function nextFreeSlot(block: StudyBlock, input: SchedulerInput, after: Instant): { start: Instant; end: Instant } | undefined {
  return notImplemented();
}

/** Lays overlapping imported events into lanes for the week/day grids. Pure; cluster-and-greedy as the spec describes. */
export function layoutLanes<T extends { start: Instant; end: Instant }>(items: T[], maxLanes: number): { item: T; lane: number; lanes: number }[] {
  return notImplemented();
}

// ───────────────────────────────────────────────────────────────────────────────
// 13. Retrieval. `lib/retrieval/*`, foundation. Runs in the browser against IndexedDB.
// ───────────────────────────────────────────────────────────────────────────────

export type RetrievalQuery = {
  courseId: CourseId;
  text: string;
  /** Narrow to the current lecture's materials, or to the last 5 minutes of a live transcript. */
  scope?: { materialIds?: MaterialId[]; lectureIds?: LectureId[]; kinds?: Chunk["kind"][]; afterSec?: Seconds };
  k?: number; // default 8
  /** false → lexical only (used when offline or in the budget-cap state). Default true. */
  embed?: boolean;
};

export type Hit = { chunk: Chunk; score: number; resource: Resource };

/**
 * Hybrid: lexical BM25-style score always; cosine over stored embeddings when the query embedding
 * (via the `embed` role) is available; merged by reciprocal rank fusion. Never throws for AI reasons:
 * an embed failure degrades to lexical. This is what keeps mock mode and the demo deterministic.
 */
export function retrieve(q: RetrievalQuery, lookup: RefLookup): Promise<Hit[]> {
  return notImplemented();
}

/** Turns hits into numbered context for an ask prompt, capped at `maxChars` (24k) to stay under the body limit. */
export function toContext(hits: Hit[], maxChars?: number): ContextChunk[] {
  return notImplemented();
}

/** Slides: one chunk per slide. Textbook, handout, notes: ~400-token windows per page, overlap 60. */
export function chunkMaterial(material: Material, pages: MaterialPage[]): Chunk[] {
  return notImplemented();
}

/** 60-second windows over final lines, ref = transcript at window start. */
export function chunkTranscript(lectureId: LectureId, courseId: CourseId, lines: TranscriptLine[]): Chunk[] {
  return notImplemented();
}

/** Maps "[3]" citations in a finished answer to the context's resources, in first-mention order. */
export function extractCitations(answer: string, context: ContextChunk[]): Resource[] {
  return notImplemented();
}

// ───────────────────────────────────────────────────────────────────────────────
// 14. AI layer. `lib/ai/*`. One role registry; one route; one error type; one stream protocol.
// ───────────────────────────────────────────────────────────────────────────────

export type ErrorKind =
  | "missing_key"
  | "rate_limited"
  | "unreadable" // 400: the request failed validation
  | "no_questions"
  | "too_large"
  | "budget" // 402: the $30 cap would be crossed
  | "empty_output" // thinking ate max_tokens, or the JSON failed the output schema after one retry
  | "cancelled"
  | "offline"
  | "upstream";

export type ApiError = { kind: ErrorKind; message: string };

export type ModelKey = "superVl" | "ultra" | "lightning" | "embed";

/** Provider table: the only file that knows model ids, base URLs and thinking switches. Server-only. */
export type ProviderConfig = {
  provider: "token-factory" | "openrouter" | "mock";
  baseURL: string;
  apiKey: string;
  models: Record<ModelKey, string>;
  /** USD per million tokens [input, output]; OpenRouter :free models are [0, 0] so every call still passes the ledger. */
  prices: Record<ModelKey, [number, number]>;
  noThinking: object; // chat_template_kwargs or reasoning: {enabled:false}
};

export type RoleName =
  | "parseExam" // Super VL, off: exam pages → questions + answer key (existing parse)
  | "parseDocument" // Super VL, off: slides/textbook/handout pages → page text, headings, toc
  | "parseCalendar" // Super VL, off: timetable image/PDF → courses + weekly slots + deadlines
  | "brief" // Ultra, off: Today's headline and subline from the day's blocks
  | "planSession" // Ultra, on: block + materials + hints → SessionPlan
  | "solve" // Ultra, on: question + context → Solution with resources
  | "generateQuestions" // Ultra, on: style examples + context → questions; then solve each and drop disagreements
  | "askQuick" // Ultra, off, stream
  | "askDeep" // Ultra, on, stream, with thinking events
  | "cleanTranscript" // Lightning, off: raw chunk text → punctuated lines
  | "flagHints" // Lightning, off: rolling 60 s window → exam hints + tasks + link candidates
  | "lectureNotes" // Ultra, off: whole transcript → summary, key points, hints
  | "writeGuideOutline" // Ultra, on: course materials digest → chapters and sections
  | "writeGuideSection" // Ultra, off: section title + context → GuideBlock[] + footnotes (JSON, not streamed)
  | "embed"; // Qwen3-Embedding-8B, 1024 dims

export type RoleKind = "json" | "stream" | "embedding";

/**
 * One role. `input` and `output` are zod schemas: the request body is validated with `input` at the
 * route, the JSON schema sent as `response_format` is derived from `output` with `z.toJSONSchema`,
 * and the model's reply is parsed with `output`. Types are inferred, so wire shape, validation and
 * TypeScript never drift. `fixture` is a real input used by `check-nemotron.mjs` and the mock.
 */
export type RoleSpec<I = unknown, O = unknown> = {
  name: RoleName;
  model: ModelKey;
  kind: RoleKind;
  thinking: boolean;
  maxTokens: number;
  temperature: number;
  input: z.ZodType<I>;
  output: z.ZodType<O>; // for "stream": the final text; for "embedding": Float32Array[]
  /** Builds the messages. Images go in as data URLs on `image_url` parts; the schema is restated in the system prompt when thinking is on. */
  prompt(input: I): PromptMessage[];
  /** Deterministic stand-in used when no key is set outside production, and by the walkthrough. */
  mock(input: I): O | AsyncIterable<StreamEvent>;
  fixture: I;
};

export type PromptMessage = { role: "system" | "user" | "assistant"; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] };

/** `lib/ai/registry.ts`. The compiler refuses a missing or extra role. Each entry is a file in `lib/ai/roles/`. */
export declare const ROLES: { [R in RoleName]: RoleSpec };
export type RoleInput<R extends RoleName> = z.infer<(typeof ROLES)[R]["input"]>;
export type RoleOutput<R extends RoleName> = z.infer<(typeof ROLES)[R]["output"]>;

/** NDJSON lines on `/api/ai/<streamRole>`. Encoded and decoded in `lib/ai/stream.ts` only. */
export type StreamEvent =
  | { t: "thinking"; text: string }
  | { t: "delta"; text: string }
  | { t: "done"; usage?: Usage }
  | { t: "error"; error: ApiError };

export type Usage = { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number; cached_tokens?: number };

/**
 * Server entry, `lib/ai/run.ts` (server-only). Validates nothing: the route already did.
 * Reserves the worst case per upstream attempt (SDK retries are off; this loop retries 429/5xx twice),
 * settles to usage, maps every failure to ApiError. JSON roles parse with `output`; on a parse
 * failure they retry once with the error appended, then throw `empty_output`.
 */
export function runRole<R extends RoleName>(role: R, input: RoleInput<R>, signal: AbortSignal): Promise<RoleOutput<R> | ReadableStream<Uint8Array>> {
  return notImplemented();
}

/** Browser client, `lib/ai/client.ts`. The only fetcher. Three in flight per role kind; the rest queue. */
export declare const ai: {
  run<R extends RoleName>(role: R, input: RoleInput<R>, opts?: { signal?: AbortSignal }): Promise<RoleOutput<R>>;
  stream<R extends "askQuick" | "askDeep">(role: R, input: RoleInput<R>, opts: { signal?: AbortSignal }): AsyncIterable<StreamEvent>;
  /** GET /api/spend. Used by the sidebar footer and the budget notice. */
  spend(): Promise<SpendStatus>;
  /** Thrown by run/stream. */
  Error: new (api: ApiError) => Error & { api: ApiError };
};

// Spend cap ─────────────────────────────────────────────────────────────────────

export type SpendStatus = { spentUsd: number; reservedUsd: number; capUsd: number; calls: number; provider: ProviderConfig["provider"] };

/**
 * Atomic reserve/settle. The adapter owns atomicity; the cap logic is identical for both.
 * `FileSpendStore` (local dev, `.data/spend-ledger.json`, promise-serialized, as today) and
 * `UpstashSpendStore` (Vercel: one Lua EVAL does read-sum-check-write; holds in a hash with timestamps).
 * Chosen by env: UPSTASH_REDIS_REST_URL set → Upstash, else file. A store that cannot be read fails
 * closed (reserve throws), never open.
 */
export interface SpendStore {
  reserve(worstUsd: number, capUsd: number, now: Instant): Promise<{ ok: true; holdId: HoldId } | { ok: false; spentUsd: number }>;
  settle(holdId: HoldId, actualUsd: number): Promise<void>;
  status(): Promise<Omit<SpendStatus, "capUsd" | "provider">>;
}

/** `lib/ai/spend.ts`. `SPEND_CAP_USD` is parsed as a positive finite number at module load or the server refuses to start. */
export function reserve(model: ModelKey, inputTokens: number, maxOutputTokens: number): Promise<{ settle(usage: Usage | null): Promise<void> }> {
  return notImplemented();
}

/** chars/3 + 3,400 per image (measured cap 3,317). */
export function estimateInputTokens(texts: string[], images?: number): number {
  return notImplemented();
}

// Role input/output sketches (zod in the real files; shown as types here) ───────

export type AskInput = {
  scope: ChatScope;
  messages: { role: "user" | "assistant"; content: string }[]; // last 12
  context: ContextChunk[]; // retrieved on the client, numbered
  /** Practice: the question, choice and solution so the tutor knows whether to hide the answer. */
  question?: { prompt: string; options: Option[]; answer?: string; choice?: string; solution?: Solution };
};

export type SolveInput = { question: Pick<Question, "number" | "topic" | "prompt" | "options" | "answer">; context: ContextChunk[] };

export type GenerateQuestionsInput = {
  course: string;
  topic: string | "missed";
  count: 3 | 5 | 10;
  focusMissed: boolean;
  instructions?: string;
  styleExamples: Pick<Question, "prompt" | "options" | "answer" | "topic">[]; // up to 6 from the paper
  context: ContextChunk[];
};

export type PlanSessionInput = { block: Pick<StudyBlock, "title" | "topic" | "kind" | "reason">; minutes: Minutes; materials: { resource: Resource; outline: string }[]; hints: ContextChunk[] };

export type CleanTranscriptInput = { chunks: { seq: number; startSec: Seconds; text: string }[]; previousTail: string };
export type CleanTranscriptOutput = { lines: { seq: number; atSec: Seconds; text: string }[] };

export type FlagHintsInput = { window: { atSec: Seconds; text: string }[]; course: string; upcoming: { eventId: EventId; title: string; when: string }[]; materials: Resource[] };
export type FlagHintsOutput = {
  hints: { atSec: Seconds; quote: string; assessment?: string }[];
  links: { atSec: Seconds; kind: LinkKind; title: string; meta: string; ref: SourceRef }[];
};

export type WriteGuideSectionInput = { course: string; chapter: string; section: string; context: ContextChunk[]; priorSections: string[] };
export type WriteGuideSectionOutput = { blocks: GuideBlock[]; footnotes: { n: number; chunks: number[] }[] }; // chunk numbers → resources on the client

export type ParseCalendarOutput = {
  courses: { code: string; title?: string; instructor?: string; slots: { day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"; start: string; end: string; location?: string }[] }[];
  deadlines: { course: string; title: string; date: string; time?: string; kind: "deadline" | "exam" }[];
};

// ───────────────────────────────────────────────────────────────────────────────
// 15. Transcription engines. `lib/lectures/engine.ts` (interface, foundation) and `engines/*` (Lectures).
// ───────────────────────────────────────────────────────────────────────────────

export type TranscriptionEngineId = "parakeet" | "demo";

export type EngineEvent =
  | { t: "status"; status: "loading" | "ready" | "listening" | "paused" | "stopped" | "error"; progress?: number; message?: string }
  | { t: "partial"; text: string } // running hypothesis for the live line
  | { t: "chunk"; seq: number; startSec: Seconds; endSec: Seconds; text: string; wav?: Blob }; // one finished cut

/**
 * Both engines speak this and nothing else. Parakeet: AudioWorklet → 16 kHz mono PCM → cut at the
 * quietest point between 12 and 18 s → transformers.js `parakeet-ctc-0.6b` in a Web Worker on WebGPU
 * (WASM fallback) → lowercase text per chunk (the `cleanTranscript` role punctuates). Demo: replays
 * `lib/sample/lecture-transcript.ts` with its timings and emits the same events, no microphone.
 */
export interface TranscriptionEngine {
  readonly id: TranscriptionEngineId;
  /** Downloads or warms the model. Idempotent. The UI calls it when the note taker opens, before Start. */
  prepare(onProgress: (fraction: number) => void): Promise<void>;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
  subscribe(listener: (e: EngineEvent) => void): () => void;
}

export function createEngine(id: TranscriptionEngineId): TranscriptionEngine {
  return notImplemented();
}

/**
 * `lib/lectures/recorder.ts`. Lives in `LectureRecorderProvider` above both route layouts so leaving
 * the focus screen never stops a recording. Owns: the engine, the audio persistence, the
 * cleanTranscript and flagHints calls, and every transcript/link write (through commands).
 */
export interface LectureRecorder {
  readonly lectureId: LectureId | null;
  open(lectureId: LectureId, engine: TranscriptionEngineId): Promise<void>; // prepare + status "starting"
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** Stops, finalizes the live line, runs `lectureNotes`, sets status saved. Idempotent: a second call returns the same promise. */
  endAndSave(): Promise<void>;
  flagLine(lineId: LineId, on: boolean): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────────────
// 16. Commands: the only writers. Signatures fixed in foundation; bodies per workstream.
// ───────────────────────────────────────────────────────────────────────────────

// lib/calendar/commands.ts (Calendar)
export function importIcs(file: File): Promise<{ preview: ParseCalendarOutput }> {
  return notImplemented();
}
export function importTimetableImage(files: File[]): Promise<{ preview: ParseCalendarOutput }> {
  return notImplemented(); // renderPages → ai.run("parseCalendar")
}
/** Expands slots into dated events for the term, writes courses and events, then calls `replanWindow`. Returns the toast counts. */
export function commitImport(preview: ParseCalendarOutput, selectedCourses: string[], term: { from: Instant; to: Instant }): Promise<{ courses: number; blocks: number }> {
  return notImplemented();
}

// lib/scheduler/commands.ts (Calendar). The only writer of `blocks`.
export function replanWindow(window?: { from: Instant; to: Instant }): Promise<SchedulerOutput> {
  return notImplemented(); // reads events, blocks, sessions, prefs; planStudy; diff by key; one transaction
}
export function rescheduleBlock(id: BlockId): Promise<{ start: Instant; end: Instant } | undefined> {
  return notImplemented(); // nextFreeSlot, writes the moved block
}

// lib/sessions/commands.ts (Sessions). The only writer of `sessions`.
/** Idempotent: a block with a live session returns it. Generates the plan (model, then rules) before returning. */
export function startSession(blockId: BlockId): Promise<SessionId> {
  return notImplemented();
}
export function pauseSession(id: SessionId): Promise<void> {
  return notImplemented();
}
export function resumeSession(id: SessionId): Promise<void> {
  return notImplemented();
}
export function nextStep(id: SessionId): Promise<void> {
  return notImplemented();
}
export function gotoStep(id: SessionId, index: number): Promise<void> {
  return notImplemented();
}
export function endSession(id: SessionId): Promise<void> {
  return notImplemented();
}
/** "Mark done" from a calendar popover. */
export function markBlockDone(blockId: BlockId): Promise<void> {
  return notImplemented();
}

// lib/lectures/commands.ts (Lectures). The only writer of lectures, transcript, audio, links, notes.
/** Idempotent per event: returns the existing lecture for the event when one exists. */
export function openLectureForEvent(eventId: EventId): Promise<LectureId> {
  return notImplemented();
}
export function createAdHocLecture(courseId: CourseId, title: string): Promise<LectureId> {
  return notImplemented();
}

// lib/practice/commands.ts (foundation ports the existing logic; Practice extends)
export function createSetFromFiles(files: File[], courseId?: CourseId): Promise<SetId> {
  return notImplemented(); // renderPages → chunk → ai.run("parseExam") ×N → buildExam → figures as Blobs
}
export function choose(questionId: QuestionId, label: string): Promise<void> {
  return notImplemented();
}
export function requestSolution(questionId: QuestionId): Promise<void> {
  return notImplemented(); // retrieve → ai.run("solve") → solutions row; resolves a "checking" attempt
}
/** Appends generated questions to the set, numbered after the last printed number; partial results are kept. */
export function generateQuestions(setId: SetId, input: Omit<GenerateQuestionsInput, "styleExamples" | "context" | "course">): Promise<QuestionId[]> {
  return notImplemented();
}
/** Used by Guide's "Quiz me on this section" and Session's "Quiz me on this". */
export function createSetFromQuestions(courseId: CourseId, title: string, questions: Omit<Question, "id" | "setId" | "order">[]): Promise<SetId> {
  return notImplemented();
}

// lib/guides/commands.ts (Guides). The only writer of guides and sections.
export function ensureGuide(courseId: CourseId): Promise<GuideId> {
  return notImplemented(); // outline from materials (model), or "No material yet"
}
export function writeSection(sectionId: SectionId): Promise<void> {
  return notImplemented(); // retrieve per section → ai.run("writeGuideSection") → blocks + footnotes
}
export function markStale(courseId: CourseId, because: string): Promise<void> {
  return notImplemented(); // called by Materials after a new material is ready
}
export function addAnswerToGuide(sectionId: SectionId, message: ChatMessage): Promise<void> {
  return notImplemented();
}

// lib/materials/commands.ts (Materials). The only writer of materials, pages, chunks.
export function addMaterial(file: File, meta: Pick<Material, "courseId" | "kind" | "title" | "lectureNumber">): Promise<MaterialId> {
  return notImplemented(); // writes queued, then runs ingest in the background with progress on `status`
}
export function retryIngest(id: MaterialId): Promise<void> {
  return notImplemented();
}
export function embedCourse(courseId: CourseId): Promise<void> {
  return notImplemented(); // batches of 32 through ai.run("embed"); skips chunks that have one
}

// lib/sample/semester.ts (foundation)
/**
 * Resets the DB and writes the Paper content shifted so the Paper's Monday 26 Oct 2026 lands on the
 * Monday of the week containing `now`. Everything is hand-authored, including the study blocks for
 * Sep 28 – Nov 1 (shifted), so the drawn screens reproduce exactly; the scheduler is not run here.
 */
export function seedSampleSemester(now: Instant): Promise<void> {
  return notImplemented();
}

// lib/chat/use-chat.ts (foundation). The only writer of `chats`.
export declare function useChat(
  scope: ChatScope,
  opts: { courseId: CourseId; context(text: string): Promise<ContextChunk[]>; question?: AskInput["question"] },
): {
  thread: ChatThread | undefined;
  send(text: string, mode: AskMode): Promise<void>;
  stop(): void;
  retry(): Promise<void>;
  busy: boolean;
  budgetHit: boolean;
};

// ───────────────────────────────────────────────────────────────────────────────
// 17. Shell and verification hooks
// ───────────────────────────────────────────────────────────────────────────────

/** `components/shell/nav-items.ts`. Drives the docked sidebar, the focus Sheet and the e2e nav step. */
export declare const NAV_ITEMS: readonly {
  href: "/" | "/calendar" | "/sessions" | "/lectures" | "/practice" | "/guides";
  label: "Today" | "Calendar" | "Study sessions" | "Lecture notes" | "Practice" | "Study guides";
  icon: "Sun" | "Calendar" | "BookOpen" | "Mic" | "SquareCheckBig" | "FileText";
  /** Live badge derived from the DB: a recording lecture, or a running session's remaining time. */
  badge?: "recording" | "session-timer";
}[];

/** `lib/testids.json`, imported by components (`resolveJsonModule`) and by `scripts/e2e/*.mjs`. One list. */
export type TestIds = typeof import("./testids.json");
export declare const T: TestIds;

/** Example of the shape; the real list grows per feature in its own key prefix. */
export const TESTIDS_SHAPE = {
  shell: { sidebar: "shell-sidebar", navSheet: "shell-nav-sheet", spend: "shell-spend" },
  today: { root: "today", headline: "today-headline", loadSample: "today-load-sample", nextUp: "today-next-up", start: "today-start", timeline: "today-timeline", row: "today-row" },
  calendar: { root: "calendar", view: "calendar-view", today: "calendar-today", prev: "calendar-prev", next: "calendar-next", block: "calendar-block", event: "calendar-event", addSchedule: "calendar-add", importDialog: "calendar-import", importCommit: "calendar-import-commit" },
  session: { root: "session", timer: "session-timer", step: "session-step", tabs: "session-tabs", viewer: "session-viewer", nextStep: "session-next", composer: "session-composer", mode: "session-mode", message: "session-message", sourceChip: "session-source", end: "session-end" },
  lecture: { root: "lecture", status: "lecture-status", start: "lecture-start", pause: "lecture-pause", end: "lecture-end", line: "lecture-line", live: "lecture-live", link: "lecture-link", composer: "lecture-composer", summary: "lecture-summary" },
  practice: { root: "practice", option: "practice-option", tile: "practice-tile", topic: "practice-topic", askWhy: "practice-ask", solution: "practice-solution", resource: "practice-resource", write: "practice-write", writeDialog: "practice-write-dialog", nextQuestion: "practice-next" },
  guide: { root: "guide", course: "guide-course", contents: "guide-contents", section: "guide-section", chart: "guide-chart", footnote: "guide-footnote", export: "guide-export", quiz: "guide-quiz" },
  materials: { add: "materials-add", dialog: "materials-dialog", status: "materials-status" },
  source: { sheet: "source-sheet" },
} as const;
