import "server-only";
import type { EpochMs } from "@/lib/domain";

export interface ClientThrottle {
  take(clientKey: string, now: EpochMs): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>;
}

export const THROTTLE = { limit: 60, windowMs: 10 * 60_000 } as const;

/** Fixed window per client. In memory locally; RedisThrottle shares it across instances. */
export class MemoryThrottle implements ClientThrottle {
  private readonly windows = new Map<string, { start: number; count: number }>();

  async take(clientKey: string, now: EpochMs) {
    const w = this.windows.get(clientKey);
    if (!w || now - w.start >= THROTTLE.windowMs) {
      this.windows.set(clientKey, { start: now, count: 1 });
      return { ok: true as const };
    }
    if (w.count >= THROTTLE.limit) return { ok: false as const, retryAfterMs: w.start + THROTTLE.windowMs - now };
    w.count++;
    return { ok: true as const };
  }
}
