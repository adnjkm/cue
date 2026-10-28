import type { ChartSpec, Point } from "@/lib/domain";

/** study-guide.md §3.3, in viewBox units. Only the plot's right edge follows the width, so labels stay 12px. */
export const FRAME = { width: 440, height: 240, left: 50, top: 12, bottom: 204, rightInset: 20, merge: 24 } as const;

export type Tone = "ink" | "graphite";
export interface ChartLabel {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  tone: Tone;
}
export interface ChartStroke {
  d: string;
  kind: "axis" | "guide" | "curve" | "bar" | "series";
  /** Series after the first are told apart by dash pattern, never by color alone. */
  dash?: string;
}
export interface ChartGeometry {
  width: number;
  height: number;
  strokes: ChartStroke[];
  dots: Point[];
  rects: { x: number; y: number; width: number; height: number }[];
  labels: ChartLabel[];
  /** The figure's accessible name, built from the data. */
  description: string;
}

type Levels = Extract<ChartSpec, { kind: "levels" }>;
type Series = Extract<ChartSpec, { kind: "series" }>;
type Bars = Extract<ChartSpec, { kind: "bars" }>;

const r2 = (n: number) => Math.round(n * 100) / 100;
const AXIS_WORDS: Record<string, string> = { P: "Price", Q: "Quantity" };
const word = (axis: string) => AXIS_WORDS[axis] ?? axis;

function plot(width: number) {
  const right = width - FRAME.rightInset;
  return { right, axes: `M${FRAME.left} ${FRAME.top}V${FRAME.bottom}H${r2(right)}` };
}

function scale(domain: { xMax: number; yMax: number }, right: number) {
  return {
    x: (v: number) => FRAME.left + (v / domain.xMax) * (right - FRAME.left),
    y: (v: number) => FRAME.bottom - (v / domain.yMax) * (FRAME.bottom - FRAME.top),
  };
}

/** Q(p) = from.q + (from.p - p) * (to.q - from.q) / (from.p - to.p): the quantity on the curve at a level. */
export function onCurve(curve: Levels["curve"], level: number): number {
  const { from, to } = curve;
  return from.x + ((from.y - level) * (to.x - from.x)) / (from.y - to.y);
}

/** Labels closer than 24px collapse into one at the rounded midpoint, lower value first: "Q2 Q1" left to right, "P1 P2" bottom to top. */
function axisLabels(items: { name: string; at: number; value: number }[], place: (at: number, text: string) => ChartLabel): ChartLabel[] {
  const [a, b] = [...items].sort((p, q) => p.value - q.value);
  if (Math.abs(b.at - a.at) < FRAME.merge) return [place(Math.round((a.at + b.at) / 2), `${a.name} ${b.name}`)];
  return items.map((i) => place(Math.round(i.at), i.name));
}

export function levelsGeometry(spec: Levels, width: number = FRAME.width): ChartGeometry & { quantities: [number, number]; xs: [number, number] } {
  const { right, axes } = plot(width);
  const s = scale(spec.domain, right);
  const [l1, l2] = spec.levels;
  const [p1, p2] = spec.levelNames ?? [`${spec.axes.y}1`, `${spec.axes.y}2`];
  const [n1, n2] = [`${spec.axes.x}1`, `${spec.axes.x}2`];
  const q1 = onCurve(spec.curve, l1);
  const q2 = onCurve(spec.curve, l2);
  const [x1, x2, y1, y2] = [s.x(q1), s.x(q2), s.y(l1), s.y(l2)];
  const from = { x: s.x(spec.curve.from.x), y: s.y(spec.curve.from.y) };
  const to = { x: s.x(spec.curve.to.x), y: s.y(spec.curve.to.y) };
  const lower = from.y > to.y ? from : to;
  const steep = Math.abs((to.y - from.y) / (to.x - from.x)) > 1;
  const curveLabel: ChartLabel = { x: r2(lower.x + (steep ? 8 : 4)), y: r2(lower.y + (steep ? -4 : 18)), text: spec.curve.label, anchor: "start", tone: "ink" };

  const midpoint = Math.abs((q2 - q1) / ((q1 + q2) / 2) / ((l2 - l1) / ((l1 + l2) / 2)));
  const rises = l2 > l1;
  const qFalls = q2 < q1;
  const description =
    `${word(spec.axes.y)} ${rises ? "rises" : "falls"} from ${p1} to ${p2}. ` +
    `${word(spec.axes.x)} ${qFalls ? "falls" : "rises"} from ${n1} to ${n2}, ${midpoint > 1 ? "a large" : "a small"} ${qFalls ? "drop" : "rise"}.`;

  return {
    width,
    height: FRAME.height,
    quantities: [q1, q2],
    xs: [x1, x2],
    strokes: [
      { d: axes, kind: "axis" },
      { d: `M${FRAME.left} ${r2(y2)}H${r2(x2)}V${FRAME.bottom}`, kind: "guide" },
      { d: `M${FRAME.left} ${r2(y1)}H${r2(x1)}V${FRAME.bottom}`, kind: "guide" },
      { d: `M${r2(from.x)} ${r2(from.y)}L${r2(to.x)} ${r2(to.y)}`, kind: "curve" },
      { d: `M${FRAME.left} ${r2(Math.min(y1, y2))}V${r2(Math.max(y1, y2))}`, kind: "bar" },
      { d: `M${r2(Math.min(x1, x2))} ${FRAME.bottom}H${r2(Math.max(x1, x2))}`, kind: "bar" },
    ],
    dots: [
      { x: r2(x2), y: r2(y2) },
      { x: r2(x1), y: r2(y1) },
    ],
    rects: [],
    labels: [
      { x: 40, y: 16, text: spec.axes.y, anchor: "end", tone: "graphite" },
      { x: r2(right), y: 226, text: spec.axes.x, anchor: "end", tone: "graphite" },
      ...axisLabels(
        [
          { name: p2, at: y2, value: l2 },
          { name: p1, at: y1, value: l1 },
        ],
        (at, text) => ({ x: 40, y: at + 4, text, anchor: "end", tone: "ink" }),
      ),
      ...axisLabels(
        [
          { name: n2, at: x2, value: q2 },
          { name: n1, at: x1, value: q1 },
        ],
        (at, text) => ({ x: at, y: 222, text, anchor: "middle", tone: "ink" }),
      ),
      ...(spec.curve.label ? [curveLabel] : []),
    ],
    description,
  };
}

