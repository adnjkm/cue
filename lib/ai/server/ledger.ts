import "server-only";
import type { EpochMs, HoldId, MicroUsd } from "@/lib/domain";

export interface Hold {
  id: HoldId;
  amount: MicroUsd;
  expiresAt: EpochMs;
}

export interface LedgerStatus {
  spent: MicroUsd;
  held: MicroUsd;
  calls: number;
}

/** Integer micro-dollars throughout. Every implementation must pass lib/ai/server/ledger.contract.ts. */
export interface LedgerStore {
  /** Atomic: charge expired unsettled holds at full amount, then refuse if spent + held + hold > cap, else add the hold. */
  reserve(hold: Hold, cap: MicroUsd, now: EpochMs): Promise<{ ok: true } | { ok: false; spent: MicroUsd }>;
  /** Idempotent. A live hold is replaced by `actual`; an expired-and-charged hold is corrected down to `actual`. */
  settle(holdId: HoldId, actual: MicroUsd): Promise<void>;
  status(now: EpochMs): Promise<LedgerStatus>;
}

/** The ledger as plain data. FileLedger stores it as JSON; the Redis Lua scripts keep the same fields in keys. */
export interface LedgerState {
  spent: number;
  calls: number;
  holds: Record<string, { amount: number; expiresAt: number }>;
  /** Expired holds already charged in full, waiting for a late settle to correct them. */
  charged: Record<string, number>;
  /** Settled hold ids with when they settled, so a repeated settle is a no-op. */
  settled: Record<string, number>;
}

export const emptyLedger = (): LedgerState => ({ spent: 0, calls: 0, holds: {}, charged: {}, settled: {} });

const SETTLED_KEEP_MS = 7 * 24 * 60 * 60_000;

function chargeExpired(s: LedgerState, now: number) {
  for (const [id, h] of Object.entries(s.holds)) {
    if (h.expiresAt > now) continue;
    s.spent += h.amount;
    s.calls += 1;
    s.charged[id] = h.amount;
    delete s.holds[id];
  }
}

/** Mutates `s`. The same steps as the reserve Lua script in ledger-redis.ts. */
export function applyReserve(s: LedgerState, hold: Hold, cap: number, now: number): { ok: true } | { ok: false; spent: MicroUsd } {
  chargeExpired(s, now);
  const held = Object.values(s.holds).reduce((n, h) => n + h.amount, 0);
  if (s.spent + held + hold.amount > cap) return { ok: false, spent: s.spent as MicroUsd };
  s.holds[hold.id] = { amount: hold.amount, expiresAt: hold.expiresAt };
  return { ok: true };
}

/** Mutates `s`. The same steps as the settle Lua script in ledger-redis.ts. */
export function applySettle(s: LedgerState, id: string, actual: number, now: number): void {
  for (const [sid, at] of Object.entries(s.settled)) if (now - at > SETTLED_KEEP_MS) delete s.settled[sid];
  if (s.settled[id] !== undefined) return;
  s.settled[id] = now;
  const live = s.holds[id];
  if (live) {
    delete s.holds[id];
    s.spent += actual;
    s.calls += 1;
    return;
  }
  const charged = s.charged[id];
  if (charged !== undefined) {
    delete s.charged[id];
    s.spent += actual - charged;
  }
}

export function statusOf(s: LedgerState, now: number): LedgerStatus {
  let spent = s.spent;
  let held = 0;
  let calls = s.calls;
  for (const h of Object.values(s.holds)) {
    if (h.expiresAt <= now) {
      spent += h.amount;
      calls += 1;
    } else held += h.amount;
  }
  return { spent: spent as MicroUsd, held: held as MicroUsd, calls };
}

/** In-memory store with the Redis scripts' semantics. Used by tests and as the reference for the contract. */
export class MemoryLedger implements LedgerStore {
  private state = emptyLedger();
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(fn: () => T): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  reserve(hold: Hold, cap: MicroUsd, now: EpochMs) {
    return this.serial(() => applyReserve(this.state, hold, cap, now));
  }
  settle(holdId: HoldId, actual: MicroUsd) {
    return this.serial(() => applySettle(this.state, holdId, actual, Date.now()));
  }
  status(now: EpochMs) {
    return this.serial(() => statusOf(this.state, now));
  }
}
