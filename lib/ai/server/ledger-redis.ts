import "server-only";
import { Redis } from "@upstash/redis";
import type { EpochMs, HoldId, MicroUsd } from "@/lib/domain";
import type { ClientThrottle } from "./throttle";
import { THROTTLE } from "./throttle";
import type { Hold, LedgerStatus, LedgerStore } from "./ledger";

/** The slice of the Upstash client the ledger uses, so tests can run it against an in-memory equivalent. */
export interface RedisLike {
  eval<TData = unknown>(script: string, keys: string[], args: (string | number)[]): Promise<TData>;
}

const PREFIX = "cue:ledger";
export const KEYS = { holds: `${PREFIX}:holds`, spent: `${PREFIX}:spent`, charged: `${PREFIX}:charged`, calls: `${PREFIX}:calls`, settled: (id: string) => `${PREFIX}:settled:${id}` };
const SETTLED_TTL_S = 7 * 24 * 60 * 60;

/**
 * KEYS: holds, spent, charged, calls. ARGV: now, cap, id, amount, expiresAt.
 * Charges every expired hold at its full amount, then refuses if spent + held + amount > cap. Atomic: one script.
 */
export const RESERVE = `
local now = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local spent = tonumber(redis.call('GET', KEYS[2]) or '0')
local held = 0
local holds = redis.call('HGETALL', KEYS[1])
for i = 1, #holds, 2 do
  local amount, expires = string.match(holds[i + 1], '^(%d+):(%d+)$')
  amount = tonumber(amount)
  if tonumber(expires) <= now then
    spent = spent + amount
    redis.call('HDEL', KEYS[1], holds[i])
    redis.call('HSET', KEYS[3], holds[i], amount)
    redis.call('INCR', KEYS[4])
  else
    held = held + amount
  end
end
redis.call('SET', KEYS[2], spent)
if spent + held + tonumber(ARGV[4]) > cap then
  return {0, spent}
end
redis.call('HSET', KEYS[1], ARGV[3], ARGV[4] .. ':' .. ARGV[5])
return {1, spent}
`;

/**
 * KEYS: holds, spent, charged, calls, settled:<id>. ARGV: id, actual, settledTtlSeconds.
 * Idempotent through settled:<id>. A live hold becomes its actual cost; an expired-and-charged one is corrected down.
 */
export const SETTLE = `
if not redis.call('SET', KEYS[5], '1', 'NX', 'EX', tonumber(ARGV[3])) then
  return 0
end
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then
  redis.call('HDEL', KEYS[1], ARGV[1])
  redis.call('INCRBY', KEYS[2], tonumber(ARGV[2]))
  redis.call('INCR', KEYS[4])
  return 1
end
local charged = redis.call('HGET', KEYS[3], ARGV[1])
if charged then
  redis.call('HDEL', KEYS[3], ARGV[1])
  redis.call('INCRBY', KEYS[2], tonumber(ARGV[2]) - tonumber(charged))
  return 2
end
return 3
`;

/** KEYS: holds, spent, calls. ARGV: now. Read-only: expired holds count as spent without being moved. */
export const STATUS = `
local now = tonumber(ARGV[1])
local spent = tonumber(redis.call('GET', KEYS[2]) or '0')
local calls = tonumber(redis.call('GET', KEYS[3]) or '0')
local held = 0
local holds = redis.call('HGETALL', KEYS[1])
for i = 1, #holds, 2 do
  local amount, expires = string.match(holds[i + 1], '^(%d+):(%d+)$')
  if tonumber(expires) <= now then
    spent = spent + tonumber(amount)
    calls = calls + 1
  else
    held = held + tonumber(amount)
  end
end
return {spent, held, calls}
`;

/** KEYS: counter. ARGV: windowMs, limit. Fixed window per client; returns {allowed, msUntilReset}. */
export const TAKE = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
local ttl = redis.call('PTTL', KEYS[1])
if n > tonumber(ARGV[2]) then return {0, ttl} end
return {1, ttl}
`;

/** Vercel: Upstash Redis over REST, reserve and settle as Lua scripts, atomic across every instance. */
export class RedisLedger implements LedgerStore {
  private readonly redis: RedisLike;

  constructor(url: string | RedisLike, token?: string) {
    this.redis = typeof url === "string" ? (new Redis({ url, token: token ?? "" }) as unknown as RedisLike) : url;
  }

  async reserve(hold: Hold, cap: MicroUsd, now: EpochMs): Promise<{ ok: true } | { ok: false; spent: MicroUsd }> {
    const [ok, spent] = await this.redis.eval<[number, number]>(RESERVE, [KEYS.holds, KEYS.spent, KEYS.charged, KEYS.calls], [now, cap, hold.id, hold.amount, hold.expiresAt]);
    return ok === 1 ? { ok: true } : { ok: false, spent: Number(spent) as MicroUsd };
  }

  async settle(holdId: HoldId, actual: MicroUsd): Promise<void> {
    await this.redis.eval(SETTLE, [KEYS.holds, KEYS.spent, KEYS.charged, KEYS.calls, KEYS.settled(holdId)], [holdId, actual, SETTLED_TTL_S]);
  }

  async status(now: EpochMs): Promise<LedgerStatus> {
    const [spent, held, calls] = await this.redis.eval<[number, number, number]>(STATUS, [KEYS.holds, KEYS.spent, KEYS.calls], [now]);
    return { spent: Number(spent) as MicroUsd, held: Number(held) as MicroUsd, calls: Number(calls) };
  }
}

/** The per-client limit shared by every instance, in the same Redis as the ledger. */
export class RedisThrottle implements ClientThrottle {
  private readonly redis: RedisLike;

  constructor(url: string | RedisLike, token?: string) {
    this.redis = typeof url === "string" ? (new Redis({ url, token: token ?? "" }) as unknown as RedisLike) : url;
  }

  async take(clientKey: string) {
    const [ok, ttl] = await this.redis.eval<[number, number]>(TAKE, [`cue:throttle:${clientKey}`], [THROTTLE.windowMs, THROTTLE.limit]);
    return ok === 1 ? { ok: true as const } : { ok: false as const, retryAfterMs: Math.max(0, Number(ttl)) };
  }
}
