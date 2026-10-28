import { describe, expect, it } from "vitest";
import type { ChartSpec } from "@/lib/domain";
import { FRAME, levelsGeometry } from "./geometry";

type Levels = Extract<ChartSpec, { kind: "levels" }>;
const panel = (from: [number, number], to: [number, number], levels: [number, number] = [3.5, 4.5]): Levels => ({
  kind: "levels",
  axes: { x: "Q", y: "P" },
  domain: { xMax: 37, yMax: 8 },
  curve: { from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] }, label: "D" },
  levels,
  levelNames: ["P1", "P2"],
});
const elastic = panel([1.7, 5], [35, 3]);
const inelastic = panel([13.3, 7.5], [20, 0.25]);
const labels = (g: ReturnType<typeof levelsGeometry>) => g.labels.map((l) => `${l.text}@${l.x},${l.y}`);

describe("levelsGeometry reproduces study-guide.md 3.3", () => {
  it("computes the elastic panel's quantities from the line: Q2 10.03 at x 150.25, Q1 26.68 at x 316.75", () => {
    const g = levelsGeometry(elastic);
    expect(g.quantities[1]).toBeCloseTo(10.025, 9);
    expect(g.quantities[0]).toBeCloseTo(26.675, 9);
    expect(g.xs[1]).toBeCloseTo(150.25, 9);
    expect(g.xs[0]).toBeCloseTo(316.75, 9);
  });

  it("computes the inelastic panel's quantities: Q2 16.07 at x 210.72, Q1 17.00 at x 219.97", () => {
    const g = levelsGeometry(inelastic);
    expect(g.quantities[1]).toBeCloseTo(16.07, 2);
    expect(g.quantities[0]).toBeCloseTo(17.0, 2);
    expect(g.xs[1]).toBeCloseTo(210.72, 2);
    expect(g.xs[0]).toBeCloseTo(219.97, 2);
  });

  it("draws the elastic panel in Paper's paint order", () => {
    const g = levelsGeometry(elastic);
    expect(g.strokes.map((s) => `${s.kind} ${s.d}`)).toEqual([
      "axis M50 12V204H420",
      "guide M50 96H150.25V204",
      "guide M50 120H316.75V204",
      "curve M67 84L400 132",
      "bar M50 96V120",
      "bar M150.25 204H316.75",
    ]);
    expect(g.dots).toEqual([
      { x: 150.25, y: 96 },
      { x: 316.75, y: 120 },
    ]);
    expect(labels(g)).toEqual(["P@40,16", "Q@420,226", "P2@40,100", "P1@40,124", "Q2@150,222", "Q1@317,222", "D@404,150"]);
  });

  it("merges Q2 and Q1 into one label at x 215 when they sit under 24px apart", () => {
    const g = levelsGeometry(inelastic);
    expect(labels(g)).toEqual(["P@40,16", "Q@420,226", "P2@40,100", "P1@40,124", "Q2 Q1@215,222", "D@258,194"]);
    expect(g.labels.filter((l) => l.text.startsWith("Q2") || l.text.startsWith("Q1"))).toHaveLength(1);
    expect(g.strokes[3].d).toBe("M183 24L250 198");
  });

  it("keeps P labels apart at exactly 24px and joins them as P1 P2 when closer", () => {
    expect(labels(levelsGeometry(elastic)).filter((l) => l.startsWith("P1") || l.startsWith("P2"))).toEqual(["P2@40,100", "P1@40,124"]);
    const close = levelsGeometry(panel([13.3, 7.5], [20, 0.25], [3.5, 4]));
    expect(labels(close).filter((l) => l.startsWith("P1") || l.startsWith("P2"))).toEqual(["P1 P2@40,118"]);
  });

  it("stays fluid: a 311px chart moves only the plot's right edge, so labels keep their 12px positions", () => {
    const g = levelsGeometry(elastic, 311);
    expect(g.width).toBe(311);
    expect(g.height).toBe(FRAME.height);
    expect(g.strokes[0].d).toBe("M50 12V204H291");
    expect(labels(g).slice(0, 4)).toEqual(["P@40,16", "Q@291,226", "P2@40,100", "P1@40,124"]);
    expect(labels(levelsGeometry(inelastic, 311)).filter((l) => l.startsWith("Q2"))).toHaveLength(1);
  });

  it("describes each panel from its data", () => {
    expect(levelsGeometry(elastic).description).toBe("Price rises from P1 to P2. Quantity falls from Q1 to Q2, a large drop.");
    expect(levelsGeometry(inelastic).description).toBe("Price rises from P1 to P2. Quantity falls from Q1 to Q2, a small drop.");
  });
});
