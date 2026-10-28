import { db } from "@/lib/db";
import { ids, ingestStatus, sourceKey, type EpochMs, type IngestOptions, type IngestProgress, type Material, type MaterialId, type MaterialPage, type RenderedPage } from "@/lib/domain";
import { ai } from "@/lib/ai";
import { reindexSource } from "@/lib/retrieval";
import { renderPages, sha256Hex, toPageImage } from "./pages";

const THIN_TEXT = 200;

function titleFrom(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled";
}

/** Reads the given rendered pages into rows: the text layer when it is rich enough, else Super VL three pages at a time. */
async function readPages(material: Material, rendered: readonly RenderedPage[], vision: "auto" | "never", onProgress?: (p: IngestProgress) => void): Promise<void> {
  const total = material.pageCount;
  let done = total - rendered.length;
  const report = (n: number) => onProgress?.({ done: n, total, message: `Reading page ${Math.min(n + 1, total)} of ${total}` });
  const pageRow = (p: RenderedPage, fields: Partial<MaterialPage>): MaterialPage => ({
    materialId: material.id,
    index: p.index,
    text: p.text,
    image: ids.pageBlob(material.id, p.index),
    readBy: "textLayer",
    ...fields,
  });
  await db.transaction("rw", db.blobs, async () => {
    for (const p of rendered) await db.blobs.put({ id: ids.pageBlob(material.id, p.index), blob: p.image, type: "image/jpeg" });
  });
  const thin = vision === "auto" ? rendered.filter((p) => p.text.length < THIN_TEXT) : [];
  const rich = rendered.filter((p) => !thin.includes(p));
  if (rich.length) await db.pages.bulkPut(rich.map((p) => pageRow(p, {})));
  done += rich.length;
  report(done);
  for (let i = 0; i < thin.length; i += 3) {
    const batch = thin.slice(i, i + 3);
    try {
      const { pages } = await ai("material.read", { pages: await Promise.all(batch.map(toPageImage)) });
      await db.pages.bulkPut(
        batch.map((p) => {
          const read = pages.find((r) => r.page === p.index);
          return pageRow(p, read ? { text: read.text, readBy: "vision", ...(read.slide ? { slide: read.slide } : {}), ...(read.section ? { section: read.section } : {}), ...(read.label ? { label: read.label } : {}) } : { readBy: "failed" });
        }),
      );
    } catch {
      await db.pages.bulkPut(batch.map((p) => pageRow(p, { readBy: "failed" })));
    }
    done += batch.length;
    report(done);
  }
}

/**
 * The one way a file enters Cue. Resumable and idempotent: the id is the file hash, pages already read are
 * skipped, and indexing replaces the source's chunks in one transaction.
 */
export async function ingestFile(file: File, opts: IngestOptions, onProgress?: (p: IngestProgress) => void): Promise<MaterialId> {
  const sha = await sha256Hex(file);
  const id = ids.material(sha);
  if (await db.materials.get(id)) {
    await resumeIngest(id, onProgress);
    return id;
  }
  onProgress?.({ done: 0, total: 1, message: "Opening the file" });
  const rendered = await renderPages(file, { onPage: (d, t) => onProgress?.({ done: d - 1, total: t, message: `Rendering page ${d} of ${t}` }) });
  const blobId = ids.blob(sha);
  const material: Material = {
    id,
    courseId: opts.courseId,
    kind: opts.kind,
    title: opts.title ?? titleFrom(file.name),
    ...(opts.lecture ? { lecture: opts.lecture } : {}),
    file: blobId,
    fileName: file.name,
    pageCount: rendered.length,
    addedAt: Date.now() as EpochMs,
  };
  await db.transaction("rw", db.blobs, db.materials, async () => {
    await db.blobs.put({ id: blobId, blob: file, type: file.type || "application/octet-stream" });
    await db.materials.put(material);
  });
  await readPages(material, rendered, opts.vision ?? "auto", onProgress);
  await reindexSource(sourceKey.material(id));
  return id;
}

/** Re-reads missing or failed pages from the stored file. <Boot> calls it for every pending material. */
export async function resumeIngest(id: MaterialId, onProgress?: (p: IngestProgress) => void): Promise<void> {
  const material = await db.materials.get(id);
  if (!material) return;
  const pages = await db.pages.where("materialId").equals(id).toArray();
  if (ingestStatus(material, pages).status === "ready") return;
  const stored = material.file ? await db.blobs.get(material.file) : undefined;
  if (stored) {
    const ok = new Set(pages.filter((p) => p.readBy !== "failed").map((p) => p.index));
    const missing = Array.from({ length: material.pageCount }, (_, i) => i + 1).filter((n) => !ok.has(n));
    const file = new File([stored.blob], material.fileName ?? "material", { type: stored.type });
    await readPages(material, await renderPages(file, { only: missing }), "auto", onProgress);
  }
  await reindexSource(sourceKey.material(id));
}

/** Deletes the material, its pages, blobs and chunks. Citations survive because SourceRef carries its display facts. */
export async function removeMaterial(id: MaterialId): Promise<void> {
  const material = await db.materials.get(id);
  if (!material) return;
  await db.transaction("rw", [db.materials, db.pages, db.blobs, db.chunks], async () => {
    const pages = await db.pages.where("materialId").equals(id).toArray();
    await db.blobs.bulkDelete([...(material.file ? [material.file] : []), ...pages.flatMap((p) => (p.image ? [p.image] : []))]);
    await db.pages.where("materialId").equals(id).delete();
    await db.chunks.where("sourceKey").equals(sourceKey.material(id)).delete();
    await db.materials.delete(id);
  });
}

/** Every material whose pages are not all read, for <Boot> to resume. */
export async function pendingMaterials(): Promise<MaterialId[]> {
  const materials = await db.materials.toArray();
  const out: MaterialId[] = [];
  for (const m of materials) {
    if (ingestStatus(m, await db.pages.where("materialId").equals(m.id).toArray()).status === "pending") out.push(m.id);
  }
  return out;
}
