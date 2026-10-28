"use client";

import { useEffect, useId } from "react";
import { AiError, errorCopy, useAiStatus } from "@/lib/ai";
import { sectionStale, type CourseSources, type GuideDraft, type GuideSection } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Block, PLACEHOLDER_HEIGHTS } from "./Blocks";
import { Footnotes } from "./Footnotes";
import { numberFootnotes } from "./cites";
import { tid } from "./testids";
import { useSectionJob, writeSection } from "./writer";

const SKELETON = [PLACEHOLDER_HEIGHTS.prose, PLACEHOLDER_HEIGHTS.formula, PLACEHOLDER_HEIGHTS.figure, PLACEHOLDER_HEIGHTS.callout];
/** Long enough that paging through sections with ] does not start a write for each one passed. */
const DWELL_MS = 600;

/**
 * Callout-style box in the figure's border: what failed, how to recover. Try again shows for every error kind,
 * because a persisted budget or key error would otherwise strand the section after the cap is raised or the key added.
 */
export function ErrorBox({ label, error, onRetry, className }: { label: string; error: AiError; onRetry?: () => void; className?: string }) {
  const copy = errorCopy(error);
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-2 rounded-sm border border-border px-6 py-5 max-md:p-4", className)}>
      <p className="text-sm leading-4 font-medium text-ink">{label}</p>
      <p className="max-w-[760px] text-sm leading-[22px] text-ink">
        {copy.title}
        {copy.detail && <span className="text-graphite"> {copy.detail}</span>}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function SectionView({ section, sources }: { section: GuideSection; sources: CourseSources | undefined }) {
  const headingId = useId();
  const job = useSectionJob(section.id);
  const status = useAiStatus();
  const needsWrite = !section.draft && !section.lastError && !job;

  useEffect(() => {
    if (!needsWrite) return;
    const timer = setTimeout(() => void writeSection(section.id), DWELL_MS);
    return () => clearTimeout(timer);
  }, [needsWrite, section.id]);

  const writing = needsWrite || job?.status === "reading" || job?.status === "writing";
  const streamed = job?.status === "writing" ? numberFootnotes(job.drafts, job.passages) : null;
  const saved = job?.status === "saved" && (!section.draft || section.draft.generatedAt < job.draft.generatedAt) ? job.draft : null;
  const shown: Pick<GuideDraft, "blocks" | "footnotes"> | null = streamed ?? saved ?? section.draft ?? null;
  const error = job?.status === "failed" ? job.error : !job && section.lastError && (!section.draft || section.lastError.at > section.draft.generatedAt) ? new AiError(section.lastError.kind, "", undefined, status?.spend?.capUsd) : null;
  const stale = !writing && !error && sources ? sectionStale(section, sources) : { stale: false as const };
  const pending = writing ? (streamed ? SKELETON.slice(streamed.blocks.length).concat(streamed.blocks.length >= SKELETON.length ? [PLACEHOLDER_HEIGHTS.prose] : []) : SKELETON) : [];

  return (
    <article aria-labelledby={headingId} aria-busy={writing || undefined} className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className="text-lg leading-7 font-normal tracking-display text-ink">
          {section.title}
        </h2>
        {writing && (
          <p role="status" className="text-sm leading-5 text-graphite">
            {job?.status === "writing" ? (job.from ? `Writing this section from ${job.from}.` : "Writing this section.") : "Reading the course material for this section…"}
          </p>
        )}
        {stale.stale && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-5 text-graphite">
            <span>{stale.because}. Rewrite this section?</span>
            <Button variant="secondary" onClick={() => void writeSection(section.id, { rewrite: true })}>
              Rewrite
            </Button>
          </div>
        )}
      </div>
      {error && (
        <ErrorBox
          label={section.draft ? "Couldn't rewrite this section" : "Couldn't write this section"}
          error={error}
          onRetry={() => void writeSection(section.id, { rewrite: true })}
        />
      )}
      {shown?.blocks.map((block, i) => (
        <div key={i} data-block="" className={cn("flex min-w-0 flex-col", streamed && "animate-rise")}>
          <Block block={block} footnotes={shown.footnotes} />
        </div>
      ))}
      {pending.map((height, i) => (
        <Skeleton key={i} aria-hidden="true" data-state="generating" data-testid={tid.placeholder} className="bg-wash" style={{ height }} />
      ))}
      {shown && <Footnotes footnotes={shown.footnotes} />}
    </article>
  );
}
