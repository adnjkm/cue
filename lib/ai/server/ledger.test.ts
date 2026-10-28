import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EpochMs, HoldId, MicroUsd } from "@/lib/domain";
import { ledgerContract } from "./ledger.contract";
import { FileLedger, LedgerUnreadable } from "./ledger-file";
import { MemoryLedger } from "./ledger";

const tmp = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), "cue-ledger-")), "ledger.json");

ledgerContract("FileLedger", async () => new FileLedger(await tmp()));
ledgerContract("MemoryLedger (Lua equivalent)", async () => new MemoryLedger());

describe("FileLedger", () => {
  it("fails closed on a corrupt file instead of reading $0", async () => {
    const file = await tmp();
    await fs.writeFile(file, "{ not json");
    const l = new FileLedger(file);
    await expect(l.reserve({ id: "a" as HoldId, amount: 1 as MicroUsd, expiresAt: 1 as EpochMs }, 10 as MicroUsd, 0 as EpochMs)).rejects.toBeInstanceOf(LedgerUnreadable);
    await expect(l.status(0 as EpochMs)).rejects.toBeInstanceOf(LedgerUnreadable);
  });

  it("carries the pre-LedgerStore file's spend over, rounded up to the micro-dollar", async () => {
    const file = await tmp();
    await fs.writeFile(file, JSON.stringify({ spentUsd: 0.13207058000000005, calls: 24, holds: {}, updatedAt: "2026-10-28T00:45:56.849Z" }));
    const l = new FileLedger(file);
    expect(await l.status(0 as EpochMs)).toEqual({ spent: 132071, held: 0, calls: 24 });
    await l.reserve({ id: "a" as HoldId, amount: 10 as MicroUsd, expiresAt: 10 as EpochMs }, 30_000_000 as MicroUsd, 0 as EpochMs);
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    expect(saved).toMatchObject({ version: 2, spent: 132071, spentUsd: 0.132071, calls: 24 });
  });
});
