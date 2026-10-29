import { afterEach, describe, expect, it } from "vitest";
import { DEMO_CLOCK_SCRIPT, DEMO_KEY } from "./demo-clock";

const RealDate = Date;
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown; Date: DateConstructor };

function runWith(value: string | null) {
  g.localStorage = { getItem: (k: string) => (k === DEMO_KEY ? value : null) };
  g.window = globalThis;
  new Function(DEMO_CLOCK_SCRIPT)();
}

afterEach(() => {
  g.Date = RealDate;
  delete g.window;
  delete g.localStorage;
});

describe("the demo clock script", () => {
  it("shifts now by the stored offset and leaves explicit dates alone", () => {
    const offsetMs = -3 * 86_400_000;
    runWith(JSON.stringify({ offsetMs }));
    const real = RealDate.now();
    expect(Math.abs(Date.now() - (real + offsetMs))).toBeLessThan(1000);
    expect(Math.abs(new Date().getTime() - (real + offsetMs))).toBeLessThan(1000);
    expect(new Date(0).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(new Date(2026, 9, 27).getDate()).toBe(27);
    expect(Date.UTC(2026, 9, 27)).toBe(RealDate.UTC(2026, 9, 27));
    expect(new RealDate(0) instanceof Date).toBe(true);
    expect(typeof Date()).toBe("string");
  });

  it("does nothing without a running demo", () => {
    runWith(JSON.stringify({ exited: true }));
    expect(Date).toBe(RealDate);
    runWith(null);
    expect(Date).toBe(RealDate);
  });
});
