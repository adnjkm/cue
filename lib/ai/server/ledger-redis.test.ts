import { describe, expect, it } from "vitest";
import { ledgerContract } from "./ledger.contract";
import { KEYS, RedisLedger, RedisThrottle, RESERVE, SETTLE, STATUS, TAKE, type RedisLike } from "./ledger-redis";
import { THROTTLE } from "./throttle";

/**
 * Redis with the four scripts' steps written out in JS, line for line, over strings and hashes.
 * It is the in-memory Lua equivalent: real Lua runs only against Upstash, when UPSTASH_REDIS_REST_URL is set.
 */
class LuaEquivalent implements RedisLike {
  strings = new Map<string, { value: string; expiresAt?: number }>();
  hashes = new Map<string, Map<string, string>>();
  clock = 0;

  private get(k: string) {
    const v = this.strings.get(k);
    if (v?.expiresAt !== undefined && v.expiresAt <= this.clock) {
      this.strings.delete(k);
      return undefined;
    }
    return v?.value;
  }
  private hash(k: string) {
    let h = this.hashes.get(k);
    if (!h) this.hashes.set(k, (h = new Map()));
    return h;
  }
  private incrby(k: string, n: number) {
    const v = Number(this.get(k) ?? "0") + n;
    this.strings.set(k, { ...this.strings.get(k), value: String(v) });
    return v;
  }

  async eval<T>(script: string, keys: string[], args: (string | number)[]): Promise<T> {
    const a = args.map(String);
    if (script === RESERVE) {
      const [holds, spentKey, charged, calls] = keys;
      const now = Number(a[0]);
      const cap = Number(a[1]);
      let spent = Number(this.get(spentKey) ?? "0");
      let held = 0;
      for (const [id, v] of [...this.hash(holds)]) {
        const [amount, expires] = v.split(":").map(Number);
        if (expires <= now) {
          spent += amount;
          this.hash(holds).delete(id);
          this.hash(charged).set(id, String(amount));
          this.incrby(calls, 1);
        } else held += amount;
      }
      this.strings.set(spentKey, { value: String(spent) });
      if (spent + held + Number(a[3]) > cap) return [0, spent] as T;
      this.hash(holds).set(a[2], `${a[3]}:${a[4]}`);
      return [1, spent] as T;
    }
    if (script === SETTLE) {
      const [holds, spentKey, charged, calls, settled] = keys;
      if (this.get(settled) !== undefined) return 0 as T;
      this.strings.set(settled, { value: "1", expiresAt: this.clock + Number(a[2]) * 1000 });
      if (this.hash(holds).has(a[0])) {
        this.hash(holds).delete(a[0]);
        this.incrby(spentKey, Number(a[1]));
        this.incrby(calls, 1);
        return 1 as T;
      }
      const c = this.hash(charged).get(a[0]);
      if (c !== undefined) {
        this.hash(charged).delete(a[0]);
        this.incrby(spentKey, Number(a[1]) - Number(c));
        return 2 as T;
      }
      return 3 as T;
    }
    if (script === STATUS) {
      const [holds, spentKey, calls] = keys;
      const now = Number(a[0]);
      let spent = Number(this.get(spentKey) ?? "0");
      let n = Number(this.get(calls) ?? "0");
      let held = 0;
      for (const v of this.hash(holds).values()) {
        const [amount, expires] = v.split(":").map(Number);
        if (expires <= now) {
          spent += amount;
          n += 1;
        } else held += amount;
      }
      return [spent, held, n] as T;
    }
    if (script === TAKE) {
      const n = this.incrby(keys[0], 1);
      const entry = this.strings.get(keys[0])!;
      if (n === 1) entry.expiresAt = this.clock + Number(a[0]);
      const ttl = (entry.expiresAt ?? this.clock) - this.clock;
      return (n > Number(a[1]) ? [0, ttl] : [1, ttl]) as T;
    }
    throw new Error("unknown script");
  }
}

ledgerContract("RedisLedger on the in-memory Lua equivalent", async () => new RedisLedger(new LuaEquivalent()));

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (url && token) ledgerContract("RedisLedger on Upstash (real Lua)", async () => new RedisLedger(url, token));
else describe.skip("RedisLedger on Upstash: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to run the real scripts", () => it("skipped", () => expect(KEYS.holds).toBe("cue:ledger:holds")));

describe("RedisThrottle", () => {
  it("allows the window's limit, then answers with the time until it resets", async () => {
    const redis = new LuaEquivalent();
    const throttle = new RedisThrottle(redis);
    for (let i = 0; i < THROTTLE.limit; i++) expect(await throttle.take("ip")).toEqual({ ok: true });
    redis.clock = 60_000;
    expect(await throttle.take("ip")).toEqual({ ok: false, retryAfterMs: THROTTLE.windowMs - 60_000 });
    expect(await throttle.take("other")).toEqual({ ok: true });
  });
});
