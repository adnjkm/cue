import { describe, expect, it } from "vitest";
import { layoutLanes, type LaneItem } from "./lanes";

const h = (hours: number) => hours * 60;
const item = (id: string, from: number, to: number, fixed = false): LaneItem => ({ id, start: h(from), end: h(to), fixed });
const lanesOf = (items: LaneItem[], max = 3) => {
  const { visible, overflow } = layoutLanes(items, max);
  return {
    visible: Object.fromEntries(visible.map((v) => [v.item.id, `${v.lane}/${v.lanes}`])),
    overflow: overflow.map((o) => ({ lane: o.lane, lanes: o.lanes, start: o.start / 60, ids: o.items.map((i) => i.id) })),
  };
};

describe("layoutLanes", () => {
  it("gives every item the full column when nothing overlaps", () => {
    expect(lanesOf([item("lec", 10, 11, true), item("review", 11.25, 12), item("psy", 14, 15, true)])).toEqual({
      visible: { lec: "0/1", review: "0/1", psy: "0/1" },
      overflow: [],
    });
  });

  it("treats touching events as not overlapping", () => {
    expect(lanesOf([item("a", 9, 10, true), item("b", 10, 11, true), item("c", 11, 12)]).visible).toEqual({ a: "0/1", b: "0/1", c: "0/1" });
  });

  it("splits an overlapping cluster and puts fixed events in the left lanes", () => {
    expect(lanesOf([item("study", 9.5, 10.5), item("lecture", 10, 11, true)]).visible).toEqual({ lecture: "0/2", study: "1/2" });
  });

  it("sizes each cluster on its own", () => {
    const out = lanesOf([item("a", 9, 10, true), item("b", 9.5, 10.5, true), item("c", 13, 14, true)]);
    expect(out.visible).toEqual({ a: "0/2", b: "1/2", c: "0/1" });
  });

  it("reuses a lane that frees up inside one cluster", () => {
    const out = lanesOf([item("long", 9, 12, true), item("early", 9, 10), item("late", 10, 11)]);
    expect(out.visible).toEqual({ long: "0/2", early: "1/2", late: "1/2" });
  });

  it("folds a fourth overlapping event into a +N chip in the third lane", () => {
    const out = lanesOf([item("l1", 9, 11, true), item("l2", 9, 11, true), item("b1", 9.5, 10.5, true), item("s1", 10, 11)], 3);
    expect(out.visible).toEqual({ l1: "0/3", l2: "1/3" });
    expect(out.overflow).toEqual([{ lane: 2, lanes: 3, start: 9.5, ids: ["b1", "s1"] }]);
  });

  it("allows four lanes in day view", () => {
    const out = lanesOf([item("a", 9, 11, true), item("b", 9, 11, true), item("c", 9.5, 10.5, true), item("d", 10, 11)], 4);
    expect(out.visible).toEqual({ a: "0/4", b: "1/4", c: "2/4", d: "3/4" });
    expect(out.overflow).toEqual([]);
  });

  it("is independent of input order", () => {
    const items = [item("x", 8, 9.5), item("y", 9, 10, true), item("z", 9.25, 9.75)];
    expect(lanesOf([...items].reverse())).toEqual(lanesOf(items));
  });
});
