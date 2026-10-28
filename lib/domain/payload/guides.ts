import type { EpochMs } from "../ids";
import type { FootnoteSource } from "../sources";

export type FootnoteN = number;

export interface Point {
  x: number;
  y: number;
}

/** Charts are data. "levels" reproduces Paper's demand panels exactly (study-guide.md §3.3). */
export type ChartSpec =
  | {
      kind: "levels";
      axes: { x: string; y: string };
      domain: { xMax: number; yMax: number };
      curve: { from: Point; to: Point; label: string };
      /** P1, P2; the matching x values are computed from the curve. */
      levels: readonly [y1: number, y2: number];
      levelNames?: readonly [string, string];
    }
  | { kind: "series"; axes: { x: string; y: string }; domain: { xMax: number; yMax: number }; series: readonly { label: string; points: readonly Point[] }[] }
  | { kind: "bars"; axes: { x: string; y: string }; bars: readonly { label: string; value: number }[] };

/** Footnote markers are refs on blocks, never characters in strings. */
export type GuideBlock =
  | { kind: "prose"; text: string; refs: readonly FootnoteN[] }
  | { kind: "formula"; lhs: string; numerator: string; denominator: string; tex?: string; note?: string; noteRefs: readonly FootnoteN[] }
  | { kind: "figure"; panels: readonly { title: string; description: string; chart: ChartSpec }[]; caption: string; refs: readonly FootnoteN[] }
  | {
      kind: "callout";
      /** "Common mistake". */
      label: string;
      /** "will be on the midterm"; drives the ink border. */
      examHint?: string;
      text: string;
      refs: readonly FootnoteN[];
      quote?: { text: string; attribution: string };
    }
  | {
      kind: "code";
      /** "python"; "text" when the source names no language. */
      lang: string;
      /** Never empty. Line breaks and indentation are kept as written. */
      text: string;
      /** Required because the footnote marker sits here: a marker inside the code would be copied with it. */
      caption: string;
      refs: readonly FootnoteN[];
    };

export interface GuideDraft {
  blocks: readonly GuideBlock[];
  footnotes: readonly { n: FootnoteN; sources: readonly FootnoteSource[] }[];
  /** Plain text of the blocks, so Practice can generate questions without knowing GuideBlock. */
  plainText: string;
  generatedAt: EpochMs;
  /** CourseSources.stamp when written. */
  sourceStamp: EpochMs;
}
