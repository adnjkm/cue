import type { BlobId, CourseId, EpochMs, EventId, MaterialId } from "./ids";

export type MaterialKind = "slides" | "textbook" | "handout" | "problemSet" | "pastPaper" | "notes" | "syllabus" | "other";

export interface Material {
  id: MaterialId;
  courseId: CourseId;
  kind: MaterialKind;
  /** "Lecture 8 slides", "Course notes", "A2 handout". */
  title: string;
  /** "A2 handout", used in chips. */
  short?: string;
  /** One field, so the lecture number cannot disagree with the link. */
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
  /** 1-based. */
  index: number;
  /** "p. 214", "Q1". */
  label?: string;
  /** "§5.2" for textbook pages, carried into chunks. */
  section?: string;
  text: string;
  slide?: SlideContent;
  image?: BlobId;
  readBy: "textLayer" | "vision" | "sample" | "failed";
}

export interface BlobRow {
  id: BlobId;
  blob: Blob;
  type: string;
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

export type IngestStatus =
  | { status: "ready" }
  | { status: "pending"; read: number; total: number }
  | { status: "partial"; read: number; failed: number; total: number };

/** Derived from rows, never stored. Pending wins over partial, because Boot resumes pending work first. */
export function ingestStatus(material: Material, pages: readonly Pick<MaterialPage, "index" | "readBy">[]): IngestStatus {
  const total = material.pageCount;
  const indexes = new Set(pages.map((p) => p.index));
  const failed = pages.filter((p) => p.readBy === "failed").length;
  const read = pages.length - failed;
  if (indexes.size < total) return { status: "pending", read, total };
  if (failed > 0) return { status: "partial", read, failed, total };
  return { status: "ready" };
}

/** lib/materials/pages.ts output: JPEG Blobs, not data URLs. Calendar and Practice reuse it. */
export interface RenderedPage {
  index: number;
  image: Blob;
  width: number;
  height: number;
  text: string;
}

/** What a vision task receives. The data URL is made at call time only. */
export interface PageImage {
  page: number;
  image: string;
  text: string;
}
