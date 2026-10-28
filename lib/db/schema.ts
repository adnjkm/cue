import type {
  Attempt,
  AudioChunk,
  BlobId,
  BlobRow,
  BlockId,
  CalendarEvent,
  ChatMessage,
  Chunk,
  ChunkId,
  Course,
  CourseId,
  EventId,
  Guide,
  GuideSection,
  ImportBatch,
  ImportId,
  Lecture,
  LectureId,
  LinkId,
  Material,
  MaterialId,
  MaterialPage,
  MessageId,
  Owner,
  PlanOverride,
  PracticeSet,
  PrefsRow,
  Question,
  QuestionId,
  RelatedLink,
  SectionId,
  Segment,
  SetId,
  Solution,
  StudySession,
} from "@/lib/domain";

/** Row type per table. */
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

/** Primary key type per table, so `db.sessions.get(id)` only takes a BlockId. */
export interface Keys {
  prefs: Owner;
  courses: CourseId;
  events: EventId;
  imports: ImportId;
  overrides: BlockId;
  materials: MaterialId;
  pages: [MaterialId, number];
  blobs: BlobId;
  chunks: ChunkId;
  lectures: LectureId;
  segments: [LectureId, number];
  links: LinkId;
  audio: [LectureId, number];
  sessions: BlockId;
  messages: MessageId;
  practiceSets: SetId;
  questions: QuestionId;
  attempts: QuestionId;
  solutions: QuestionId;
  guides: CourseId;
  guideSections: SectionId;
}

type Leaf = string | number | boolean | bigint | Blob | Float32Array | ReadonlyArray<unknown> | null | undefined;
type KeysOf<T> = T extends unknown ? keyof T & string : never;
/** Dexie key paths of a row type, one level deep: "id", "state.status". A renamed field fails typecheck here. */
export type KeyPath<T> = T extends unknown
  ? { [K in keyof T & string]-?: K | (NonNullable<T[K]> extends Leaf ? never : `${K}.${KeysOf<NonNullable<T[K]>>}`) }[keyof T & string]
  : never;
type IndexEntry<T> = KeyPath<T> | `[${KeyPath<T>}+${KeyPath<T>}]`;
/** Primary key first. */
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

export const TABLE_NAMES = Object.keys(SCHEMA_V1) as TableName[];

export function dexieStores(): Record<TableName, string> {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, SCHEMA_V1[t].join(", ")])) as Record<TableName, string>;
}
