import "server-only";
import path from "node:path";
import type { AiMode, MicroUsd } from "@/lib/domain";
import { FileLedger } from "./ledger-file";
import type { LedgerStore } from "./ledger";
import { RedisLedger, RedisThrottle } from "./ledger-redis";
import { MemoryThrottle, type ClientThrottle } from "./throttle";

type Env = Record<string, string | undefined>;

/** CUE_AI=mock wins (refused when VERCEL_ENV=production); then NEBIUS_API_KEY; then LLM_API_KEY; then mock outside production. */
export function aiModeFromEnv(env: Env): AiMode | { error: "missing_key" } {
  if (env.CUE_AI === "mock" && env.VERCEL_ENV !== "production") return "mock";
  if (env.NEBIUS_API_KEY?.trim()) return "token-factory";
  if (env.LLM_API_KEY?.trim()) return "openrouter";
  if (env.NODE_ENV !== "production") return "mock";
  return { error: "missing_key" };
}

/** SPEND_CAP_USD must parse as a positive finite number; anything else fails closed. Unset means $30. */
export function capFromEnv(env: Env): MicroUsd | null {
  const raw = env.SPEND_CAP_USD?.trim();
  if (raw === undefined || raw === "") return 30_000_000 as MicroUsd;
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const usd = Number(raw);
  return Number.isFinite(usd) && usd > 0 ? (Math.round(usd * 1e6) as MicroUsd) : null;
}

/** Redis if configured; the file locally; on Vercel without Redis, null, and every paid call fails closed. */
export function ledgerFromEnv(env: Env): LedgerStore | null {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new RedisLedger(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  if (env.VERCEL) return null;
  return new FileLedger(path.join(process.cwd(), ".data", "spend-ledger.json"));
}

/** Shared across instances when Redis is configured; per process otherwise. */
export function throttleFromEnv(env: Env): ClientThrottle {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new RedisThrottle(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  return new MemoryThrottle();
}