const DASHES = [undefined, "6 4", "2 3"];

export function seriesGeometry(spec: Series, width: number = FRAME.width): ChartGeometry {
  const { right, axes } = plot(width);
  const s = scale(spec.domain, right);
  const strokes: ChartStroke[] = [{ d: axes, kind: "axis" }];
  const labels: ChartLabel[] = [
    { x: 40, y: 16, text: spec.axes.y, anchor: "end", tone: "graphite" },
    { x: r2(right), y: 226, text: spec.axes.x, anchor: "end", tone: "graphite" },
  ];
  spec.series.forEach((line, i) => {
    const pts = [...line.points].sort((a, b) => a.x - b.x).map((p) => ({ x: r2(s.x(p.x)), y: r2(s.y(p.y)) }));
    strokes.push({ d: pts.map((p, j) => `${j ? "L" : "M"}${p.x} ${p.y}`).join(""), kind: "series", ...(DASHES[i] ? { dash: DASHES[i] } : {}) });
    const end = pts[pts.length - 1];
    labels.push({ x: Math.min(end.x + 4, width - 4), y: Math.max(end.y + 4, 16), text: line.label, anchor: end.x + 4 > width - 40 ? "end" : "start", tone: "ink" });
  });
  return {
    width,
    height: FRAME.height,
    strokes,
    dots: [],
    rects: [],
    labels,
    description: `${word(spec.axes.y)} against ${word(spec.axes.x).toLowerCase()}: ${spec.series.map((l) => l.label).join(", ")}.`,
  };
}

export function barsGeometry(spec: Bars, width: number = FRAME.width): ChartGeometry {
  const { right, axes } = plot(width);
  const max = Math.max(...spec.bars.map((b) => b.value)) || 1;
  const slot = (right - FRAME.left) / spec.bars.length;
  const barWidth = Math.min(40, slot * 0.6);
  const top = FRAME.top + 16;
  const rects = spec.bars.map((b, i) => {
    const h = (b.value / max) * (FRAME.bottom - top);
    return { x: r2(FRAME.left + slot * i + (slot - barWidth) / 2), y: r2(FRAME.bottom - h), width: r2(barWidth), height: r2(h) };
  });
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return {
    width,
    height: FRAME.height,
    strokes: [{ d: axes, kind: "axis" }],
    dots: [],
    rects,
    labels: [
      { x: 40, y: 16, text: spec.axes.y, anchor: "end", tone: "graphite" },
      ...spec.bars.flatMap((b, i): ChartLabel[] => [
        { x: r2(rects[i].x + rects[i].width / 2), y: 222, text: b.label, anchor: "middle", tone: "ink" },
        { x: r2(rects[i].x + rects[i].width / 2), y: r2(rects[i].y - 6), text: fmt(b.value), anchor: "middle", tone: "graphite" },
      ]),
    ],
    description: `${word(spec.axes.y)} by ${word(spec.axes.x).toLowerCase()}: ${spec.bars.map((b) => `${b.label} ${fmt(b.value)}`).join(", ")}.`,
  };
}

export function chartGeometry(spec: ChartSpec, width: number = FRAME.width): ChartGeometry {
  switch (spec.kind) {
    case "levels":
      return levelsGeometry(spec, width);
    case "series":
      return seriesGeometry(spec, width);
    case "bars":
      return barsGeometry(spec, width);
  }
}
