"use client";

import { useId, type ReactNode } from "react";
import type { ChartSpec, GuideBlock, GuideDraft } from "@/lib/domain";
import { footnoteText } from "@/lib/sources";
import { inline } from "@/components/cue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Chart } from "./charts/Chart";

type Footnotes = GuideDraft["footnotes"];

const BOX = "rounded-sm px-6 py-5 max-md:p-4";
const MEASURE = "max-w-[760px]";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Moves focus to a footnote or back to its marker, scrolling it into view, and briefly inks the target row. */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  el.dataset.reached = "";
  setTimeout(() => delete el.dataset.reached, 1500);
}

/** `<sup><a href="#fn-1">1</a></sup>`: real digits at 0.75em, so the line box never grows. */
function Marker({ n, footnotes, interactive }: { n: number; footnotes: Footnotes; interactive: boolean }) {
  const text = footnoteText(footnotes.find((f) => f.n === n)?.sources ?? []);
  if (!interactive) return <sup className="text-[0.75em] leading-[0]">{n}</sup>;
  const link = (
    <a
      href={`#fn-${n}`}
      id={`fnref-${n}`}
      aria-label={`Footnote ${n}`}
      onClick={(e) => {
        e.preventDefault();
        jumpTo(`fn-${n}`);
      }}
      className="relative rounded-xs text-inherit no-underline transition-colors duration-[120ms] ease-standard after:absolute after:-inset-x-1.5 after:-inset-y-2 hover:underline"
    />
  );
  return (
    <sup className="text-[0.75em] leading-[0]">
      {text ? (
        <Tooltip>
          <TooltipTrigger render={link}>{n}</TooltipTrigger>
          <TooltipContent className="max-w-[320px] text-left leading-4">{text}</TooltipContent>
        </Tooltip>
      ) : (
        <a href={`#fn-${n}`} id={`fnref-${n}`} aria-label={`Footnote ${n}`} className="text-inherit">
          {n}
        </a>
      )}
    </sup>
  );
}

function Markers({ refs, footnotes, interactive }: { refs: readonly number[]; footnotes: Footnotes; interactive: boolean }) {
  return refs.map((n) => <Marker key={n} n={n} footnotes={footnotes} interactive={interactive} />);
}

function chartName(title: string, spec: ChartSpec): string {
  if (spec.kind === "levels" && !/\bcurve\.?$/i.test(title)) return `${title} curve.`;
  return /[.!?]$/.test(title) ? title : `${title}.`;
}

