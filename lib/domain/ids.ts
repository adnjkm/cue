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

export type EventKind = "lecture" | "lab" | "test" | "deadline" | "busy" | "note";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** FNV-1a 64-bit, base32. Synchronous so ids can be derived inside pure code and render. */
export function hashId(input: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  let out = "";
  for (let i = 0; i < 13; i++) {
    out += BASE32[Number(h & 31n)];
    h >>= 5n;
  }
  return out;
}

function random(chars = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(chars));
  return Array.from(bytes, (b) => BASE32[b & 31]).join("");
}

/** Id constructors are the only way to build ids. They keep ids URL-safe and derived from meaning. */
export const ids = {
  course: (code: string): CourseId => code.toUpperCase().replace(/[^A-Z0-9]/g, "") as CourseId,
  eventFromIcs: (uid: string, recurrenceId?: string): EventId => `evt_${hashId(`ics|${uid}|${recurrenceId ?? ""}`)}` as EventId,
  eventFromSlot: (course: CourseId, kind: EventKind, start: EpochMs): EventId => `evt_${hashId(`slot|${course}|${kind}|${start}`)}` as EventId,
  eventManual: (): EventId => `evt_${random()}` as EventId,
  importBatch: (): ImportId => `imp_${random()}` as ImportId,
  material: (sha256Hex: string): MaterialId => `mat_${sha256Hex.slice(0, 16)}` as MaterialId,
  blob: (sha256Hex: string): BlobId => `blob_${sha256Hex.slice(0, 16)}` as BlobId,
  /** A rendered page image belongs to its material, so removing the material finds it. */
  pageBlob: (material: MaterialId, index: number): BlobId => `blob_${material}_p${index}` as BlobId,
  block: (anchor: BlockAnchor): BlockId => {
    switch (anchor.kind) {
      case "review":
        return `review.${anchor.lecture}.${anchor.n}` as BlockId;
      case "midweek":
        return `midweek.${anchor.course}.${anchor.week}` as BlockId;
      case "endOfWeek":
        return `eow.${anchor.week}` as BlockId;
      case "testPrep":
        return `prep.${anchor.test}.${anchor.index}` as BlockId;
      case "work":
        return `work.${anchor.deadline}.${anchor.index}` as BlockId;
      case "custom":
        return `custom.${anchor.key}` as BlockId;
    }
  },
  lectureForEvent: (event: EventId): LectureId => `lec.${event}` as LectureId,
  adhocLecture: (): LectureId => `lec.adhoc.${random(8)}` as LectureId,
  set: (): SetId => `set_${random()}` as SetId,
  question: (set: SetId, n: number): QuestionId => `${set}.q${n}` as QuestionId,
  section: (course: CourseId, slug: string): SectionId => `${course}.${slug}` as SectionId,
  sectionSlug: (id: SectionId): string => id.slice(id.indexOf(".") + 1),
  chunk: (key: SourceKey, n: number): ChunkId => `${key}#${n}` as ChunkId,
  /** Time-ordered, so message ids sort by creation. */
  message: (): MessageId => `msg_${Date.now().toString(36).padStart(9, "0")}${random(6)}` as MessageId,
  hold: (): HoldId => `hold_${random(12)}` as HoldId,
} as const;

/** URL params are untrusted strings; these parse them back into ids at the route boundary. */
export const parseId = {
  block: (s: string): BlockId | null => (/^(review|midweek|eow|prep|work|custom)\.[\w.-]+$/.test(s) ? (s as BlockId) : null),
  lecture: (s: string): LectureId | null => (/^lec\.[\w.-]+$/.test(s) ? (s as LectureId) : null),
  set: (s: string): SetId | null => (/^set_[\w-]+$/.test(s) ? (s as SetId) : null),
  course: (s: string): CourseId | null => (/^[A-Z0-9]+$/.test(s) ? (s as CourseId) : null),
  question: (s: string): QuestionId | null => (/^set_[\w-]+\.q\d+$/.test(s) ? (s as QuestionId) : null),
} as const;

/** Slugs for section ids: "Price elasticity of demand" -> "price-elasticity-of-demand". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
