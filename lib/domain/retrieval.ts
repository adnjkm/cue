import type { ChunkId, CourseId, LectureId, MaterialId, SetId, SourceKey } from "./ids";
import type { SourceRef } from "./sources";

/** Only one real embedder. Mock and OpenRouter modes run lexical retrieval only (deterministic). */
export type EmbedderId = "qwen3-embedding-8b@1024";
export const EMBEDDER: EmbedderId = "qwen3-embedding-8b@1024";

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

/** A passage as the model sees it: `[S1] Lecture 8 slides · Slide 17\n<text>`. */
export interface Passage {
  id: `S${number}`;
  ref: SourceRef;
  label: string;
  text: string;
}

/** Cite passages in structured output with these ids; resolve them with `refsFor`. */
export type PassageId = Passage["id"];

export interface RetrieveQuery {
  /** null searches every course (the end-of-week review spans them all). */
  courseId: CourseId | null;
  text: string;
  k?: number;
  within?: readonly SourceKey[];
  prefer?: readonly SourceKey[];
  /** interactive: the query embedding gets 500 ms, then lexical only. thorough: waits for it. */
  latency?: "interactive" | "thorough";
}
