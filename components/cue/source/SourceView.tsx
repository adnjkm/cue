"use client";

import { useEffect, useMemo } from "react";
import { db, useLive } from "@/lib/db";
import type { BlobId, SourceRef } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Prose } from "../Prose";
import { TranscriptLine } from "../TranscriptLine";

function useBlobUrl(id: BlobId | undefined): string | null {
  const row = useLive(() => (id ? db.blobs.get(id) : undefined), [id]);
  const url = useMemo(() => (row ? URL.createObjectURL(row.blob) : null), [row]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function PageSource({ source }: { source: Extract<SourceRef, { kind: "page" }> }) {
  const page = useLive(() => db.pages.get([source.materialId, source.page]), [source.materialId, source.page]);
  const image = useBlobUrl(page?.slide ? undefined : page?.image);
  if (page === undefined) return <p className="text-sm leading-5 text-graphite">This page is no longer stored on this device.</p>;
  if (page.slide) {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-lg leading-6 tracking-display text-ink">{page.slide.heading}</h3>
        {page.slide.body && <Prose text={page.slide.body} className="text-sm leading-5 text-ink" />}
        {page.slide.code && <Prose text={"```\n" + page.slide.code.text + "\n```"} />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local Blob URL, which next/image cannot optimize */}
      {image && <img src={image} alt={`Page ${source.page}`} className="w-full rounded-sm border border-rule" />}
      {!image && <Prose text={page.text} className="text-sm leading-5 text-ink" />}
    </div>
  );
}

function TranscriptSource({ source }: { source: Extract<SourceRef, { kind: "transcript" }> }) {
  const from = source.atMs - 30_000;
  const to = (source.toMs ?? source.atMs) + 60_000;
  const segments = useLive(
    async () => (await db.segments.where("lectureId").equals(source.lectureId).toArray()).filter((s) => s.endMs >= from && s.atMs <= to).sort((a, b) => a.seq - b.seq),
    [source.lectureId, from, to],
  );
  if (!segments) return null;
  if (segments.length === 0) return <p className="text-sm leading-5 text-graphite">This transcript is no longer stored on this device.</p>;
  return (
    <ol className="-mx-4 flex flex-col">
      {segments.map((s) => (
        <TranscriptLine
          key={s.seq}
          atMs={s.atMs}
          text={s.text ?? s.raw}
          state={s.atMs >= source.atMs && s.atMs <= (source.toMs ?? source.atMs) ? "flagged" : "final"}
        />
      ))}
    </ol>
  );
}

/** A slide, page or transcript window, rendered from the database. */
export function SourceView({ source, className }: { source: SourceRef; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {source.kind === "page" && <PageSource source={source} />}
      {source.kind === "transcript" && <TranscriptSource source={source} />}
    </div>
  );
}
