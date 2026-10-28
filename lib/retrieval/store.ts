import { db } from "@/lib/db";
import { EMBEDDER, type Chunk, type ChunkDraft, type LectureId, type MaterialId, type Passage, type RetrieveQuery, type SetId, type SourceKey } from "@/lib/domain";
import { ai, AiError } from "@/lib/ai";
import { chunkLecture, chunkMaterial, chunkQuestions, transcriptWindows, withIds } from "./chunk";
import { bm25, buildIndex, cosine, fuse, type Bm25Index } from "./rank";
import { sourceLabel } from "@/lib/sources";

async function draftsFor(key: SourceKey): Promise<ChunkDraft[]> {
  const [kind, rawId] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "mat") {
    const material = await db.materials.get(rawId as MaterialId);
    if (!material) return [];
    return chunkMaterial(material, await db.pages.where("materialId").equals(material.id).toArray());
  }
  if (kind === "lec") {
    const lecture = await db.lectures.get(rawId as LectureId);
    if (!lecture) return [];
    return chunkLecture(lecture, await db.segments.where("lectureId").equals(lecture.id).toArray());
  }
  if (kind === "set") {
    const set = await db.practiceSets.get(rawId as SetId);
    if (!set) return [];
    const questions = await db.questions.where("setId").equals(set.id).toArray();
    const solutions = (await db.solutions.bulkGet(questions.map((q) => q.id))).filter((s) => s !== undefined);
    return chunkQuestions(set, questions, solutions);
  }
  return [];
}

/**
 * Re-chunks one source and replaces its rows in one transaction, so a retried ingest lands on the same rows.
 * Unchanged chunks keep their vectors. The only writer of `chunks`.
 */
export async function reindexSource(key: SourceKey): Promise<void> {
  const drafts = withIds(await draftsFor(key));
  await db.transaction("rw", db.chunks, async () => {
    const old = new Map((await db.chunks.where("sourceKey").equals(key).toArray()).map((c) => [c.id, c]));
    const rows: Chunk[] = drafts.map((d) => {
      const prev = old.get(d.id);
      return prev?.vector && prev.text === d.text ? { ...d, vector: prev.vector } : d;
    });
    await db.chunks.where("sourceKey").equals(key).delete();
    await db.chunks.bulkPut(rows);
  });
}

const indexCache = new Map<string, { stamp: string; index: Bm25Index }>();

async function candidates(q: RetrieveQuery): Promise<Chunk[]> {
  const all = q.courseId ? await db.chunks.where("courseId").equals(q.courseId).toArray() : await db.chunks.toArray();
  if (!q.within?.length) return all;
  const within = new Set(q.within);
  return all.filter((c) => within.has(c.sourceKey));
}

function indexFor(scope: string, chunks: readonly Chunk[]): Bm25Index {
  const stamp = `${chunks.length}|${chunks.reduce((m, c) => (c.id > m ? c.id : m), "")}|${chunks.reduce((n, c) => n + c.text.length, 0)}`;
  const cached = indexCache.get(scope);
  if (cached?.stamp === stamp) return cached.index;
  const index = buildIndex(chunks);
  indexCache.set(scope, { stamp, index });
  return index;
}

async function queryVector(text: string, latency: "interactive" | "thorough"): Promise<Float32Array | null> {
  const call = ai("embed", { texts: [text], as: "query" }).then((r) => r.vectors[0] ?? null);
  if (latency === "thorough") return call.catch(() => null);
  return Promise.race([call.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 500))]);
}

/** Lexical BM25 always; dense cosine when chunks have vectors from the active embedder; reciprocal rank fusion. */
export async function retrieve(q: RetrieveQuery, opts?: { dense?: boolean }): Promise<Passage[]> {
  const chunks = await candidates(q);
  if (chunks.length === 0) return [];
  const scope = `${q.courseId ?? "*"}|${(q.within ?? []).join(",")}`;
  const rankings = [bm25(indexFor(scope, chunks), q.text)];
  const embedded = chunks.filter((c) => c.vector?.by === EMBEDDER);
  if (opts?.dense !== false && embedded.length > 0) {
    const v = await queryVector(q.text, q.latency ?? "thorough");
    if (v) rankings.push(new Map(embedded.map((c) => [c.id, cosine(v, c.vector!.v)])));
  }
  return fuse(chunks, rankings, { k: q.k ?? 8, prefer: q.prefer });
}

/** The live note taker's context: transcript windows read straight from `segments`, no index needed. */
export async function livePassages(lectureId: LectureId, fromMs: number): Promise<Passage[]> {
  const lecture = await db.lectures.get(lectureId);
  if (!lecture) return [];
  const segments = (await db.segments.where("lectureId").equals(lectureId).toArray()).filter((s) => s.endMs > fromMs);
  return transcriptWindows(lecture, segments).map((w, i) => ({ id: `S${i + 1}` as Passage["id"], ref: w.ref, label: sourceLabel(w.ref, "meta"), text: w.text }));
}

/** Embeds chunks missing a vector in batches of 32, in token-factory mode only. Backs off on errors; stops on budget. */
export function startIndexer(signal: AbortSignal): void {
  let delay = 2000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  void (async () => {
    while (!signal.aborted) {
      const pending = (await db.chunks.toArray()).filter((c) => c.vector?.by !== EMBEDDER).slice(0, 32);
      if (pending.length === 0) {
        await sleep(15_000);
        continue;
      }
      try {
        const { vectors } = await ai("embed", { texts: pending.map((c) => c.text.slice(0, 8000)), as: "document" }, { signal });
        await db.transaction("rw", db.chunks, async () => {
          for (const [i, c] of pending.entries()) {
            const current = await db.chunks.get(c.id);
            if (current && current.text === c.text && vectors[i]) await db.chunks.put({ ...current, vector: { by: EMBEDDER, v: vectors[i] } });
          }
        });
        delay = 2000;
      } catch (e) {
        if (e instanceof AiError && (e.kind === "budget" || e.kind === "aborted" || e.kind === "missing_key")) return;
        await sleep(delay);
        delay = Math.min(delay * 2, 120_000);
      }
    }
  })();
}