function Formula({ block, footnotes, interactive }: { block: Extract<GuideBlock, { kind: "formula" }>; footnotes: Footnotes; interactive: boolean }) {
  const spoken = `${block.lhs} equals ${block.numerator} divided by ${block.denominator}`.replace(/%/g, "percent");
  return (
    <div className={cn(BOX, "flex flex-col gap-2 bg-fill")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="math" aria-label={spoken} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span aria-hidden="true" className="text-lg leading-7 text-ink">
            {block.lhs}
          </span>
          <span aria-hidden="true" className="text-lg leading-7 text-ink">
            =
          </span>
          <span aria-hidden="true" className="flex flex-col items-center gap-1 text-center text-sm leading-[18px] text-ink">
            <span>{block.numerator}</span>
            <span className="h-px shrink-0 self-stretch bg-ink" />
            <span>{block.denominator}</span>
          </span>
        </div>
        {!block.note && <Markers refs={block.noteRefs} footnotes={footnotes} interactive={interactive} />}
      </div>
      {block.note && (
        <p className={cn(MEASURE, "text-sm leading-5 text-graphite")}>
          {block.note}
          <Markers refs={block.noteRefs} footnotes={footnotes} interactive={interactive} />
        </p>
      )}
    </div>
  );
}

function Figure({ block, footnotes, interactive }: { block: Extract<GuideBlock, { kind: "figure" }>; footnotes: Footnotes; interactive: boolean }) {
  return (
    <figure className={cn(BOX, "@container flex flex-col gap-4 border border-border break-inside-avoid")}>
      <div className="flex flex-col gap-6 @min-[688px]:flex-row @min-[688px]:gap-12">
        {block.panels.map((p, i) => (
          <div key={i} className="flex min-w-0 flex-1 basis-0 flex-col gap-2">
            <Chart spec={p.chart} name={chartName(p.title, p.chart)} />
            <p className="text-sm leading-5 font-medium text-ink">{p.title}</p>
            <p className="text-sm leading-5 text-graphite">{p.description}</p>
          </div>
        ))}
      </div>
      <figcaption className="border-t border-rule pt-3 text-sm leading-5 text-ink">
        {block.caption}
        <Markers refs={block.refs} footnotes={footnotes} interactive={interactive} />
      </figcaption>
    </figure>
  );
}

function Callout({ block, footnotes, interactive }: { block: Extract<GuideBlock, { kind: "callout" }>; footnotes: Footnotes; interactive: boolean }) {
  const labelId = useId();
  return (
    <aside role="note" aria-labelledby={labelId} className={cn(BOX, "flex flex-col gap-2 border break-inside-avoid", block.examHint ? "border-ink" : "border-border")}>
      <p id={labelId} className="text-sm leading-4 font-medium text-ink">
        {block.examHint ? `${block.label} · ${block.examHint}` : block.label}
      </p>
      <p className={cn(MEASURE, "text-sm leading-[22px] text-ink")}>
        {inline(block.text)}
        <Markers refs={block.refs} footnotes={footnotes} interactive={interactive} />
      </p>
      {block.quote && (
        <blockquote className={cn(MEASURE, "text-sm leading-[22px] text-graphite")}>
          “{block.quote.text}” {block.quote.attribution}
        </blockquote>
      )}
    </aside>
  );
}

/**
 * study-session.md's Code block: the box hugs the code and scrolls sideways inside the column, never wrapping.
 * On paper there is no scrolling, so print wraps long lines instead of cutting them off.
 */
function Code({ block, footnotes, interactive }: { block: Extract<GuideBlock, { kind: "code" }>; footnotes: Footnotes; interactive: boolean }) {
  const captionId = useId();
  return (
    <figure className="flex min-w-0 flex-col items-start gap-3 break-inside-avoid">
      {/* A named stop, so a keyboard user can scroll a wide block on screen, on the export page too. */}
      <pre
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="w-max max-w-full overflow-x-auto rounded-xs bg-fill px-5 py-4 font-mono text-[13px] leading-[22px] font-normal tracking-normal whitespace-pre text-ink [tab-size:4] print:w-full print:whitespace-pre-wrap"
      >
        <code className={`language-${block.lang}`}>{block.text}</code>
      </pre>
      <figcaption id={captionId} className={cn(MEASURE, "text-sm leading-5 text-ink")}>
        {inline(block.caption)}
        <Markers refs={block.refs} footnotes={footnotes} interactive={interactive} />
      </figcaption>
    </figure>
  );
}

export function Block({ block, footnotes, interactive = true }: { block: GuideBlock; footnotes: Footnotes; interactive?: boolean }): ReactNode {
  switch (block.kind) {
    case "prose":
      return (
        <p className={cn(MEASURE, "text-sm leading-[22px] text-ink")}>
          {inline(block.text)}
          <Markers refs={block.refs} footnotes={footnotes} interactive={interactive} />
        </p>
      );
    case "formula":
      return <Formula block={block} footnotes={footnotes} interactive={interactive} />;
    case "figure":
      return <Figure block={block} footnotes={footnotes} interactive={interactive} />;
    case "callout":
      return <Callout block={block} footnotes={footnotes} interactive={interactive} />;
    case "code":
      return <Code block={block} footnotes={footnotes} interactive={interactive} />;
  }
}

/** Placeholder heights are each block's real box in Paper, so arriving blocks replace them without a jump. */
export const PLACEHOLDER_HEIGHTS = { prose: 44, formula: 113, figure: 387, callout: 140 } as const;
