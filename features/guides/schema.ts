import { z } from "zod";
import type { ChartSpec, GuideBlock } from "@/lib/domain";

/** Markers and superscript digits belong in refs, never in the text, so a stray one is stripped. */
function clean(text: string): string {
  return text
    .replace(/\s*\[S\d+(?:\s*,\s*S\d+)*\]/g, "")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

const text = (max: number) => z.string().trim().min(1).max(max).transform(clean);
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v ? clean(v) || undefined : undefined));

const cite = z
  .object({
    passage: z.string().regex(/^S\d+$/),
    relation: z.enum(["used", "tested"]).nullish(),
    note: z.string().max(80).nullish(),
  })
  .transform((c) => ({ passage: c.passage, ...(c.relation ? { relation: c.relation } : {}), ...(c.note?.trim() ? { note: c.note.trim() } : {}) }));

/** How the model cites inside a guide block: one footnote per block, one entry per source. */
export type CiteDraft = z.output<typeof cite>;

const cites = z.array(cite).max(4);

const point = z.object({ x: z.number().min(0), y: z.number().min(0) });
const axes = z.object({ x: z.string().trim().min(1).max(12), y: z.string().trim().min(1).max(12) });
const pair = <T extends z.ZodType>(item: T) => z.array(item).length(2);

const levels = z
  .object({
    kind: z.literal("levels"),
    axes,
    domain: z.object({ xMax: z.number().positive(), yMax: z.number().positive() }),
    curve: z.object({ from: point, to: point, label: z.string().trim().max(4) }),
    levels: pair(z.number().min(0)),
    levelNames: pair(z.string().trim().min(1).max(4)).nullish(),
  })
  .refine((c) => c.curve.from.y !== c.curve.to.y, "The curve must not be flat")
  .refine((c) => {
    const [lo, hi] = [Math.min(c.curve.from.y, c.curve.to.y), Math.max(c.curve.from.y, c.curve.to.y)];
    return c.levels.every((l) => l >= lo && l <= hi && l <= c.domain.yMax);
  }, "Both levels must lie on the curve")
  .refine((c) => [c.curve.from, c.curve.to].every((p) => p.x <= c.domain.xMax && p.y <= c.domain.yMax), "The curve must fit the domain")
  .transform(
    (c): Extract<ChartSpec, { kind: "levels" }> => ({
      kind: "levels",
      axes: c.axes,
      domain: c.domain,
      curve: c.curve,
      levels: [c.levels[0], c.levels[1]],
      ...(c.levelNames ? { levelNames: [c.levelNames[0], c.levelNames[1]] as const } : {}),
    }),
  );

const series = z
  .object({
    kind: z.literal("series"),
    axes,
    domain: z.object({ xMax: z.number().positive(), yMax: z.number().positive() }),
    series: z
      .array(z.object({ label: z.string().trim().min(1).max(24), points: z.array(point).min(2).max(24) }))
      .min(1)
      .max(3),
  })
  .refine((c) => c.series.every((s) => s.points.every((p) => p.x <= c.domain.xMax && p.y <= c.domain.yMax)), "Points must fit the domain");

const bars = z.object({
  kind: z.literal("bars"),
  axes,
  bars: z
    .array(z.object({ label: z.string().trim().min(1).max(16), value: z.number().min(0) }))
    .min(2)
    .max(8),
});

export const chartSpec = z.union([levels, series, bars]);

const prose = z.object({ kind: z.literal("prose"), text: text(1200), refs: cites });

const formula = z
  .object({
    kind: z.literal("formula"),
    lhs: text(40),
    numerator: text(80),
    denominator: text(80),
    note: optionalText(400),
    noteRefs: cites,
  })
  .transform((b) => ({ kind: b.kind, lhs: b.lhs, numerator: b.numerator, denominator: b.denominator, ...(b.note ? { note: b.note } : {}), noteRefs: b.noteRefs }));

const figure = z.object({
  kind: z.literal("figure"),
  panels: z
    .array(z.object({ title: text(60), description: text(160), chart: chartSpec }))
    .min(1)
    .max(2),
  caption: text(200),
  refs: cites,
});

const callout = z
  .object({
    kind: z.literal("callout"),
    label: text(40),
    examHint: optionalText(60),
    text: text(600),
    refs: cites,
    quote: z.object({ text: z.string().trim().max(300), attribution: z.string().trim().max(60) }).nullish(),
  })
  .transform((b) => ({
    kind: b.kind,
    label: b.label,
    ...(b.examHint ? { examHint: b.examHint } : {}),
    text: b.text,
    refs: b.refs,
    ...(b.quote?.text && b.quote.attribution ? { quote: { text: b.quote.text.replace(/^[“"]|[”"]$/g, ""), attribution: b.quote.attribution } } : {}),
  }));

/** One block as guide.section streams it. Cites name passages; the client numbers them into footnotes. */
export const guideBlockDraft = z.union([prose, formula, figure, callout]);
export type GuideBlockDraft = z.output<typeof guideBlockDraft>;

type CitesAsNumbers<B> = B extends unknown ? { [K in keyof B]: K extends "refs" | "noteRefs" ? readonly number[] : B[K] } : never;
/** Fails typecheck when the draft schema drifts from GuideBlock in the payload file. */
export const DRAFT_MATCHES_BLOCK: [CitesAsNumbers<GuideBlockDraft>] extends [GuideBlock] ? true : never = true;

/** Contents carry no numbers, so "Chapter 3: " or "2.1 " from a model is dropped. */
function title(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:(?:chapter|section|part|unit|week|lecture)\s+)?\d+(?:\.\d+)*\s*[.:)\-–—]?\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export const guideOutline = z
  .object({
    chapters: z
      .array(
        z.object({
          title: z.string().min(1).max(80),
          textbookChapter: z.number().int().min(1).max(99).nullish(),
          sections: z.array(z.string().min(1).max(80)).min(1).max(8),
        }),
      )
      .min(1)
      .max(12),
  })
  .transform((o) => {
    const seen = new Set<string>();
    const chapters = o.chapters.flatMap((c) => {
      const sections = c.sections.map(title).filter((s) => s && !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true));
      return sections.length ? [{ title: title(c.title), ...(c.textbookChapter ? { textbookChapter: c.textbookChapter } : {}), sections }] : [];
    });
    return { chapters };
  })
  .refine((o) => o.chapters.length > 0, "The outline has no sections");
export type GuideOutline = z.output<typeof guideOutline>;
