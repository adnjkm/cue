import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { EpochMs, HoldId, MicroUsd } from "@/lib/domain";
import { HOLD_TTL_MS } from "../models";
import { applyReserve, applySettle, emptyLedger, statusOf, type Hold, type LedgerState, type LedgerStore } from "./ledger";

export class LedgerUnreadable extends Error {}

interface FileShape extends LedgerState {
  version: 2;
  /** Mirrors `spent` for a human reading the file. */
  spentUsd: number;
  updatedAt: string;
}

/** The pre-LedgerStore file from lib/spend.ts: dollars as floats. Its spend carries over, rounded up to the micro-dollar. */
interface LegacyShape {
  spentUsd: number;
  calls: number;
  holds?: Record<string, { usd: number; at: number }>;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function fromFile(raw: unknown): LedgerState {
  if (typeof raw !== "object" || raw === null) throw new LedgerUnreadable("Spend ledger is not an object");
  const r = raw as Partial<FileShape & LegacyShape>;
  if (r.version === 2) {
    if (!isNum(r.spent) || !isNum(r.calls) || typeof r.holds !== "object" || typeof r.charged !== "object" || typeof r.settled !== "object") {
      throw new LedgerUnreadable("Spend ledger is missing fields");
    }
    return { spent: r.spent, calls: r.calls, holds: r.holds!, charged: r.charged!, settled: r.settled! };
  }
  if (isNum(r.spentUsd) && isNum(r.calls)) {
    const holds: LedgerState["holds"] = {};
    for (const [id, h] of Object.entries(r.holds ?? {})) holds[id] = { amount: Math.ceil(h.usd * 1e6), expiresAt: h.at + HOLD_TTL_MS };
    return { ...emptyLedger(), spent: Math.ceil(r.spentUsd * 1e6 - 1e-6), calls: r.calls, holds };
  }
  throw new LedgerUnreadable("Spend ledger has an unknown shape");
}

/**
 * Local dev: a JSON file and a promise queue. A missing file is a fresh ledger; a corrupt one fails closed,
 * so deleting half the file can never read as $0 spent.
 */
export class FileLedger implements LedgerStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async read(): Promise<LedgerState> {
    let text: string;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
      throw new LedgerUnreadable(`Spend ledger unreadable: ${(e as Error).message}`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new LedgerUnreadable("Spend ledger is not valid JSON");
    }
    return fromFile(raw);
  }

  private async write(s: LedgerState): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    const body: FileShape = { version: 2, ...s, spentUsd: s.spent / 1e6, updatedAt: new Date().toISOString() };
    await fs.writeFile(tmp, JSON.stringify(body, null, 2));
    await fs.rename(tmp, this.file);
  }

  reserve(hold: Hold, cap: MicroUsd, now: EpochMs) {
    return this.serial(async () => {
      const s = await this.read();
      const r = applyReserve(s, hold, cap, now);
      await this.write(s);
      return r;
    });
  }

  settle(holdId: HoldId, actual: MicroUsd) {
    return this.serial(async () => {
      const s = await this.read();
      applySettle(s, holdId, actual, Date.now());
      await this.write(s);
    });
  }

  status(now: EpochMs) {
    return this.serial(async () => statusOf(await this.read(), now));
  }
}
