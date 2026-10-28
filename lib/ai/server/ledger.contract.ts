import { describe, expect, it } from "vitest";
import type { EpochMs, HoldId, MicroUsd } from "@/lib/domain";
import type { LedgerStore } from "./ledger";

const T = 1_800_000_000_000;
const at = (ms: number) => (T + ms) as EpochMs;
const usd = (n: number) => Math.round(n * 1e6) as MicroUsd;
const hold = (id: string, amount: number, expiresIn = 600_000, now = 0) => ({ id: id as HoldId, amount: usd(amount), expiresAt: at(now + expiresIn) });

/** The one behavior every LedgerStore must share: FileLedger, the in-memory Lua equivalent, and Redis when configured. */
export function ledgerContract(name: string, make: () => Promise<LedgerStore>) {
  describe(`LedgerStore contract: ${name}`, () => {
    it("reserves under the cap and refuses a hold that would cross it", async () => {
      const l = await make();
      expect(await l.reserve(hold("a", 6), usd(10), at(0))).toEqual({ ok: true });
      expect(await l.reserve(hold("b", 5), usd(10), at(1))).toEqual({ ok: false, spent: 0 });
      expect(await l.status(at(2))).toEqual({ spent: 0, held: usd(6), calls: 0 });
    });

    it("settles a live hold to the actual cost, once", async () => {
      const l = await make();
      await l.reserve(hold("a", 6), usd(10), at(0));
      await l.settle("a" as HoldId, usd(1.5));
      await l.settle("a" as HoldId, usd(1.5));
      expect(await l.status(at(1))).toEqual({ spent: usd(1.5), held: 0, calls: 1 });
      expect(await l.reserve(hold("b", 8.5), usd(10), at(2))).toEqual({ ok: true });
      expect(await l.reserve(hold("c", 0.01), usd(10), at(3))).toEqual({ ok: false, spent: usd(1.5) });
    });

    it("charges an expired unsettled hold in full, and a late settle corrects it down", async () => {
      const l = await make();
      await l.reserve(hold("dead", 4, 1000), usd(10), at(0));
      expect(await l.reserve(hold("next", 7), usd(10), at(5000))).toEqual({ ok: false, spent: usd(4) });
      expect(await l.status(at(5001))).toEqual({ spent: usd(4), held: 0, calls: 1 });
      await l.settle("dead" as HoldId, usd(0.25));
      expect(await l.status(at(5002))).toEqual({ spent: usd(0.25), held: 0, calls: 1 });
      expect(await l.reserve(hold("next", 7, 600_000, 6000), usd(10), at(6000))).toEqual({ ok: true });
      await l.settle("dead" as HoldId, usd(0.25));
      expect((await l.status(at(6001))).spent).toBe(usd(0.25));
    });

    it("never overshoots the cap under concurrent reserves", async () => {
      const l = await make();
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => l.reserve(hold(`h${i}`, 1), usd(5), at(i))));
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect((await l.status(at(100))).held).toBe(usd(5));
    });

    it("ignores a settle for a hold it never saw", async () => {
      const l = await make();
      await l.settle("ghost" as HoldId, usd(3));
      expect(await l.status(at(0))).toEqual({ spent: 0, held: 0, calls: 0 });
    });
  });
}
