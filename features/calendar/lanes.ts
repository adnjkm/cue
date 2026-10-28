/** One timed item in a day column. Fixed items (lectures, labs, tests, busy time) take the left lanes first. */
export interface LaneItem {
  id: string;
  start: number;
  end: number;
  fixed: boolean;
}

export interface Laned<T> {
  item: T;
  lane: number;
  /** Lanes in this item's cluster, capped at maxLanes. */
  lanes: number;
}

/** The items a full cluster hides behind one `+N` chip, drawn in the last lane at the first hidden start. */
export interface LaneOverflow<T> {
  lane: number;
  lanes: number;
  start: number;
  items: T[];
}

export interface LaneLayout<T> {
  visible: Laned<T>[];
  overflow: LaneOverflow<T>[];
}

const order = (a: LaneItem, b: LaneItem) =>
  Number(b.fixed) - Number(a.fixed) || a.start - b.start || b.end - b.start - (a.end - a.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Overlap lanes for one day. Items that only touch (one ends as the next starts) do not overlap.
 * A cluster that needs more than `maxLanes` keeps `maxLanes - 1` lanes of items and folds the rest into one overflow.
 */
export function layoutLanes<T extends LaneItem>(items: readonly T[], maxLanes: number): LaneLayout<T> {
  const byStart = [...items].sort((a, b) => a.start - b.start || order(a, b));
  const clusters: T[][] = [];
  let clusterEnd = -Infinity;
  for (const item of byStart) {
    if (item.start < clusterEnd) {
      clusters[clusters.length - 1].push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    } else {
      clusters.push([item]);
      clusterEnd = item.end;
    }
  }

  const visible: Laned<T>[] = [];
  const overflow: LaneOverflow<T>[] = [];
  for (const cluster of clusters) {
    const taken: LaneItem[][] = [];
    const assigned = [...cluster].sort(order).map((item) => {
      let lane = taken.findIndex((used) => used.every((u) => u.end <= item.start || item.end <= u.start));
      if (lane === -1) lane = taken.push([]) - 1;
      taken[lane].push(item);
      return { item, lane };
    });
    const needed = taken.length;
    if (needed <= maxLanes) {
      for (const a of assigned) visible.push({ ...a, lanes: needed });
      continue;
    }
    const hidden: T[] = [];
    for (const a of assigned) {
      if (a.lane < maxLanes - 1) visible.push({ ...a, lanes: maxLanes });
      else hidden.push(a.item);
    }
    hidden.sort((a, b) => a.start - b.start || order(a, b));
    overflow.push({ lane: maxLanes - 1, lanes: maxLanes, start: hidden[0].start, items: hidden });
  }
  visible.sort((a, b) => a.item.start - b.item.start || a.lane - b.lane);
  return { visible, overflow };
}
