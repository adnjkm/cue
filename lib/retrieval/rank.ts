import type { Chunk, ChunkId, Passage, SourceKey, SourceRef } from "@/lib/domain";
import { PASSAGE_CHAR_CAP } from "@/lib/ai/passages";
import { sourceLabel } from "@/lib/sources";

const STOP = new Set("a an and are as at be by for from has have how i if in is it its of on or so that the their then there these this to was what when where which who why will with you your do does did can not just".split(" "));

/** Crude suffix stripping, then a trailing e, so delete, deletes and deleting meet at "delet". */
function stem(word: string): string {
  let w = word;
  for (const suffix of ["ing", "ed", "s"]) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w.length > 3 && w.endsWith("e") ? w.slice(0, -1) : w;
}

/** Keeps the exact terms an embedder blurs: `§5.2`, `is_empty`, `2`. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/§\s?\d+(?:\.\d+)*|[a-z0-9_]+/g) ?? [])
    .map((t) => t.replace(/\s/g, ""))
    .filter((t) => !STOP.has(t))
    .map((t) => (t.startsWith("§") || /\d/.test(t) ? t : stem(t)));
}

export interface Bm25Index {
  docs: { id: ChunkId; len: number; tf: Map<string, number> }[];
  df: Map<string, number>;
  avgLen: number;
}

export function buildIndex(chunks: readonly Pick<Chunk, "id" | "text" | "ref">[]): Bm25Index {
  const df = new Map<string, number>();
  const docs = chunks.map((c) => {
    const terms = tokenize(`${c.text} ${sourceLabel(c.ref, "meta")}`);
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { id: c.id, len: terms.length, tf };
  });
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen };
}

export function bm25(index: Bm25Index, query: string, k1 = 1.2, b = 0.75): Map<ChunkId, number> {
  const terms = [...new Set(tokenize(query))];
  const n = index.docs.length;
  const scores = new Map<ChunkId, number>();
  for (const d of index.docs) {
    let s = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const df = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / Math.max(1, index.avgLen)));
    }
    if (s > 0) scores.set(d.id, s);
  }
  return scores;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** The page or transcript minute a chunk belongs to, for the at-most-two-per-place rule. */
function placeOf(ref: SourceRef): string {
  switch (ref.kind) {
    case "page":
      return `${ref.materialId}#${ref.page}`;
    case "transcript":
      return `${ref.lectureId}@${Math.floor(ref.atMs / 60_000)}`;
    case "question":
      return ref.questionId;
    case "assessment":
      return ref.eventId;
    case "section":
      return ref.sectionId;
  }
}

/**
 * Reciprocal rank fusion, Σ 1/(60 + rank), plus a small boost for preferred sources, then at most two
 * passages per page or transcript minute, then the passage text cap. The boost is a tiebreaker worth a few
 * ranks: at 0.005 (the first design) any weak match from the preferred lecture outranked the best passage.
 */
export const PREFER_BOOST = 0.0005;

export function fuse(
  chunks: readonly Chunk[],
  rankings: readonly Map<ChunkId, number>[],
  opts: { k: number; prefer?: readonly SourceKey[] },
): Passage[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const fused = new Map<ChunkId, number>();
  for (const scores of rankings) {
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .forEach(([id], rank) => fused.set(id, (fused.get(id) ?? 0) + 1 / (60 + rank + 1)));
  }
  const prefer = new Set(opts.prefer ?? []);
  for (const [id, s] of fused) if (prefer.has(byId.get(id)!.sourceKey)) fused.set(id, s + PREFER_BOOST);
  const perPlace = new Map<string, number>();
  const out: Passage[] = [];
  let chars = 0;
  for (const [id] of [...fused.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    if (out.length >= opts.k) break;
    const c = byId.get(id)!;
    const place = placeOf(c.ref);
    if ((perPlace.get(place) ?? 0) >= 2) continue;
    const text = c.text.slice(0, Math.max(0, PASSAGE_CHAR_CAP - chars));
    if (!text) break;
    perPlace.set(place, (perPlace.get(place) ?? 0) + 1);
    chars += text.length;
    out.push({ id: `S${out.length + 1}`, ref: c.ref, label: sourceLabel(c.ref, "meta"), text });
  }
  return out;
}
